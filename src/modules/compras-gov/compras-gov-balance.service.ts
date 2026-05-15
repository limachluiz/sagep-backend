import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";

const COMPRAS_GOV_BASE_URL = "https://dadosabertos.compras.gov.br";
const COMPRAS_GOV_SOURCE = "COMPRAS_GOV";
const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 20;
const RATE_LIMIT_WARNING =
  "Limite de requisições do Compras.gov.br atingido. Tente novamente em alguns segundos.";

type ComprasGovListResponse<T> = {
  resultado?: T[];
  totalPaginas?: number;
};

type ComprasGovEmpenhoSaldoItem = Record<string, unknown> & {
  numeroItem?: string;
  unidade?: string;
  tipo?: string;
  quantidadeRegistrada?: number;
  quantidadeEmpenhada?: number;
  saldoEmpenho?: number;
  dataHoraAtualizacao?: string;
};

type ComprasGovAtaItem = Record<string, unknown> & {
  numeroAtaRegistroPreco?: string;
  codigoUnidadeGerenciadora?: string;
  numeroCompra?: string;
  anoCompra?: string;
  numeroItem?: string;
  codigoItem?: number;
  descricaoItem?: string;
  quantidadeHomologadaItem?: number;
  quantidadeHomologadaVencedor?: number;
  valorUnitario?: number;
  nomeRazaoSocialFornecedor?: string;
  numeroControlePncpAta?: string;
  dataHoraAtualizacao?: string;
};

type ComprasGovUnidadeItem = Record<string, unknown> & {
  numeroAta?: string;
  unidadeGerenciadora?: string;
  numeroItem?: string;
  fornecedor?: string;
  quantidadeRegistrada?: number;
  quantidadeEmpenhada?: number;
  saldoEmpenho?: number;
  saldoParaEmpenho?: number;
  saldoRemanejamentoEmpenho?: number;
  numeroEmpenho?: string;
  codigoUnidade?: string;
  nomeUnidade?: string;
  tipoUnidade?: string;
  valor?: number;
  valorEmpenhado?: number;
  dataEmpenho?: string;
  dataHoraAtualizacao?: string;
};

type ComprasGovAdesaoItem = Record<string, unknown> & {
  numeroAta?: string;
  unidadeGerenciadora?: string;
  unidadeNaoParticipante?: string;
  numeroEmpenho?: string;
  dataAprovacaoAnalise?: string;
  quantidadeAprovadaAdesao?: number;
  quantidadeEmpenhada?: number;
  valor?: number;
};

type ExternalCommitment = {
  numeroEmpenho: string | null;
  unidade: string | null;
  tipoUnidade: string | null;
  fornecedor: string | null;
  dataEmpenho: Date | null;
  quantidadeIncluida: string | null;
  quantidadeEmpenhada: string | null;
  estimatedAmount: string | null;
  affectsManagedBalance: boolean;
  rawKeyDebug?: {
    availableKeys: string[];
    sourceEndpoint: string;
    item: string | null;
    unidade: string | null;
  };
};

type ExternalUsageStatus =
  | "SEM_USO_EXTERNO"
  | "ADESAO_DETECTADA"
  | "CONSUMO_GERENCIADORA_DETECTADO"
  | "CONSUMO_GERENCIADORA_E_ADESAO_DETECTADOS";

type ManagedExternalBalance = {
  unitCode: string | null;
  unitName: string | null;
  registeredQuantity: Prisma.Decimal;
  committedQuantity: Prisma.Decimal;
  availableQuantity: Prisma.Decimal;
  commitments: ExternalCommitment[];
};

type AdhesionExternalBalance = {
  limitQuantity: Prisma.Decimal;
  approvedQuantity: Prisma.Decimal;
  committedQuantity: Prisma.Decimal;
  availableQuantity: Prisma.Decimal;
  adhesions: ExternalCommitment[];
};

type ExternalRequestDebug = {
  url: string;
  status?: number;
  body?: string;
  recordsReturned?: number;
  sampleRecords?: unknown[];
  ataNumberTried?: string;
  matchKey?: string;
  sampleCommitments?: ExternalCommitment[];
  unidadesEncontradas?: unknown[];
  unidadePrincipalSelecionada?: unknown;
  empenhosGerenciadora?: ExternalCommitment[];
  empenhosNaoParticipantes?: ExternalCommitment[];
  rawUnidadesItem?: unknown[];
  rawEmpenhosSaldoItem?: unknown[];
  rawAdesoesItem?: unknown[];
  unidadeGerenciadoraSelecionada?: unknown;
  saldoGerenciadoraCalculado?: {
    registeredQuantity: string;
    committedQuantity: string;
    availableQuantity: string;
  };
  commitmentsGerenciadoraNormalizados?: ExternalCommitment[];
  commitmentsNaoParticipantesNormalizados?: ExternalCommitment[];
  unmatchedLocalItems?: Array<{
    id: string;
    referenceCode: string;
    externalItemNumber: string | null;
  }>;
};

type ExternalRequestError = Error & {
  status?: number;
  url?: string;
  body?: string;
  network?: boolean;
  retryAfterSeconds?: number | null;
};

type BalanceComparisonStatus =
  | "OK"
  | "DIVERGENTE"
  | "CONSUMO_EXTERNO_DETECTADO"
  | "NAO_SINCRONIZADO"
  | "NAO_ENCONTRADO"
  | "ERRO_CONSULTA_EXTERNA"
  | "RATE_LIMIT_COMPRAS_GOV"
  | "SEM_EMPENHO_REGISTRADO";

type ExternalBalance = {
  externalItemNumber: string;
  source: "COMPRAS_GOV" | "COMPRAS_GOV_IMPORT_FALLBACK";
  managedBalance: ManagedExternalBalance;
  adhesionBalance: AdhesionExternalBalance;
  nonParticipantCommitments: ExternalCommitment[];
  externalUsageStatus: ExternalUsageStatus;
  lastUpdatedAt: Date | null;
  rawRecords: number;
  matchKey?: string;
};

type LocalItem = {
  id: string;
  ataItemCode: number;
  referenceCode: string;
  description: string;
  unitPrice: Prisma.Decimal;
  initialQuantity: Prisma.Decimal;
  externalItemNumber: string | null;
  externalItemId: string | null;
  externalSource: string | null;
  externalLastSyncAt: Date | null;
};

type SnapshotExternalBalance = {
  externalItemNumber: string;
  source: "COMPRAS_GOV" | "COMPRAS_GOV_IMPORT_FALLBACK";
  managedBalance: {
    unitCode: string | null;
    unitName: string | null;
    registeredQuantity: string;
    committedQuantity: string;
    availableQuantity: string;
    commitments: ExternalCommitment[];
  };
  adhesionBalance: {
    limitQuantity: string;
    approvedQuantity: string;
    committedQuantity: string;
    availableQuantity: string;
    adhesions: ExternalCommitment[];
  };
  nonParticipantCommitments: ExternalCommitment[];
  externalUsageStatus: ExternalUsageStatus;
  lastUpdatedAt: Date | null;
  rawRecords: number;
};

function decimal(value: Prisma.Decimal | number | string | null | undefined) {
  return new Prisma.Decimal(value ?? 0).toDecimalPlaces(2);
}

export class ComprasGovBalanceService {
  private requestDebug: ExternalRequestDebug[] = [];

  private normalizeText(value: unknown) {
    return String(value ?? "").trim();
  }

  private normalizeItemNumber(value: unknown) {
    const text = this.normalizeText(value);
    const digits = text.match(/\d+/g)?.join("") ?? "";
    const withoutLeadingZeros = digits.replace(/^0+/, "");
    return withoutLeadingZeros || (digits ? "0" : text);
  }

  private isDevelopment() {
    return process.env.NODE_ENV === "development";
  }

  private resetDebug() {
    this.requestDebug = [];
  }

  private summarizeBody(body: string) {
    return body.replace(/\s+/g, " ").trim().slice(0, 500);
  }

  private extractRetryAfterSeconds(body: string, retryAfterHeader?: string | null) {
    if (retryAfterHeader !== null && retryAfterHeader !== undefined && retryAfterHeader !== "") {
      const headerSeconds = Number(retryAfterHeader);
      if (Number.isFinite(headerSeconds) && headerSeconds >= 0) {
        return headerSeconds;
      }
    }

    const match = body.match(/try again in\s+(\d+)\s+seconds?/i);
    if (!match) return null;

    const seconds = Number(match[1]);
    return Number.isFinite(seconds) ? seconds : null;
  }

  private isRateLimitError(error: ExternalRequestError | null | undefined) {
    return error?.status === 429;
  }

  private getDebug() {
    return this.isDevelopment() ? this.requestDebug : undefined;
  }

  private normalizeNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private normalizeDate(value: unknown) {
    const text = this.normalizeText(value);
    if (!text) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private pickText(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const text = this.normalizeText(record[key]);
      if (text) return text;
    }
    return null;
  }

  private pickNumber(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      if (record[key] === null || record[key] === undefined || record[key] === "") continue;
      return decimal(this.normalizeNumber(record[key]));
    }
    return null;
  }

  private parseExternalItemId(externalItemId: string | null) {
    const text = this.normalizeText(externalItemId);
    if (!text) return { numeroControlePncpAta: null, numeroItem: null };

    const parts = text.split(":").map((part) => part.trim()).filter(Boolean);
    return {
      numeroControlePncpAta: parts[0] ?? null,
      numeroItem: parts[1] ?? null,
    };
  }

  private buildCommitment(
    record: Record<string, unknown>,
    options?: {
      unidade?: string | null;
      tipoUnidade?: string | null;
      fornecedor?: string | null;
      affectsManagedBalance?: boolean;
      quantidadeEmpenhada?: Prisma.Decimal | null;
      sourceEndpoint?: string;
      item?: string | null;
    }
  ): ExternalCommitment | null {
    const numeroEmpenho = this.pickText(record, [
      "numeroEmpenho",
      "documento",
      "numeroDocumento",
      "numeroNotaEmpenho",
      "notaEmpenho",
      "empenho",
      "numeroNE",
      "numeroNe",
      "ne",
      "notaDeEmpenho",
      "numeroNota",
    ]);
    const quantidadeEmpenhada =
      options?.quantidadeEmpenhada ??
      this.pickNumber(record, [
        "quantidadeEmpenhada",
        "qtdEmpenhada",
        "quantidade",
        "quantidadeIncluida",
        "quantidadeEmpenho",
        "qtdEmpenho",
        "quantidadeUtilizada",
        "qtdUtilizada",
        "quantidadeAprovadaAdesao",
      ]);
    const quantidadeIncluida = this.pickNumber(record, [
      "quantidadeIncluida",
      "quantidadeAprovadaAdesao",
      "quantidade",
    ]);
    const valor = this.pickNumber(record, [
      "valor",
      "valorEmpenhado",
      "valorDocumento",
      "valorTotal",
    ]);

    if (!numeroEmpenho && !quantidadeEmpenhada && !quantidadeIncluida && !valor) return null;

    return {
      numeroEmpenho,
      unidade:
        options?.unidade ??
        this.pickText(record, ["unidade", "codigoUnidade", "unidadeNaoParticipante"]),
      tipoUnidade: options?.tipoUnidade ?? this.pickText(record, ["tipoUnidade"]),
      fornecedor:
        options?.fornecedor ??
        this.pickText(record, [
          "fornecedor",
          "nomeFornecedor",
          "fornecedorNome",
          "niFornecedor",
          "cpfCnpjFornecedor",
          "razaoSocialFornecedor",
          "nomeRazaoSocialFornecedor",
          "credor",
        ]),
      dataEmpenho: this.normalizeDate(
        record.dataEmpenho ??
          record.dataDocumento ??
          record.dataEmissao ??
          record.dataInclusao ??
          record.dataHoraInclusao ??
          record.dataAprovacaoAnalise
      ),
      quantidadeIncluida: quantidadeIncluida?.toString() ?? null,
      quantidadeEmpenhada: quantidadeEmpenhada?.toString() ?? null,
      estimatedAmount: valor?.toString() ?? null,
      affectsManagedBalance: options?.affectsManagedBalance ?? true,
      ...(this.isDevelopment()
        ? {
            rawKeyDebug: {
              availableKeys: Object.keys(record).sort(),
              sourceEndpoint: options?.sourceEndpoint ?? "unknown",
              item: options?.item ?? this.pickText(record, ["numeroItem"]) ?? null,
              unidade:
                options?.unidade ??
                this.pickText(record, [
                  "codigoUnidade",
                  "nomeUnidade",
                  "unidade",
                  "unidadeNaoParticipante",
                ]),
            },
          }
        : {}),
    };
  }

  private buildEmptyManagedBalance(
    overrides?: Partial<Pick<ManagedExternalBalance, "unitCode" | "unitName">>
  ): ManagedExternalBalance {
    return {
      unitCode: overrides?.unitCode ?? null,
      unitName: overrides?.unitName ?? null,
      registeredQuantity: decimal(0),
      committedQuantity: decimal(0),
      availableQuantity: decimal(0),
      commitments: [],
    };
  }

  private buildEmptyAdhesionBalance(): AdhesionExternalBalance {
    return {
      limitQuantity: decimal(0),
      approvedQuantity: decimal(0),
      committedQuantity: decimal(0),
      availableQuantity: decimal(0),
      adhesions: [],
    };
  }

  private getApprovedQuantityFromAdhesion(record: Record<string, unknown>) {
    return this.pickNumber(record, [
      "quantidadeAprovadaAdesao",
      "quantidadeRegistrada",
      "quantidadeIncluida",
      "quantidade",
    ]);
  }

  private resolveExternalUsageStatus(balance: {
    managedBalance: ManagedExternalBalance;
    adhesionBalance: AdhesionExternalBalance;
  }): ExternalUsageStatus {
    const hasManagedConsumption = balance.managedBalance.committedQuantity.greaterThan(0);
    const hasAdhesionUsage =
      balance.adhesionBalance.approvedQuantity.greaterThan(0) ||
      balance.adhesionBalance.committedQuantity.greaterThan(0) ||
      balance.adhesionBalance.adhesions.length > 0;

    if (hasManagedConsumption && hasAdhesionUsage) {
      return "CONSUMO_GERENCIADORA_E_ADESAO_DETECTADOS";
    }
    if (hasManagedConsumption) {
      return "CONSUMO_GERENCIADORA_DETECTADO";
    }
    if (hasAdhesionUsage) {
      return "ADESAO_DETECTADA";
    }
    return "SEM_USO_EXTERNO";
  }

  private getAvailableQuantityFromUnit(record: Record<string, unknown>) {
    return (
      this.pickNumber(record, [
        "saldoParaEmpenho",
        "saldoParaEmpenhar",
        "saldoEmpenho",
        "saldoRemanejamentoEmpenho",
        "saldo",
        "quantidadeSaldo",
      ]) ??
      decimal(0)
    );
  }

  private getCommittedQuantityFromUnit(record: Record<string, unknown>) {
    const committed = this.pickNumber(record, [
      "quantidadeEmpenhada",
      "qtdEmpenhada",
      "quantidadeEmpenho",
      "qtdEmpenho",
      "quantidadeUtilizada",
      "qtdUtilizada",
    ]);
    if (committed) return committed;

    const registered = this.pickNumber(record, ["quantidadeRegistrada"]) ?? decimal(0);
    const available = this.getAvailableQuantityFromUnit(record);
    const inferred = registered.sub(available);
    return inferred.greaterThan(0) ? inferred : decimal(0);
  }

  private getUnitCode(record: Record<string, unknown>) {
    const code = this.pickText(record, ["codigoUnidade", "unidade"]);
    if (code) return code.split(/\s+-\s+/)[0]?.trim() ?? code;

    return null;
  }

  private isManagedUnit(record: Record<string, unknown>, managedUasg: string | null) {
    const unitCode = this.getUnitCode(record);
    const type = this.normalizeText(record.tipoUnidade).toUpperCase();
    return Boolean(
      (managedUasg && unitCode === managedUasg) ||
        type.includes("GERENCIADORA") ||
        type.includes("GERENCIADOR")
    );
  }

  private hasCommitmentNumber(record: Record<string, unknown>) {
    return Boolean(
      this.pickText(record, [
        "numeroEmpenho",
        "documento",
        "numeroDocumento",
        "numeroNotaEmpenho",
        "notaEmpenho",
        "empenho",
        "numeroNE",
        "numeroNe",
        "ne",
        "notaDeEmpenho",
        "numeroNota",
      ])
    );
  }

  private getAtaNumberCandidates(ataNumber: string | null) {
    const raw = this.normalizeText(ataNumber);
    if (!raw) return [];

    const numberPart = raw.split("/")[0] ?? raw;
    const strippedNumber = this.normalizeItemNumber(numberPart);
    return [...new Set([raw, numberPart, strippedNumber, `ARP ${raw}`].filter(Boolean))];
  }

  private async requestComprasGov<T>(
    path: string,
    params: Record<string, string | number>,
    context?: { ataNumberTried?: string; matchKey?: string }
  ) {
    console.info("external API called", {
      path,
      ataNumberTried: context?.ataNumberTried ?? null,
      matchKey: context?.matchKey ?? null,
    });
    const url = new URL(path, COMPRAS_GOV_BASE_URL);
    for (const [key, value] of Object.entries(params)) {
      if (value === "") continue;
      url.searchParams.set(key, String(value));
    }

    let response: Response;
    const debugEntry: ExternalRequestDebug = {
      url: url.toString(),
      ataNumberTried: context?.ataNumberTried,
      matchKey: context?.matchKey,
    };
    this.requestDebug.push(debugEntry);

    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      const error = new Error("Falha ao consultar saldo externo do Compras.gov.br") as ExternalRequestError;
      error.url = url.toString();
      error.network = true;
      debugEntry.body = error.message;
      throw error;
    }

    debugEntry.status = response.status;

    if (!response.ok) {
      const body = this.summarizeBody(await response.text());
      const error = new Error("API do Compras.gov.br retornou erro ao consultar saldo externo") as ExternalRequestError;
      error.status = response.status;
      error.url = url.toString();
      error.body = body;
      error.retryAfterSeconds =
        response.status === 429
          ? this.extractRetryAfterSeconds(body, response.headers.get("retry-after"))
          : null;
      debugEntry.body = body;
      throw error;
    }

    try {
      const data = (await response.json()) as T;
      const listData = data as ComprasGovListResponse<unknown>;
      if (Array.isArray(listData.resultado)) {
        debugEntry.recordsReturned = listData.resultado.length;
        debugEntry.sampleRecords = listData.resultado.slice(0, 3);
      }
      return data;
    } catch {
      throw new AppError("Resposta invalida da API do Compras.gov.br", 502);
    }
  }

  private async requestAllPages<T>(
    path: string,
    params: Record<string, string | number>,
    context?: { ataNumberTried?: string; matchKey?: string }
  ) {
    const firstPage = await this.requestComprasGov<ComprasGovListResponse<T>>(
      path,
      {
        ...params,
        pagina: 1,
        tamanhoPagina: DEFAULT_PAGE_SIZE,
      },
      context
    );

    const results = [...(firstPage.resultado ?? [])];
    const totalPages = Math.min(firstPage.totalPaginas ?? 1, MAX_PAGES);

    for (let page = 2; page <= totalPages; page += 1) {
      const response = await this.requestComprasGov<ComprasGovListResponse<T>>(
        path,
        {
          ...params,
          pagina: page,
          tamanhoPagina: DEFAULT_PAGE_SIZE,
        },
        context
      );
      results.push(...(response.resultado ?? []));
    }

    return results;
  }

  private async getAtaWithItems(ataId: string) {
    const ata = await prisma.ata.findUnique({
      where: { id: ataId },
      select: {
        id: true,
        ataCode: true,
        number: true,
        externalSource: true,
        externalUasg: true,
        externalPregaoNumber: true,
        externalPregaoYear: true,
        externalAtaNumber: true,
        externalLastSyncAt: true,
        items: {
          where: { deletedAt: null },
          select: {
            id: true,
            ataItemCode: true,
            referenceCode: true,
            description: true,
            unitPrice: true,
            initialQuantity: true,
            externalItemId: true,
            externalItemNumber: true,
            externalSource: true,
            externalLastSyncAt: true,
          },
          orderBy: { ataItemCode: "asc" },
        },
      },
    });

    if (!ata) {
      throw new AppError("ATA nao encontrada", 404);
    }

    if (ata.externalSource !== COMPRAS_GOV_SOURCE || !ata.externalUasg || !ata.externalAtaNumber) {
      throw new AppError("ATA nao possui vinculo externo com Compras.gov.br", 409);
    }

    return ata;
  }

  private async getItemWithAta(ataItemId: string) {
    const item = await prisma.ataItem.findUnique({
      where: { id: ataItemId },
      select: {
        id: true,
        ataItemCode: true,
        referenceCode: true,
        description: true,
        unitPrice: true,
        initialQuantity: true,
        externalItemId: true,
        externalItemNumber: true,
        externalSource: true,
        externalLastSyncAt: true,
        deletedAt: true,
        ata: {
          select: {
            id: true,
            ataCode: true,
            number: true,
            externalSource: true,
            externalUasg: true,
            externalPregaoNumber: true,
            externalPregaoYear: true,
            externalAtaNumber: true,
            externalLastSyncAt: true,
          },
        },
      },
    });

    if (!item || item.deletedAt) {
      throw new AppError("Item da ata nao encontrado", 404);
    }

    if (
      item.ata.externalSource !== COMPRAS_GOV_SOURCE ||
      !item.ata.externalUasg ||
      !item.ata.externalAtaNumber
    ) {
      throw new AppError("ATA nao possui vinculo externo com Compras.gov.br", 409);
    }

    if (
      item.externalSource !== COMPRAS_GOV_SOURCE ||
      (!item.externalItemId && !item.externalItemNumber)
    ) {
      throw new AppError("Item da ata nao possui vinculo externo com Compras.gov.br", 409);
    }

    return item;
  }

  private aggregateRecords(records: ComprasGovEmpenhoSaldoItem[], managedUasg: string | null) {
    const balances = new Map<string, ExternalBalance>();

    for (const record of records) {
      const externalItemNumber = this.normalizeText(record.numeroItem);
      const normalizedItemNumber = this.normalizeItemNumber(externalItemNumber);
      if (!normalizedItemNumber) continue;

      const current =
        balances.get(normalizedItemNumber) ??
        {
          externalItemNumber,
          source: "COMPRAS_GOV",
          managedBalance: this.buildEmptyManagedBalance({
            unitCode: managedUasg,
          }),
          adhesionBalance: this.buildEmptyAdhesionBalance(),
          nonParticipantCommitments: [] as ExternalCommitment[],
          externalUsageStatus: "SEM_USO_EXTERNO" as ExternalUsageStatus,
          lastUpdatedAt: null,
          rawRecords: 0,
        };

      const updatedAt = this.normalizeDate(record.dataHoraAtualizacao);
      const isManagedRecord = this.isManagedUnit(record, managedUasg);

      if (isManagedRecord) {
        current.managedBalance.unitCode = this.getUnitCode(record) ?? current.managedBalance.unitCode;
        current.managedBalance.unitName =
          this.pickText(record, ["nomeUnidade", "unidade"]) ?? current.managedBalance.unitName;
        current.managedBalance.registeredQuantity = current.managedBalance.registeredQuantity.add(
          this.normalizeNumber(record.quantidadeRegistrada)
        );
        current.managedBalance.committedQuantity = current.managedBalance.committedQuantity.add(
          this.normalizeNumber(record.quantidadeEmpenhada)
        );
        current.managedBalance.availableQuantity = current.managedBalance.availableQuantity.add(
          this.normalizeNumber(record.saldoEmpenho)
        );
        const commitment = this.buildCommitment(record, {
          unidade: [
            this.getUnitCode(record),
            this.pickText(record, ["nomeUnidade", "unidade"]),
          ]
            .filter(Boolean)
            .join(" - ") || null,
          tipoUnidade: this.pickText(record, ["tipo", "tipoUnidade"]) ?? "GERENCIADORA",
          affectsManagedBalance: true,
          sourceEndpoint: "4_consultarEmpenhosSaldoItem",
          item: externalItemNumber,
        });
        if (commitment?.numeroEmpenho) {
          current.managedBalance.commitments.push(commitment);
        }
      } else {
        const approvedQuantity = this.getApprovedQuantityFromAdhesion(record) ?? decimal(0);
        const committedQuantity =
          this.pickNumber(record, [
            "quantidadeEmpenhada",
            "qtdEmpenhada",
            "quantidade",
            "quantidadeIncluida",
          ]) ?? decimal(0);
        const availableQuantity = this.pickNumber(record, ["saldoEmpenho", "saldoParaEmpenho"]) ?? decimal(0);

        const commitment = this.buildCommitment(record, {
          unidade: [
            this.getUnitCode(record),
            this.pickText(record, ["nomeUnidade", "unidade"]),
          ]
            .filter(Boolean)
            .join(" - ") || null,
          tipoUnidade: this.pickText(record, ["tipo", "tipoUnidade"]) ?? "NAO_PARTICIPANTE",
          affectsManagedBalance: false,
          sourceEndpoint: "4_consultarEmpenhosSaldoItem",
          item: externalItemNumber,
        });

        if (commitment?.numeroEmpenho) {
          current.nonParticipantCommitments.push(commitment);
        } else if (commitment) {
          current.adhesionBalance.limitQuantity =
            current.adhesionBalance.limitQuantity.add(approvedQuantity);
          current.adhesionBalance.approvedQuantity =
            current.adhesionBalance.approvedQuantity.add(approvedQuantity);
          current.adhesionBalance.committedQuantity =
            current.adhesionBalance.committedQuantity.add(committedQuantity);
          current.adhesionBalance.availableQuantity =
            current.adhesionBalance.availableQuantity.add(availableQuantity);
          current.adhesionBalance.adhesions.push(commitment);
        }
      }
      current.lastUpdatedAt =
        updatedAt && (!current.lastUpdatedAt || updatedAt > current.lastUpdatedAt)
          ? updatedAt
          : current.lastUpdatedAt;
      current.rawRecords += 1;
      current.externalUsageStatus = this.resolveExternalUsageStatus(current);
      balances.set(normalizedItemNumber, current);
    }

    return balances;
  }

  private async fetchExternalBalancesForAta(ata: {
    externalUasg: string | null;
    externalAtaNumber: string | null;
  }) {
    const candidates = this.getAtaNumberCandidates(ata.externalAtaNumber);
    const failures: ExternalRequestError[] = [];
    let successfulEmpty = false;

    for (const numeroAta of candidates) {
      try {
        const records = await this.requestAllPages<ComprasGovEmpenhoSaldoItem>(
          "/modulo-arp/4_consultarEmpenhosSaldoItem",
          {
            numeroAta,
            unidadeGerenciadora: ata.externalUasg ?? "",
          },
          { ataNumberTried: numeroAta }
        );
        if (this.requestDebug.length > 0) {
          this.requestDebug[this.requestDebug.length - 1].rawEmpenhosSaldoItem = records;
        }

        if (records.length > 0) {
          return {
            balances: this.aggregateRecords(records, ata.externalUasg),
            records,
            warnings: [] as string[],
            error: null,
          };
        }

        successfulEmpty = true;
      } catch (error) {
        const requestError = error as ExternalRequestError;
        failures.push(requestError);
        if (this.isRateLimitError(requestError)) {
          return {
            balances: new Map<string, ExternalBalance>(),
            records: [] as ComprasGovEmpenhoSaldoItem[],
            warnings: [RATE_LIMIT_WARNING],
            error: requestError,
          };
        }
      }
    }

    if (failures.length === candidates.length && failures.every((error) => error.network)) {
      return {
        balances: new Map<string, ExternalBalance>(),
        records: [] as ComprasGovEmpenhoSaldoItem[],
        warnings: [] as string[],
        error: failures[0] ?? null,
      };
    }

    return {
      balances: new Map<string, ExternalBalance>(),
      records: [] as ComprasGovEmpenhoSaldoItem[],
      warnings: successfulEmpty ? ["Nenhum saldo externo retornado para esta ATA."] : [],
      error: null,
    };
  }

  private async fetchExternalBalanceForItem(
    ata: {
      externalUasg: string | null;
      externalAtaNumber: string | null;
    },
    item: LocalItem
  ) {
    const candidates = this.getAtaNumberCandidates(ata.externalAtaNumber);
    const numeroItem = item.externalItemNumber ?? item.referenceCode;
    const failures: ExternalRequestError[] = [];
    let successfulEmpty = false;

    for (const numeroAta of candidates) {
      try {
        const records = await this.requestAllPages<ComprasGovEmpenhoSaldoItem>(
          "/modulo-arp/4_consultarEmpenhosSaldoItem",
          {
            numeroAta,
            unidadeGerenciadora: ata.externalUasg ?? "",
            numeroItem,
          },
          { ataNumberTried: numeroAta }
        );
        if (this.requestDebug.length > 0) {
          this.requestDebug[this.requestDebug.length - 1].rawEmpenhosSaldoItem = records;
        }

        if (records.length > 0) {
          return {
            balances: this.aggregateRecords(records, ata.externalUasg),
            records,
            warnings: [] as string[],
            error: null,
          };
        }

        successfulEmpty = true;
      } catch (error) {
        const requestError = error as ExternalRequestError;
        failures.push(requestError);
        if (this.isRateLimitError(requestError)) {
          return {
            balances: new Map<string, ExternalBalance>(),
            records: [] as ComprasGovEmpenhoSaldoItem[],
            warnings: [RATE_LIMIT_WARNING],
            error: requestError,
          };
        }
      }
    }

    if (!successfulEmpty && failures.length > 0) {
      return {
        balances: new Map<string, ExternalBalance>(),
        records: [] as ComprasGovEmpenhoSaldoItem[],
        warnings: [] as string[],
        error: failures[0] ?? null,
      };
    }

    return {
      balances: new Map<string, ExternalBalance>(),
      records: [] as ComprasGovEmpenhoSaldoItem[],
      warnings: successfulEmpty ? ["Nenhum saldo externo retornado para este item."] : [],
      error: null,
    };
  }

  private async fetchExternalBalanceFromItemDetails(
    ata: {
      externalUasg: string | null;
      externalAtaNumber: string | null;
    },
    item: LocalItem,
    itemDetailsCache = new Map<string, ComprasGovListResponse<ComprasGovAtaItem>>()
  ) {
    const parsedExternalId = this.parseExternalItemId(item.externalItemId);
    const numeroItem =
      parsedExternalId.numeroItem ?? item.externalItemNumber ?? item.referenceCode;
    const normalizedNumeroItem = this.normalizeItemNumber(numeroItem);
    const pncpAta = parsedExternalId.numeroControlePncpAta;
    const records: unknown[] = [];
    let externalItem: ComprasGovAtaItem | undefined;

    if (pncpAta) {
      let itemDetails: ComprasGovListResponse<ComprasGovAtaItem>;
      try {
        const cached = itemDetailsCache.get(pncpAta);
        itemDetails =
          cached ??
          (await this.requestComprasGov<ComprasGovListResponse<ComprasGovAtaItem>>(
            "/modulo-arp/2.1_consultarARPItem_Id",
            { numeroControlePncpAta: pncpAta },
            { matchKey: `numeroControlePncpAta:${pncpAta};numeroItem:${numeroItem}` }
          ));
        itemDetailsCache.set(pncpAta, itemDetails);
      } catch (error) {
        const requestError = error as ExternalRequestError;
        if (requestError.network || this.isRateLimitError(requestError)) throw error;
        return undefined;
      }
      records.push(...(itemDetails.resultado ?? []));
      externalItem = (itemDetails.resultado ?? []).find(
        (candidate) => this.normalizeItemNumber(candidate.numeroItem) === normalizedNumeroItem
      );
    }

    const ataCandidates = [
      this.normalizeText(externalItem?.numeroAtaRegistroPreco),
      ...this.getAtaNumberCandidates(ata.externalAtaNumber),
    ].filter(Boolean);
    const numeroAta = [...new Set(ataCandidates)][0];

    if (!numeroAta) {
      return undefined;
    }

    let unidades: ComprasGovUnidadeItem[];
    let adesoes: ComprasGovAdesaoItem[];
    try {
      [unidades, adesoes] = await Promise.all([
        this.requestAllPages<ComprasGovUnidadeItem>(
          "/modulo-arp/3_consultarUnidadesItem",
          {
            numeroAta,
            unidadeGerenciadora: ata.externalUasg ?? "",
            numeroItem,
          },
          { ataNumberTried: numeroAta, matchKey: `numeroItem:${numeroItem}` }
        ),
        this.requestAllPages<ComprasGovAdesaoItem>(
          "/modulo-arp/5_consultarAdesoesItem",
          {
            numeroAta,
            unidadeGerenciadora: ata.externalUasg ?? "",
            numeroItem,
          },
          { ataNumberTried: numeroAta, matchKey: `numeroItem:${numeroItem}` }
        ),
      ]);
    } catch (error) {
      const requestError = error as ExternalRequestError;
      if (requestError.network || this.isRateLimitError(requestError)) throw error;
      return undefined;
    }
    records.push(...unidades, ...adesoes);

    const matchingUnidades = unidades.filter(
      (candidate) => this.normalizeItemNumber(candidate.numeroItem) === normalizedNumeroItem
    );
    const matchingAdesoes = adesoes.filter((candidate) =>
      this.normalizeText(candidate.numeroAta) === numeroAta
    );

    if (!externalItem && matchingUnidades.length === 0 && matchingAdesoes.length === 0) {
      return undefined;
    }

    const managedUnit =
      matchingUnidades.find((record) => this.isManagedUnit(record, ata.externalUasg)) ??
      matchingUnidades[0];

    if (!managedUnit) {
      return undefined;
    }

    const nonParticipantUnits = matchingUnidades.filter((record) => record !== managedUnit);
    const itemRegistered = decimal(
      externalItem?.quantidadeHomologadaVencedor ?? externalItem?.quantidadeHomologadaItem ?? 0
    );
    const unitRegistered = this.pickNumber(managedUnit, ["quantidadeRegistrada"]) ?? decimal(0);
    const registeredQuantity = unitRegistered.greaterThan(0) ? unitRegistered : itemRegistered;
    const availableQuantity = this.getAvailableQuantityFromUnit(managedUnit);
    const committedQuantity = this.getCommittedQuantityFromUnit(managedUnit);
    const lastUpdatedAt = [...matchingUnidades, externalItem]
      .map((record) => this.normalizeDate(record?.dataHoraAtualizacao))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const commitments = matchingUnidades
      .filter((record) => record === managedUnit && this.hasCommitmentNumber(record))
      .map((record) =>
        this.buildCommitment(record, {
          unidade: [
            this.getUnitCode(record),
            this.normalizeText(record.nomeUnidade),
          ].filter(Boolean).join(" - ") || null,
          tipoUnidade: this.normalizeText(record.tipoUnidade) || "GERENCIADORA",
          fornecedor:
            this.normalizeText(record.fornecedor) ||
            this.normalizeText(externalItem?.nomeRazaoSocialFornecedor) ||
            null,
          affectsManagedBalance: true,
          quantidadeEmpenhada: this.getCommittedQuantityFromUnit(record),
          sourceEndpoint: "3_consultarUnidadesItem",
          item: numeroItem,
        })
      )
      .filter((commitment): commitment is ExternalCommitment => Boolean(commitment));
    const nonParticipantCommitments = nonParticipantUnits
      .filter((record) => this.hasCommitmentNumber(record))
      .map((record) =>
        this.buildCommitment(record, {
          unidade: [
            this.getUnitCode(record),
            this.normalizeText(record.nomeUnidade),
          ].filter(Boolean).join(" - ") || this.pickText(record, ["unidade"]) || null,
          tipoUnidade: this.normalizeText(record.tipoUnidade) || "NAO_PARTICIPANTE",
          fornecedor:
            this.normalizeText(record.fornecedor) ||
            this.normalizeText(externalItem?.nomeRazaoSocialFornecedor) ||
            null,
          affectsManagedBalance: false,
          quantidadeEmpenhada: this.getCommittedQuantityFromUnit(record),
          sourceEndpoint: "3_consultarUnidadesItem",
          item: numeroItem,
        })
      )
      .filter((commitment): commitment is ExternalCommitment => Boolean(commitment));
    const adhesions = [
      ...nonParticipantUnits
        .filter((record) => !this.hasCommitmentNumber(record))
        .map((record) =>
          this.buildCommitment(record, {
            unidade: [
              this.getUnitCode(record),
              this.normalizeText(record.nomeUnidade),
            ].filter(Boolean).join(" - ") || this.pickText(record, ["unidade"]) || null,
            tipoUnidade: this.normalizeText(record.tipoUnidade) || "NAO_PARTICIPANTE",
            fornecedor:
              this.normalizeText(record.fornecedor) ||
              this.normalizeText(externalItem?.nomeRazaoSocialFornecedor) ||
              null,
            affectsManagedBalance: false,
            quantidadeEmpenhada: this.getCommittedQuantityFromUnit(record),
            sourceEndpoint: "3_consultarUnidadesItem",
            item: numeroItem,
          })
        ),
      ...matchingAdesoes
        .map((record) =>
          this.buildCommitment(record, {
            unidade: this.normalizeText(record.unidadeNaoParticipante) || null,
            tipoUnidade: "NAO_PARTICIPANTE",
            fornecedor:
              this.normalizeText(externalItem?.nomeRazaoSocialFornecedor) || null,
            affectsManagedBalance: false,
            sourceEndpoint: "5_consultarAdesoesItem",
            item: numeroItem,
          })
        )
        .filter((commitment): commitment is ExternalCommitment => Boolean(commitment)),
    ].filter((commitment): commitment is ExternalCommitment => Boolean(commitment));

    const balance: ExternalBalance = {
      externalItemNumber: this.normalizeText(externalItem?.numeroItem) || numeroItem,
      source: "COMPRAS_GOV",
      managedBalance: {
        unitCode: this.getUnitCode(managedUnit),
        unitName: this.normalizeText(managedUnit.nomeUnidade) || null,
        registeredQuantity,
        committedQuantity,
        availableQuantity,
        commitments,
      },
      adhesionBalance: {
        limitQuantity: adhesions.reduce(
          (total, adhesion) => total.add(adhesion.quantidadeIncluida ?? 0),
          decimal(0)
        ),
        approvedQuantity: adhesions.reduce(
          (total, adhesion) => total.add(adhesion.quantidadeIncluida ?? 0),
          decimal(0)
        ),
        committedQuantity: adhesions.reduce(
          (total, adhesion) => total.add(adhesion.quantidadeEmpenhada ?? 0),
          decimal(0)
        ),
        availableQuantity: adhesions.reduce(
          (total, adhesion) =>
            total.add(
              Math.max(
                Number(adhesion.quantidadeIncluida ?? 0) - Number(adhesion.quantidadeEmpenhada ?? 0),
                0
              )
            ),
          decimal(0)
        ),
        adhesions,
      },
      nonParticipantCommitments,
      externalUsageStatus: "SEM_USO_EXTERNO",
      lastUpdatedAt,
      rawRecords: records.length,
      matchKey: pncpAta
        ? `numeroControlePncpAta:${pncpAta};numeroItem:${numeroItem}`
        : `numeroAta:${numeroAta};numeroItem:${numeroItem}`,
    };
    balance.externalUsageStatus = this.resolveExternalUsageStatus(balance);

    if (this.requestDebug.length > 0) {
      this.requestDebug[this.requestDebug.length - 1].sampleCommitments = [
        ...commitments,
        ...nonParticipantCommitments,
        ...adhesions,
      ].slice(0, 3);
      this.requestDebug[this.requestDebug.length - 1].unidadesEncontradas = matchingUnidades;
      this.requestDebug[this.requestDebug.length - 1].unidadePrincipalSelecionada = managedUnit;
      this.requestDebug[this.requestDebug.length - 1].empenhosGerenciadora = commitments;
      this.requestDebug[this.requestDebug.length - 1].empenhosNaoParticipantes =
        nonParticipantCommitments;
      this.requestDebug[this.requestDebug.length - 1].rawUnidadesItem = unidades;
      this.requestDebug[this.requestDebug.length - 1].rawAdesoesItem = adesoes;
      this.requestDebug[this.requestDebug.length - 1].unidadeGerenciadoraSelecionada = managedUnit;
      this.requestDebug[this.requestDebug.length - 1].saldoGerenciadoraCalculado = {
        registeredQuantity: registeredQuantity.toString(),
        committedQuantity: committedQuantity.toString(),
        availableQuantity: availableQuantity.toString(),
      };
      this.requestDebug[this.requestDebug.length - 1].commitmentsGerenciadoraNormalizados =
        commitments;
      this.requestDebug[this.requestDebug.length - 1].commitmentsNaoParticipantesNormalizados =
        nonParticipantCommitments;
    }

    return { balance, records };
  }

  private findExternalBalance(item: LocalItem, balances: Map<string, ExternalBalance>) {
    const candidates = [item.externalItemNumber, item.referenceCode]
      .map((candidate) => this.normalizeItemNumber(candidate))
      .filter(Boolean);

    for (const candidate of candidates) {
      const balance = balances.get(candidate);
      if (balance) return balance;
    }

    return undefined;
  }

  private buildImportFallbackBalance(item: LocalItem): ExternalBalance | undefined {
    if (item.externalSource !== COMPRAS_GOV_SOURCE) return undefined;

    const initialQuantity = decimal(item.initialQuantity);
    return {
      externalItemNumber: item.externalItemNumber ?? item.referenceCode,
      source: "COMPRAS_GOV_IMPORT_FALLBACK",
      managedBalance: {
        unitCode: null,
        unitName: null,
        registeredQuantity: initialQuantity,
        committedQuantity: decimal(0),
        availableQuantity: initialQuantity,
        commitments: [],
      },
      adhesionBalance: this.buildEmptyAdhesionBalance(),
      nonParticipantCommitments: [],
      externalUsageStatus: "SEM_USO_EXTERNO",
      lastUpdatedAt: item.externalLastSyncAt,
      rawRecords: 0,
    };
  }

  private resolveStatus(
    localBalance: Awaited<ReturnType<typeof ataItemBalanceService.getBalanceForAtaItem>>,
    externalBalance: ExternalBalance | undefined
  ) {
    const localAvailable = decimal(localBalance.availableQuantity);
    const externalAvailable = externalBalance?.managedBalance.availableQuantity ?? null;
    const localConsumed = decimal(localBalance.consumedQuantity);

    if (!externalAvailable) return "NAO_ENCONTRADO" satisfies BalanceComparisonStatus;
    if (externalBalance?.managedBalance.committedQuantity.greaterThan(0) && localConsumed.equals(0)) {
      return "CONSUMO_EXTERNO_DETECTADO" satisfies BalanceComparisonStatus;
    }
    if (localAvailable.equals(externalAvailable)) return "OK" satisfies BalanceComparisonStatus;
    if (externalAvailable.lessThan(localAvailable)) {
      return "CONSUMO_EXTERNO_DETECTADO" satisfies BalanceComparisonStatus;
    }
    return "DIVERGENTE" satisfies BalanceComparisonStatus;
  }

  private buildComparison(
    item: LocalItem,
    localBalance: Awaited<ReturnType<typeof ataItemBalanceService.getBalanceForAtaItem>>,
    externalBalance: ExternalBalance | undefined,
    externalError?: ExternalRequestError,
    fallbackReason?: "SEM_EMPENHO_REGISTRADO"
  ) {
    const localAvailable = decimal(localBalance.availableQuantity);
    const externalAvailable = externalBalance?.managedBalance.availableQuantity ?? null;
    const difference = externalAvailable ? localAvailable.sub(externalAvailable) : null;

    return {
      item: {
        id: item.id,
        ataItemCode: item.ataItemCode,
        referenceCode: item.referenceCode,
        description: item.description,
        externalItemId: item.externalItemId,
        externalItemNumber: item.externalItemNumber,
      },
      localBalance,
      externalBalance: externalBalance
        ? {
            externalItemNumber: externalBalance.externalItemNumber,
            source: externalBalance.source,
            managedBalance: {
              unitCode: externalBalance.managedBalance.unitCode,
              unitName: externalBalance.managedBalance.unitName,
              registeredQuantity: externalBalance.managedBalance.registeredQuantity.toString(),
              committedQuantity: externalBalance.managedBalance.committedQuantity.toString(),
              availableQuantity: externalBalance.managedBalance.availableQuantity.toString(),
              commitments: externalBalance.managedBalance.commitments,
            },
            adhesionBalance: {
              limitQuantity: externalBalance.adhesionBalance.limitQuantity.toString(),
              approvedQuantity: externalBalance.adhesionBalance.approvedQuantity.toString(),
              committedQuantity: externalBalance.adhesionBalance.committedQuantity.toString(),
              availableQuantity: externalBalance.adhesionBalance.availableQuantity.toString(),
              adhesions: externalBalance.adhesionBalance.adhesions,
            },
            nonParticipantCommitments: externalBalance.nonParticipantCommitments,
            externalUsageStatus: externalBalance.externalUsageStatus,
            lastUpdatedAt: externalBalance.lastUpdatedAt,
            rawRecords: externalBalance.rawRecords,
          }
        : null,
      difference: difference?.toString() ?? null,
      lastSyncAt: item.externalLastSyncAt,
      status: externalError
        ? this.isRateLimitError(externalError)
          ? ("RATE_LIMIT_COMPRAS_GOV" satisfies BalanceComparisonStatus)
          : ("ERRO_CONSULTA_EXTERNA" satisfies BalanceComparisonStatus)
        : fallbackReason
          ? ("SEM_EMPENHO_REGISTRADO" satisfies BalanceComparisonStatus)
        : this.resolveStatus(localBalance, externalBalance),
      externalError: externalError
        ? {
            status: externalError.status ?? null,
            url: externalError.url ?? null,
            body: externalError.body ?? externalError.message,
            retryAfterSeconds: externalError.retryAfterSeconds ?? null,
          }
        : null,
    };
  }

  private async upsertSnapshot(
    ataItemId: string,
    comparison: ReturnType<ComprasGovBalanceService["buildComparison"]>,
    warnings: string[] = []
  ) {
    if (!comparison.externalBalance) return null;

    return prisma.ataItemExternalBalanceSnapshot.upsert({
      where: { ataItemId },
      update: {
        source: comparison.externalBalance.source,
        status: comparison.status,
        externalUsageStatus: comparison.externalBalance.externalUsageStatus,
        managedBalance: comparison.externalBalance.managedBalance as Prisma.InputJsonValue,
        adhesionBalance: comparison.externalBalance.adhesionBalance as Prisma.InputJsonValue,
        commitments:
          comparison.externalBalance.managedBalance.commitments as Prisma.InputJsonValue,
        nonParticipantCommitments:
          comparison.externalBalance.nonParticipantCommitments as Prisma.InputJsonValue,
        difference: comparison.difference,
        lastSyncAt: comparison.lastSyncAt ?? new Date(),
        warnings: warnings as Prisma.InputJsonValue,
      },
      create: {
        ataItemId,
        source: comparison.externalBalance.source,
        status: comparison.status,
        externalUsageStatus: comparison.externalBalance.externalUsageStatus,
        managedBalance: comparison.externalBalance.managedBalance as Prisma.InputJsonValue,
        adhesionBalance: comparison.externalBalance.adhesionBalance as Prisma.InputJsonValue,
        commitments:
          comparison.externalBalance.managedBalance.commitments as Prisma.InputJsonValue,
        nonParticipantCommitments:
          comparison.externalBalance.nonParticipantCommitments as Prisma.InputJsonValue,
        difference: comparison.difference,
        lastSyncAt: comparison.lastSyncAt ?? new Date(),
        warnings: warnings as Prisma.InputJsonValue,
      },
    });
  }

  private async loadSnapshotMap(ataItemIds: string[]) {
    const snapshots = await prisma.ataItemExternalBalanceSnapshot.findMany({
      where: { ataItemId: { in: ataItemIds } },
    });

    return new Map(snapshots.map((snapshot) => [snapshot.ataItemId, snapshot]));
  }

  private buildStoredComparison(
    item: LocalItem,
    localBalance: Awaited<ReturnType<typeof ataItemBalanceService.getBalanceForAtaItem>>,
    snapshot:
      | Awaited<ReturnType<typeof prisma.ataItemExternalBalanceSnapshot.findMany>>[number]
      | null
  ) {
    if (!snapshot) {
      return {
        item: {
          id: item.id,
          ataItemCode: item.ataItemCode,
          referenceCode: item.referenceCode,
          description: item.description,
          externalItemId: item.externalItemId,
          externalItemNumber: item.externalItemNumber,
        },
        localBalance,
        externalBalance: null,
        difference: null,
        lastSyncAt: item.externalLastSyncAt,
        status: "NAO_SINCRONIZADO" as BalanceComparisonStatus,
        externalError: null,
      };
    }

    const externalBalance =
      snapshot.managedBalance && snapshot.adhesionBalance
        ? ({
            externalItemNumber: item.externalItemNumber ?? item.referenceCode,
            source: snapshot.source as SnapshotExternalBalance["source"],
            managedBalance: snapshot.managedBalance as SnapshotExternalBalance["managedBalance"],
            adhesionBalance:
              snapshot.adhesionBalance as SnapshotExternalBalance["adhesionBalance"],
            nonParticipantCommitments:
              (snapshot.nonParticipantCommitments as ExternalCommitment[] | null) ?? [],
            externalUsageStatus:
              (snapshot.externalUsageStatus as ExternalUsageStatus | null) ?? "SEM_USO_EXTERNO",
            lastUpdatedAt: snapshot.lastSyncAt,
            rawRecords: 0,
          } satisfies SnapshotExternalBalance)
        : null;

    return {
      item: {
        id: item.id,
        ataItemCode: item.ataItemCode,
        referenceCode: item.referenceCode,
        description: item.description,
        externalItemId: item.externalItemId,
        externalItemNumber: item.externalItemNumber,
      },
      localBalance,
      externalBalance,
      difference: snapshot.difference,
      lastSyncAt: snapshot.lastSyncAt,
      status: snapshot.status as BalanceComparisonStatus,
      externalError: null,
      warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings : [],
    };
  }

  private summarizeItems(
    items: Array<{ status: BalanceComparisonStatus }>
  ) {
    return {
      totalItems: items.length,
      ok: items.filter((item) => item.status === "OK").length,
      divergent: items.filter((item) => item.status === "DIVERGENTE").length,
      externalConsumptionDetected: items.filter(
        (item) => item.status === "CONSUMO_EXTERNO_DETECTADO"
      ).length,
      naoSincronizado: items.filter((item) => item.status === "NAO_SINCRONIZADO").length,
      notFound: items.filter((item) => item.status === "NAO_ENCONTRADO").length,
      externalQueryErrors: items.filter((item) => item.status === "ERRO_CONSULTA_EXTERNA").length,
      rateLimitErrors: items.filter((item) => item.status === "RATE_LIMIT_COMPRAS_GOV").length,
      semEmpenhoRegistrado: items.filter((item) => item.status === "SEM_EMPENHO_REGISTRADO").length,
    };
  }

  private async fetchExternalComparisonForAta(ataId: string) {
    this.resetDebug();
    const ata = await this.getAtaWithItems(ataId);
    const externalResult = await this.fetchExternalBalancesForAta(ata);

    if (externalResult.error?.network) {
      throw new AppError("API do Compras.gov.br indisponivel para consulta de saldo externo", 502);
    }

    const detailFallbackBalances = new Map<string, ExternalBalance>();
    const detailFallbackRecords: unknown[] = [];
    let detailFallbackError: ExternalRequestError | null = null;

    if (externalResult.records.length === 0 && externalResult.error === null) {
      const itemDetailsCache = new Map<string, ComprasGovListResponse<ComprasGovAtaItem>>();
      for (const item of ata.items) {
        if (item.externalSource !== COMPRAS_GOV_SOURCE) continue;
        let detailFallback: Awaited<ReturnType<typeof this.fetchExternalBalanceFromItemDetails>>;
        try {
          detailFallback = await this.fetchExternalBalanceFromItemDetails(
            ata,
            item,
            itemDetailsCache
          );
        } catch (error) {
          const requestError = error as ExternalRequestError;
          if (this.isRateLimitError(requestError)) {
            detailFallbackError = requestError;
            break;
          }
          throw error;
        }
        if (!detailFallback) continue;
        detailFallbackBalances.set(item.id, detailFallback.balance);
        detailFallbackRecords.push(...detailFallback.records);
      }
    }

    const localBalanceMap = await ataItemBalanceService.getBalanceMapForAtaItems(ata.items);
    const useImportFallback =
      externalResult.records.length === 0 &&
      detailFallbackRecords.length === 0 &&
      !detailFallbackError &&
      externalResult.error === null;
    const items = ata.items.map((item) =>
    {
      const externalBalance =
        this.findExternalBalance(item, externalResult.balances) ??
        detailFallbackBalances.get(item.id) ??
        (useImportFallback ? this.buildImportFallbackBalance(item) : undefined);

      return this.buildComparison(
        item,
        localBalanceMap.get(item.id)!,
        externalBalance,
        externalResult.error ?? detailFallbackError ?? undefined,
        useImportFallback && externalBalance?.source === "COMPRAS_GOV_IMPORT_FALLBACK"
          ? "SEM_EMPENHO_REGISTRADO"
          : undefined
      );
    });

    const unmatchedLocalItems = items
      .filter((item) => !item.externalBalance)
      .map((item) => ({
        id: item.item.id,
        referenceCode: item.item.referenceCode,
        externalItemNumber: item.item.externalItemNumber,
      }));

    if (this.requestDebug.length > 0) {
      this.requestDebug[this.requestDebug.length - 1].unmatchedLocalItems = unmatchedLocalItems;
    }

    const summary = {
      totalItems: items.length,
      ok: items.filter((item) => item.status === "OK").length,
      divergent: items.filter((item) => item.status === "DIVERGENTE").length,
      externalConsumptionDetected: items.filter(
        (item) => item.status === "CONSUMO_EXTERNO_DETECTADO"
      ).length,
      notFound: items.filter((item) => item.status === "NAO_ENCONTRADO").length,
      externalQueryErrors: items.filter((item) => item.status === "ERRO_CONSULTA_EXTERNA").length,
      rateLimitErrors: items.filter((item) => item.status === "RATE_LIMIT_COMPRAS_GOV").length,
      semEmpenhoRegistrado: items.filter((item) => item.status === "SEM_EMPENHO_REGISTRADO").length,
    };

    return {
      source: COMPRAS_GOV_SOURCE,
      ata: {
        id: ata.id,
        ataCode: ata.ataCode,
        number: ata.number,
        externalUasg: ata.externalUasg,
        externalPregaoNumber: ata.externalPregaoNumber,
        externalPregaoYear: ata.externalPregaoYear,
        externalAtaNumber: ata.externalAtaNumber,
        externalLastSyncAt: ata.externalLastSyncAt,
      },
      comparedAt: new Date(),
      summary,
      items,
      warnings: [
        ...externalResult.warnings,
        ...(detailFallbackError ? [RATE_LIMIT_WARNING] : []),
        ...(detailFallbackRecords.length > 0
          ? [
              "Saldo externo consultado nos detalhes oficiais da ARP quando o endpoint de empenhos/saldo retornou vazio.",
            ]
          : []),
        ...(useImportFallback
          ? [
              "Compras.gov.br não retornou empenhos para esta ATA. Saldo externo exibido com base na quantidade registrada importada.",
            ]
          : []),
      ],
      retryAfterSeconds:
        externalResult.error?.retryAfterSeconds ?? detailFallbackError?.retryAfterSeconds ?? null,
      debug: this.getDebug(),
    };
  }

  async compareAta(ataId: string) {
    this.resetDebug();
    console.info("local snapshot loaded", { scope: "ata", ataId });
    const ata = await this.getAtaWithItems(ataId);
    const localBalanceMap = await ataItemBalanceService.getBalanceMapForAtaItems(ata.items);
    const snapshotMap = await this.loadSnapshotMap(ata.items.map((item) => item.id));
    const items = ata.items.map((item) =>
      this.buildStoredComparison(item, localBalanceMap.get(item.id)!, snapshotMap.get(item.id) ?? null)
    );

    return {
      source: COMPRAS_GOV_SOURCE,
      ata: {
        id: ata.id,
        ataCode: ata.ataCode,
        number: ata.number,
        externalUasg: ata.externalUasg,
        externalPregaoNumber: ata.externalPregaoNumber,
        externalPregaoYear: ata.externalPregaoYear,
        externalAtaNumber: ata.externalAtaNumber,
        externalLastSyncAt: ata.externalLastSyncAt,
      },
      comparedAt: new Date(),
      summary: this.summarizeItems(items),
      items,
      warnings: [],
      retryAfterSeconds: null,
      debug: this.getDebug(),
    };
  }

  async compareItem(ataItemId: string) {
    this.resetDebug();
    console.info("local snapshot loaded", { scope: "item", ataItemId });
    const item = await this.getItemWithAta(ataItemId);
    const { ata, deletedAt: _deletedAt, ...localItem } = item;
    const localBalance = await ataItemBalanceService.getBalanceForAtaItem(localItem.id);
    const snapshot = await prisma.ataItemExternalBalanceSnapshot.findUnique({
      where: { ataItemId: localItem.id },
    });

    return {
      source: COMPRAS_GOV_SOURCE,
      ata: {
        id: ata.id,
        ataCode: ata.ataCode,
        number: ata.number,
        externalUasg: ata.externalUasg,
        externalPregaoNumber: ata.externalPregaoNumber,
        externalPregaoYear: ata.externalPregaoYear,
        externalAtaNumber: ata.externalAtaNumber,
        externalLastSyncAt: ata.externalLastSyncAt,
      },
      comparedAt: new Date(),
      ...this.buildStoredComparison(localItem, localBalance, snapshot),
    };
  }

  async syncItem(ataItemId: string) {
    console.info("external sync requested", { scope: "item", ataItemId });
    this.resetDebug();
    const item = await this.getItemWithAta(ataItemId);
    const { ata, deletedAt: _deletedAt, ...localItem } = item;
    const externalResult = await this.fetchExternalBalanceForItem(ata, localItem);
    let detailFallback: Awaited<ReturnType<typeof this.fetchExternalBalanceFromItemDetails>>;
    let detailFallbackError: ExternalRequestError | null = null;
    if (externalResult.records.length === 0 && externalResult.error === null) {
      try {
        detailFallback = await this.fetchExternalBalanceFromItemDetails(ata, localItem);
      } catch (error) {
        const requestError = error as ExternalRequestError;
        if (this.isRateLimitError(requestError)) {
          detailFallbackError = requestError;
        } else {
          throw error;
        }
      }
    }
    const localBalance = await ataItemBalanceService.getBalanceForAtaItem(localItem.id);
    const useImportFallback =
      externalResult.records.length === 0 &&
      !detailFallback &&
      !detailFallbackError &&
      externalResult.error === null;
    const externalBalance =
      this.findExternalBalance(localItem, externalResult.balances) ??
      detailFallback?.balance ??
      (useImportFallback ? this.buildImportFallbackBalance(localItem) : undefined);
    const fallbackReason =
      useImportFallback && externalBalance?.source === "COMPRAS_GOV_IMPORT_FALLBACK"
        ? "SEM_EMPENHO_REGISTRADO"
        : undefined;
    const hasExternalError = Boolean(externalResult.error || detailFallbackError);

    const comparison = this.buildComparison(
      localItem,
      localBalance,
      externalBalance,
      externalResult.error ?? detailFallbackError ?? undefined,
      fallbackReason
    );

    if (hasExternalError) {
      const stored = await prisma.ataItemExternalBalanceSnapshot.findUnique({
        where: { ataItemId: localItem.id },
      });
      return {
        source: COMPRAS_GOV_SOURCE,
        ata: {
          id: ata.id,
          ataCode: ata.ataCode,
          number: ata.number,
          externalUasg: ata.externalUasg,
          externalPregaoNumber: ata.externalPregaoNumber,
          externalPregaoYear: ata.externalPregaoYear,
          externalAtaNumber: ata.externalAtaNumber,
          externalLastSyncAt: ata.externalLastSyncAt,
        },
        comparedAt: new Date(),
        warnings: [
          ...(externalResult.warnings ?? []),
          ...(detailFallbackError ? [RATE_LIMIT_WARNING] : []),
        ],
        retryAfterSeconds:
          externalResult.error?.retryAfterSeconds ?? detailFallbackError?.retryAfterSeconds ?? null,
        ...(stored ? this.buildStoredComparison(localItem, localBalance, stored) : comparison),
      };
    }

    const now = new Date();

    await prisma.ataItem.update({
      where: { id: localItem.id },
      data: { externalLastSyncAt: now },
    });

    const syncedComparison = this.buildComparison(
      { ...localItem, externalLastSyncAt: now },
      localBalance,
      externalBalance,
      undefined,
      fallbackReason
    );
    await this.upsertSnapshot(localItem.id, syncedComparison);

    return {
      source: COMPRAS_GOV_SOURCE,
      ata: {
        id: ata.id,
        ataCode: ata.ataCode,
        number: ata.number,
        externalUasg: ata.externalUasg,
        externalPregaoNumber: ata.externalPregaoNumber,
        externalPregaoYear: ata.externalPregaoYear,
        externalAtaNumber: ata.externalAtaNumber,
        externalLastSyncAt: ata.externalLastSyncAt,
      },
      comparedAt: new Date(),
      ...syncedComparison,
    };
  }

  async syncAta(ataId: string) {
    console.info("external sync requested", { scope: "ata", ataId });
    const comparison = await this.fetchExternalComparisonForAta(ataId);
    const now = new Date();
    const hasExternalError = comparison.items.some((item) =>
      ["ERRO_CONSULTA_EXTERNA", "RATE_LIMIT_COMPRAS_GOV"].includes(item.status)
    );

    let updatedItems = 0;
    if (!hasExternalError) {
      for (const item of comparison.items) {
        if (!item.externalBalance) continue;
        await this.upsertSnapshot(item.item.id, {
          ...item,
          lastSyncAt: now,
        });
        updatedItems += 1;
      }

      await prisma.ata.update({
        where: { id: ataId },
        data: { externalLastSyncAt: now },
      });

      await prisma.ataItem.updateMany({
        where: {
          ataId,
          id: {
            in: comparison.items.filter((item) => item.externalBalance).map((item) => item.item.id),
          },
        },
        data: { externalLastSyncAt: now },
      });
    }

    const storedComparison = await this.compareAta(ataId);
    return {
      ...storedComparison,
      syncedAt: hasExternalError ? null : now,
      updatedItems,
      warnings: hasExternalError
        ? [
            ...comparison.warnings,
            "Sincronizacao nao concluida; snapshot externo valido foi preservado.",
          ]
        : [
            "Saldo local nao foi alterado automaticamente; apenas snapshot/timestamp externo foi atualizado.",
            ...comparison.warnings,
          ],
      retryAfterSeconds: comparison.retryAfterSeconds,
      debug: comparison.debug,
    };
  }
}

export const comprasGovBalanceService = new ComprasGovBalanceService();
