import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

const COMPRAS_GOV_BASE_URL = "https://dadosabertos.compras.gov.br";
const COMPRAS_GOV_SOURCE = "COMPRAS_GOV";
const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 20;

type AtaTypeValue = "CFTV" | "FIBRA_OPTICA";

type PreviewInput = {
  uasg: string;
  numeroPregao: string;
  anoPregao: string;
  numeroAta?: string;
};

type ImportInput = PreviewInput & {
  ataType: AtaTypeValue;
  coverageGroupId?: string;
  coverageGroupCode?: string;
  coverageGroupName?: string;
  dryRun?: boolean;
};

type ComprasGovListResponse<T> = {
  resultado?: T[];
  totalPaginas?: number;
};

type ComprasGovAta = Record<string, unknown> & {
  numeroAtaRegistroPreco?: string;
  codigoUnidadeGerenciadora?: string;
  nomeUnidadeGerenciadora?: string;
  numeroCompra?: string;
  anoCompra?: string;
  dataVigenciaInicial?: string;
  dataVigenciaFinal?: string;
  numeroControlePncpAta?: string;
};

type ComprasGovAtaItem = Record<string, unknown> & {
  numeroAtaRegistroPreco?: string;
  codigoUnidadeGerenciadora?: string;
  numeroCompra?: string;
  anoCompra?: string;
  numeroItem?: string;
  codigoItem?: number;
  descricaoItem?: string;
  tipoItem?: string;
  quantidadeHomologadaItem?: number;
  quantidadeHomologadaVencedor?: number;
  valorUnitario?: number;
  nomeRazaoSocialFornecedor?: string;
  nomeUnidadeGerenciadora?: string;
  numeroControlePncpAta?: string;
  idCompra?: string;
};

type NormalizedPreviewItem = {
  referenceCode: string;
  description: string;
  unit: string;
  unitPrice: number;
  initialQuantity: number;
  externalItemId: string;
  externalItemNumber: string;
};

type NormalizedPreview = {
  source: typeof COMPRAS_GOV_SOURCE;
  uasg: string;
  numeroPregao: string;
  anoPregao: string;
  ata: {
    number: string;
    type: AtaTypeValue | null;
    vendorName: string | null;
    managingAgency: string | null;
    validFrom: string | null;
    validUntil: string | null;
  };
  coverageGroups: never[];
  items: NormalizedPreviewItem[];
  warnings: string[];
};

export class ComprasGovService {
  private normalizeText(value: unknown) {
    return String(value ?? "").trim();
  }

  private normalizeNumber(value: unknown, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private toDate(value: string | null) {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private normalizeDateString(value: unknown) {
    const text = this.normalizeText(value);
    if (!text) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private async requestComprasGov<T>(path: string, params: Record<string, string | number>) {
    const url = new URL(path, COMPRAS_GOV_BASE_URL);
    for (const [key, value] of Object.entries(params)) {
      if (value === "") continue;
      url.searchParams.set(key, String(value));
    }

    let response: Response;

    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AppError("Falha ao consultar API do Compras.gov.br", 502);
    }

    if (!response.ok) {
      throw new AppError("API do Compras.gov.br retornou erro", 502);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new AppError("Resposta invalida da API do Compras.gov.br", 502);
    }
  }

  private async requestAllPages<T>(path: string, params: Record<string, string | number>) {
    const firstPage = await this.requestComprasGov<ComprasGovListResponse<T>>(path, {
      ...params,
      pagina: 1,
      tamanhoPagina: DEFAULT_PAGE_SIZE,
    });

    const results = [...(firstPage.resultado ?? [])];
    const totalPages = Math.min(firstPage.totalPaginas ?? 1, MAX_PAGES);

    for (let page = 2; page <= totalPages; page += 1) {
      const response = await this.requestComprasGov<ComprasGovListResponse<T>>(path, {
        ...params,
        pagina: page,
        tamanhoPagina: DEFAULT_PAGE_SIZE,
      });
      results.push(...(response.resultado ?? []));
    }

    return results;
  }

  private getYearRange(anoPregao: string) {
    return {
      dataVigenciaInicialMin: `${anoPregao}-01-01`,
      dataVigenciaInicialMax: `${anoPregao}-12-31`,
    };
  }

  private filterAta(input: PreviewInput, ata: ComprasGovAta) {
    const numeroCompra = this.normalizeText(ata.numeroCompra);
    const anoCompra = this.normalizeText(ata.anoCompra);
    const numeroAta = this.normalizeText(ata.numeroAtaRegistroPreco);

    return (
      numeroCompra === input.numeroPregao.trim() &&
      anoCompra === input.anoPregao.trim() &&
      (!input.numeroAta || numeroAta === input.numeroAta.trim())
    );
  }

  private filterItem(input: PreviewInput, item: ComprasGovAtaItem) {
    const numeroCompra = this.normalizeText(item.numeroCompra);
    const anoCompra = this.normalizeText(item.anoCompra);
    const numeroAta = this.normalizeText(item.numeroAtaRegistroPreco);

    return (
      numeroCompra === input.numeroPregao.trim() &&
      anoCompra === input.anoPregao.trim() &&
      (!input.numeroAta || numeroAta === input.numeroAta.trim())
    );
  }

  private async fetchExternalData(input: PreviewInput) {
    const baseParams = {
      codigoUnidadeGerenciadora: input.uasg.trim(),
      numeroAtaRegistroPreco: input.numeroAta?.trim() ?? "",
      ...this.getYearRange(input.anoPregao.trim()),
    };

    const atas = (
      await this.requestAllPages<ComprasGovAta>("/modulo-arp/1_consultarARP", baseParams)
    ).filter((ata) => this.filterAta(input, ata));

    if (atas.length === 0) {
      throw new AppError("Nenhuma ATA encontrada no Compras.gov.br", 404);
    }

    const selectedAta = atas[0];
    const items = (
      await this.requestAllPages<ComprasGovAtaItem>("/modulo-arp/2_consultarARPItem", {
        codigoUnidadeGerenciadora: input.uasg.trim(),
        numeroCompra: input.numeroPregao.trim(),
        ...this.getYearRange(input.anoPregao.trim()),
      })
    ).filter((item) => this.filterItem(input, item));

    return { ata: selectedAta, items };
  }

  private buildPreview(
    input: PreviewInput,
    externalAta: ComprasGovAta,
    externalItems: ComprasGovAtaItem[],
    ataType: AtaTypeValue | null = null
  ): NormalizedPreview {
    const warnings: string[] = [];
    const ataNumber = this.normalizeText(externalAta.numeroAtaRegistroPreco);
    const managingAgency = this.normalizeText(
      externalAta.nomeUnidadeGerenciadora ?? externalAta.codigoUnidadeGerenciadora
    );

    if (!ataType) {
      warnings.push("Tipo da ATA deve ser informado no momento da importacao.");
    }

    if (externalItems.length === 0) {
      warnings.push("Nenhum item foi retornado para os filtros informados.");
    }

    const items = externalItems.map((item, index) => {
      const externalItemNumber = this.normalizeText(item.numeroItem || index + 1);
      const referenceCode = externalItemNumber || this.normalizeText(item.codigoItem || index + 1);
      const description = this.normalizeText(item.descricaoItem) || "Item sem descricao";
      const unit = this.normalizeText(item.tipoItem) || "UN";
      const unitPrice = this.normalizeNumber(item.valorUnitario);
      const initialQuantity = this.normalizeNumber(
        item.quantidadeHomologadaVencedor ?? item.quantidadeHomologadaItem,
        1
      );
      const externalItemId =
        this.normalizeText(item.numeroControlePncpAta) ||
        `${ataNumber || "ATA"}:${referenceCode}`;

      if (!this.normalizeText(item.descricaoItem)) {
        warnings.push(`Item ${referenceCode} sem descricao na origem.`);
      }

      if (!item.valorUnitario) {
        warnings.push(`Item ${referenceCode} sem valor unitario na origem; importado como 0.`);
      }

      return {
        referenceCode,
        description,
        unit,
        unitPrice,
        initialQuantity,
        externalItemId: `${externalItemId}:${externalItemNumber}`,
        externalItemNumber,
      };
    });

    const vendorName =
      this.normalizeText(externalItems.find((item) => item.nomeRazaoSocialFornecedor)?.nomeRazaoSocialFornecedor) ||
      null;

    return {
      source: COMPRAS_GOV_SOURCE,
      uasg: input.uasg.trim(),
      numeroPregao: input.numeroPregao.trim(),
      anoPregao: input.anoPregao.trim(),
      ata: {
        number: `ARP ${ataNumber || input.numeroAta || input.numeroPregao}/${input.anoPregao}`,
        type: ataType,
        vendorName,
        managingAgency: managingAgency || input.uasg.trim(),
        validFrom: this.normalizeDateString(externalAta.dataVigenciaInicial),
        validUntil: this.normalizeDateString(externalAta.dataVigenciaFinal),
      },
      coverageGroups: [],
      items,
      warnings: [...new Set(warnings)],
    };
  }

  async preview(input: PreviewInput) {
    const externalData = await this.fetchExternalData(input);
    return this.buildPreview(input, externalData.ata, externalData.items);
  }

  private async resolveCoverageGroup(ataId: string, data: ImportInput) {
    if (data.coverageGroupId) {
      const group = await prisma.ataCoverageGroup.findFirst({
        where: { id: data.coverageGroupId, ataId },
        select: { id: true, code: true },
      });

      if (!group) {
        throw new AppError("Grupo de cobertura nao encontrado para esta ata", 404);
      }

      return group;
    }

    const code = (data.coverageGroupCode ?? "COMPRAS").trim().toUpperCase();
    const name = (data.coverageGroupName ?? "Compras.gov.br").trim();

    return prisma.ataCoverageGroup.upsert({
      where: {
        ataId_code: {
          ataId,
          code,
        },
      },
      update: {
        name,
      },
      create: {
        ataId,
        code,
        name,
      },
      select: {
        id: true,
        code: true,
      },
    });
  }

  async importAta(data: ImportInput) {
    const externalData = await this.fetchExternalData(data);
    const preview = this.buildPreview(data, externalData.ata, externalData.items, data.ataType);

    if (data.dryRun) {
      return {
        dryRun: true,
        preview,
        imported: {
          ataId: null,
          createdItems: 0,
          updatedItems: 0,
        },
      };
    }

    const externalAtaNumber = this.normalizeText(externalData.ata.numeroAtaRegistroPreco);
    const now = new Date();

    const existingAta = await prisma.ata.findFirst({
      where: {
        externalSource: COMPRAS_GOV_SOURCE,
        externalUasg: data.uasg.trim(),
        externalPregaoNumber: data.numeroPregao.trim(),
        externalPregaoYear: data.anoPregao.trim(),
        externalAtaNumber: externalAtaNumber || null,
      },
      select: { id: true },
    });

    const ataData = {
      number: preview.ata.number,
      type: data.ataType,
      vendorName: preview.ata.vendorName ?? "Fornecedor nao informado",
      managingAgency: preview.ata.managingAgency,
      validFrom: this.toDate(preview.ata.validFrom),
      validUntil: this.toDate(preview.ata.validUntil),
      externalSource: COMPRAS_GOV_SOURCE,
      externalUasg: data.uasg.trim(),
      externalPregaoNumber: data.numeroPregao.trim(),
      externalPregaoYear: data.anoPregao.trim(),
      externalAtaNumber: externalAtaNumber || null,
      externalLastSyncAt: now,
    } satisfies Prisma.AtaUpdateInput;

    const ata = existingAta
      ? await prisma.ata.update({
          where: { id: existingAta.id },
          data: ataData,
          select: { id: true },
        })
      : await prisma.ata.create({
          data: ataData as Prisma.AtaCreateInput,
          select: { id: true },
        });

    const coverageGroup = await this.resolveCoverageGroup(ata.id, data);

    let createdItems = 0;
    let updatedItems = 0;

    for (const item of preview.items) {
      const existingItem = await prisma.ataItem.findUnique({
        where: {
          ataId_coverageGroupId_referenceCode: {
            ataId: ata.id,
            coverageGroupId: coverageGroup.id,
            referenceCode: item.referenceCode,
          },
        },
        select: { id: true },
      });

      await prisma.ataItem.upsert({
        where: {
          ataId_coverageGroupId_referenceCode: {
            ataId: ata.id,
            coverageGroupId: coverageGroup.id,
            referenceCode: item.referenceCode,
          },
        },
        update: {
          description: item.description,
          unit: item.unit.trim().toUpperCase(),
          unitPrice: item.unitPrice.toFixed(2),
          initialQuantity: item.initialQuantity.toFixed(2),
          externalSource: COMPRAS_GOV_SOURCE,
          externalItemId: item.externalItemId,
          externalItemNumber: item.externalItemNumber,
          externalLastSyncAt: now,
        },
        create: {
          ataId: ata.id,
          coverageGroupId: coverageGroup.id,
          referenceCode: item.referenceCode,
          description: item.description,
          unit: item.unit.trim().toUpperCase(),
          unitPrice: item.unitPrice.toFixed(2),
          initialQuantity: item.initialQuantity.toFixed(2),
          externalSource: COMPRAS_GOV_SOURCE,
          externalItemId: item.externalItemId,
          externalItemNumber: item.externalItemNumber,
          externalLastSyncAt: now,
        },
      });

      if (existingItem) {
        updatedItems += 1;
      } else {
        createdItems += 1;
      }
    }

    return {
      dryRun: false,
      preview,
      imported: {
        ataId: ata.id,
        coverageGroupId: coverageGroup.id,
        coverageGroupCode: coverageGroup.code,
        createdItems,
        updatedItems,
      },
    };
  }
}
