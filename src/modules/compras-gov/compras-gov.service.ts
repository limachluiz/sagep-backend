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
  coverageGroupStateUf?: "AM" | "RO" | "RR" | "AC";
  coverageGroupCityName?: string;
  coverageGroupLocalities?: Array<{
    cityName: string;
    stateUf: "AM" | "RO" | "RR" | "AC";
  }>;
  dryRun?: boolean;
};

type ComprasGovListResponse<T> = {
  resultado?: T[];
  totalPaginas?: number;
};

type ComprasGovRequestDebug = {
  url: string;
  status?: number;
  errorBody?: string;
};

type ComprasGovRequestFailure = {
  url: string;
  status?: number;
  body?: string;
};

type ComprasGovPreviewDebug = {
  externalUrls: string[];
  externalStatus: number[];
  externalErrorBody: string[];
  filters: Record<string, string | null>;
};

type CoverageLocalityInput = {
  cityName: string;
  stateUf: "AM" | "RO" | "RR" | "AC";
};

class ComprasGovApiError extends Error {
  constructor(
    message: string,
    public readonly failures: ComprasGovRequestFailure[]
  ) {
    super(message);
  }
}

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

type FoundAtaPreview = {
  ataNumber: string;
  vendorName: string | null;
  itemCount: number;
  totalAmount: number | null;
  validFrom: string | null;
  validUntil: string | null;
  sampleItems: NormalizedPreviewItem[];
};

type AtaIdentifier = {
  original: string;
  normalizedFull: string;
  number: string;
  year: string | null;
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
  atasFound: FoundAtaPreview[];
  selectedAta?: FoundAtaPreview;
  warnings: string[];
  debug?: ComprasGovPreviewDebug;
};

export class ComprasGovService {
  private requestDebug: ComprasGovRequestDebug[] = [];

  private normalizeText(value: unknown) {
    return String(value ?? "").trim();
  }

  private uniqueBy<T>(items: T[], getKey: (item: T, index: number) => string) {
    const seen = new Set<string>();
    const uniqueItems: T[] = [];

    items.forEach((item, index) => {
      const key = getKey(item, index);
      if (seen.has(key)) return;
      seen.add(key);
      uniqueItems.push(item);
    });

    return uniqueItems;
  }

  private isDevelopment() {
    return process.env.NODE_ENV === "development";
  }

  private debug(message: string, context?: Record<string, unknown>) {
    if (!this.isDevelopment()) return;
    console.debug("[ComprasGov]", message, context ?? {});
  }

  private resetRequestDebug() {
    this.requestDebug = [];
  }

  private getPreviewDebug(input: PreviewInput): ComprasGovPreviewDebug | undefined {
    if (!this.isDevelopment()) return undefined;

    return {
      externalUrls: this.requestDebug.map((entry) => entry.url),
      externalStatus: this.requestDebug
        .map((entry) => entry.status)
        .filter((status): status is number => typeof status === "number"),
      externalErrorBody: this.requestDebug
        .map((entry) => entry.errorBody)
        .filter((body): body is string => Boolean(body)),
      filters: {
        uasg: input.uasg.trim(),
        numeroPregao: input.numeroPregao.trim(),
        anoPregao: input.anoPregao.trim(),
        numeroAta: input.numeroAta?.trim() ?? null,
      },
    };
  }

  private withPreviewDebug<T extends Record<string, unknown>>(input: PreviewInput, response: T): T {
    const debug = this.getPreviewDebug(input);
    return debug ? { ...response, debug } : response;
  }

  private formatExternalApiError(error: ComprasGovApiError) {
    const firstFailure = error.failures[0];
    if (!firstFailure) return error.message;

    const details = [
      `URL: ${firstFailure.url}`,
      firstFailure.status ? `status: ${firstFailure.status}` : null,
      firstFailure.body ? `body: ${firstFailure.body}` : null,
    ].filter(Boolean);

    return `${error.message}. ${details.join(" | ")}`;
  }

  private normalizeAtaFullText(value: unknown) {
    return this.normalizeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  private stripLeadingZeros(value: string) {
    const withoutLeadingZeros = value.replace(/^0+/, "");
    return withoutLeadingZeros || (value ? "0" : "");
  }

  private parseAtaIdentifier(value: unknown): AtaIdentifier {
    const original = this.normalizeText(value);
    const normalizedFull = this.normalizeAtaFullText(original);
    const numericGroups = normalizedFull.match(/\d+/g) ?? [];
    const year = numericGroups.find((group) => /^(19|20)\d{2}$/.test(group)) ?? null;
    const numberGroup = numericGroups.find((group) => group !== year) ?? numericGroups[0] ?? "";

    return {
      original,
      normalizedFull,
      number: this.stripLeadingZeros(numberGroup),
      year,
    };
  }

  private getAtaNumber(value: unknown) {
    return this.normalizeText(value);
  }

  private getAtaDisplayNumber(value: unknown) {
    const ataNumber = this.getAtaNumber(value);
    return ataNumber ? `ARP ${ataNumber}` : "ARP sem numero";
  }

  private formatAtaNumber(ataNumber: string, input: PreviewInput) {
    if (ataNumber) {
      const parsedAta = this.parseAtaIdentifier(ataNumber);
      return parsedAta.year ? `ARP ${ataNumber}` : `ARP ${ataNumber}/${input.anoPregao}`;
    }

    return `ARP ${input.numeroAta || input.numeroPregao}/${input.anoPregao}`;
  }

  private matchesAtaNumber(realAtaNumber: unknown, inputAtaNumber?: string) {
    const input = this.parseAtaIdentifier(inputAtaNumber);
    if (!input.original) return true;

    const real = this.parseAtaIdentifier(realAtaNumber);
    if (!real.original) return false;

    if (
      real.normalizedFull === input.normalizedFull ||
      (real.normalizedFull && input.normalizedFull.includes(real.normalizedFull))
    ) {
      return true;
    }

    const sameNumber = Boolean(real.number && real.number === input.number);
    const compatibleYear = !real.year || !input.year || real.year === input.year;
    return sameNumber && compatibleYear;
  }

  private normalizeNumber(value: unknown, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private summarizeExternalBody(body: string) {
    return body.replace(/\s+/g, " ").trim().slice(0, 500);
  }

  private getApiYearRanges(input: PreviewInput) {
    const year = Number(input.anoPregao.trim());
    if (!Number.isFinite(year)) {
      return [this.getLegacyYearRange(input)];
    }

    return [year, year + 1, year + 2].map((currentYear) => ({
      dataVigenciaInicialMin: `${currentYear}-01-01`,
      dataVigenciaInicialMax: `${currentYear}-12-31`,
    }));
  }

  private getLegacyYearRange(input: PreviewInput) {
    return {
      dataVigenciaInicialMin: `${input.anoPregao.trim()}-01-01`,
      dataVigenciaInicialMax: `${input.anoPregao.trim()}-12-31`,
    };
  }

  private normalizeCoverageLocalities(data: ImportInput): CoverageLocalityInput[] {
    const localities = [
      ...(data.coverageGroupLocalities ?? []),
      ...(data.coverageGroupCityName && data.coverageGroupStateUf
        ? [{ cityName: data.coverageGroupCityName, stateUf: data.coverageGroupStateUf }]
        : []),
    ]
      .map((locality) => ({
        cityName: locality.cityName.trim(),
        stateUf: locality.stateUf,
      }))
      .filter((locality) => locality.cityName);

    return localities.filter(
      (locality, index, array) =>
        index ===
        array.findIndex(
          (item) =>
            item.cityName.toLowerCase() === locality.cityName.toLowerCase() &&
            item.stateUf === locality.stateUf
        )
    );
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

    this.debug("URL chamada", { url: url.toString() });

    let response: Response;
    const debugEntry: ComprasGovRequestDebug = { url: url.toString() };
    this.requestDebug.push(debugEntry);

    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      debugEntry.errorBody = "Falha de rede ou timeout ao consultar API do Compras.gov.br";
      throw new ComprasGovApiError("Falha ao consultar API do Compras.gov.br", [
        { url: url.toString(), body: debugEntry.errorBody },
      ]);
    }

    debugEntry.status = response.status;
    this.debug("Status HTTP externo", { url: url.toString(), status: response.status });

    if (!response.ok) {
      const body = this.summarizeExternalBody(await response.text());
      debugEntry.errorBody = body;
      this.debug("Body externo resumido", { url: url.toString(), status: response.status, body });
      throw new ComprasGovApiError("API do Compras.gov.br retornou erro", [
        { url: url.toString(), status: response.status, body },
      ]);
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
    const externalTotal = firstPage.resultado?.length ?? 0;

    this.debug("Registros externos recebidos", {
      path,
      page: 1,
      pageRecords: externalTotal,
      totalPages: firstPage.totalPaginas ?? 1,
      cappedPages: totalPages,
    });

    for (let page = 2; page <= totalPages; page += 1) {
      const response = await this.requestComprasGov<ComprasGovListResponse<T>>(path, {
        ...params,
        pagina: page,
        tamanhoPagina: DEFAULT_PAGE_SIZE,
      });
      results.push(...(response.resultado ?? []));
      this.debug("Registros externos recebidos", {
        path,
        page,
        pageRecords: response.resultado?.length ?? 0,
      });
    }

    this.debug("Total de registros externos agregados", { path, records: results.length });

    return results;
  }

  private async requestAllPagesWithFallback<T>(
    path: string,
    strategies: Array<{ name: string; params: Record<string, string | number> }>
  ) {
    const failures: ComprasGovRequestFailure[] = [];

    for (const strategy of strategies) {
      try {
        this.debug("Tentando estrategia Compras.gov.br", { path, strategy: strategy.name });
        return await this.requestAllPages<T>(path, strategy.params);
      } catch (error) {
        if (!(error instanceof ComprasGovApiError)) {
          throw error;
        }

        failures.push(...error.failures);
        this.debug("Estrategia Compras.gov.br falhou", {
          path,
          strategy: strategy.name,
          failures: error.failures,
        });
      }
    }

    throw new ComprasGovApiError("API do Compras.gov.br retornou erro", failures);
  }

  private async requestAllPagesAcrossYearWindowsWithFallback<T>(
    path: string,
    baseParams: Record<string, string | number>,
    input: PreviewInput,
    fallbackStrategies: Array<{ name: string; params: Record<string, string | number> }>
  ) {
    const results: T[] = [];
    const failures: ComprasGovRequestFailure[] = [];

    for (const range of this.getApiYearRanges(input)) {
      try {
        this.debug("Tentando janela anual Compras.gov.br", { path, range });
        results.push(
          ...(await this.requestAllPages<T>(path, {
            ...baseParams,
            ...range,
          }))
        );
      } catch (error) {
        if (!(error instanceof ComprasGovApiError)) {
          throw error;
        }

        failures.push(...error.failures);
        this.debug("Janela anual Compras.gov.br falhou", { path, range, failures: error.failures });
      }
    }

    if (results.length > 0 || failures.length < this.getApiYearRanges(input).length) {
      return results;
    }

    const fallbackResults = await this.requestAllPagesWithFallback<T>(path, fallbackStrategies);
    return fallbackResults;
  }

  private filterAta(input: PreviewInput, ata: ComprasGovAta) {
    const numeroCompra = this.normalizeText(ata.numeroCompra);
    const anoCompra = this.normalizeText(ata.anoCompra);

    return (
      numeroCompra === input.numeroPregao.trim() &&
      anoCompra === input.anoPregao.trim() &&
      this.matchesAtaNumber(ata.numeroAtaRegistroPreco, input.numeroAta)
    );
  }

  private filterItem(input: PreviewInput, item: ComprasGovAtaItem) {
    const numeroCompra = this.normalizeText(item.numeroCompra);
    const anoCompra = this.normalizeText(item.anoCompra);

    return (
      numeroCompra === input.numeroPregao.trim() &&
      anoCompra === input.anoPregao.trim() &&
      this.matchesAtaNumber(item.numeroAtaRegistroPreco, input.numeroAta)
    );
  }

  private async fetchExternalAtas(input: PreviewInput) {
    const externalAtas = await this.requestAllPagesAcrossYearWindowsWithFallback<ComprasGovAta>(
      "/modulo-arp/1_consultarARP",
      {
        codigoUnidadeGerenciadora: input.uasg.trim(),
        numeroAtaRegistroPreco: "",
      },
      input,
      [
        {
          name: "compra-params-without-ata",
          params: {
            codigoUnidadeGerenciadora: input.uasg.trim(),
            numeroCompra: input.numeroPregao.trim(),
            anoCompra: input.anoPregao.trim(),
            numeroAtaRegistroPreco: "",
          },
        },
        {
          name: "legacy-pregao-year-vigencia",
          params: {
            codigoUnidadeGerenciadora: input.uasg.trim(),
            numeroAtaRegistroPreco: "",
            ...this.getLegacyYearRange(input),
          },
        },
      ]
    );
    const uniqueExternalAtas = this.uniqueBy(
      externalAtas,
      (ata, index) =>
        this.normalizeText(ata.numeroControlePncpAta) ||
        `${this.getAtaNumber(ata.numeroAtaRegistroPreco)}:${this.normalizeText(ata.numeroCompra)}:${this.normalizeText(ata.anoCompra)}:${index}`
    );
    const atas = uniqueExternalAtas.filter((ata) => this.filterAta(input, ata));

    this.debug("Filtros aplicados em ATAs", {
      filters: {
        uasg: input.uasg.trim(),
        numeroPregao: input.numeroPregao.trim(),
        anoPregao: input.anoPregao.trim(),
        numeroAta: input.numeroAta?.trim() ?? null,
      },
      externalRecords: uniqueExternalAtas.length,
      matchedRecords: atas.length,
      ataNumbersFound: uniqueExternalAtas.map((ata) => this.getAtaNumber(ata.numeroAtaRegistroPreco)),
      matchedAtaNumbers: atas.map((ata) => this.getAtaNumber(ata.numeroAtaRegistroPreco)),
    });

    return atas;
  }

  private async fetchExternalItems(input: PreviewInput) {
    const externalItems = await this.requestAllPagesAcrossYearWindowsWithFallback<ComprasGovAtaItem>(
      "/modulo-arp/2_consultarARPItem",
      {
        codigoUnidadeGerenciadora: input.uasg.trim(),
        numeroCompra: input.numeroPregao.trim(),
      },
      input,
      [
        {
          name: "compra-params-with-ano-without-vigencia",
          params: {
            codigoUnidadeGerenciadora: input.uasg.trim(),
            numeroCompra: input.numeroPregao.trim(),
            anoCompra: input.anoPregao.trim(),
          },
        },
        {
          name: "legacy-pregao-year-vigencia",
          params: {
            codigoUnidadeGerenciadora: input.uasg.trim(),
            numeroCompra: input.numeroPregao.trim(),
            ...this.getLegacyYearRange(input),
          },
        },
      ]
    );
    const uniqueExternalItems = this.uniqueBy(
      externalItems,
      (item, index) =>
        this.normalizeText(item.numeroControlePncpAta)
          ? `${this.normalizeText(item.numeroControlePncpAta)}:${this.normalizeText(item.numeroItem)}:${this.normalizeText(item.codigoItem)}`
          : `${this.getAtaNumber(item.numeroAtaRegistroPreco)}:${this.normalizeText(item.numeroItem)}:${this.normalizeText(item.codigoItem)}:${index}`
    );
    const items = uniqueExternalItems.filter((item) => this.filterItem(input, item));

    this.debug("Filtros aplicados em itens", {
      filters: {
        uasg: input.uasg.trim(),
        numeroPregao: input.numeroPregao.trim(),
        anoPregao: input.anoPregao.trim(),
        numeroAta: input.numeroAta?.trim() ?? null,
      },
      externalRecords: uniqueExternalItems.length,
      matchedRecords: items.length,
      ataNumbersFound: [...new Set(uniqueExternalItems.map((item) => this.getAtaNumber(item.numeroAtaRegistroPreco)))],
      matchedAtaNumbers: [...new Set(items.map((item) => this.getAtaNumber(item.numeroAtaRegistroPreco)))],
    });

    return items;
  }

  private async fetchExternalData(input: PreviewInput) {
    const atas = await this.fetchExternalAtas(input);

    if (atas.length === 0) {
      throw new AppError("Nenhuma ATA encontrada no Compras.gov.br", 404);
    }

    if (!input.numeroAta?.trim() && atas.length > 1) {
      throw new AppError("Foram encontradas varias ATAs. Selecione uma ATA para continuar.", 409);
    }

    const selectedAta = atas[0];
    const items = await this.fetchExternalItems(input);

    return { ata: selectedAta, items };
  }

  private normalizePreviewItems(externalItems: ComprasGovAtaItem[], ataNumber: string, warnings?: string[]) {
    return externalItems.map((item, index) => {
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

      if (warnings && !this.normalizeText(item.descricaoItem)) {
        warnings.push(`Item ${referenceCode} sem descricao na origem.`);
      }

      if (warnings && !item.valorUnitario) {
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
  }

  private buildFoundAta(ata: ComprasGovAta, items: ComprasGovAtaItem[]): FoundAtaPreview {
    const ataNumber = this.getAtaDisplayNumber(ata.numeroAtaRegistroPreco);
    const normalizedItems = this.normalizePreviewItems(items, this.getAtaNumber(ata.numeroAtaRegistroPreco));
    const totalAmount = normalizedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.initialQuantity,
      0
    );
    const vendorName =
      this.normalizeText(items.find((item) => item.nomeRazaoSocialFornecedor)?.nomeRazaoSocialFornecedor) ||
      null;

    return {
      ataNumber,
      vendorName,
      itemCount: items.length,
      totalAmount: items.length > 0 ? totalAmount : null,
      validFrom: this.normalizeDateString(ata.dataVigenciaInicial),
      validUntil: this.normalizeDateString(ata.dataVigenciaFinal),
      sampleItems: normalizedItems.slice(0, 3),
    };
  }

  private groupItemsByAta(items: ComprasGovAtaItem[]) {
    const grouped = new Map<string, ComprasGovAtaItem[]>();

    for (const item of items) {
      const ataNumber = this.getAtaNumber(item.numeroAtaRegistroPreco);
      const currentItems = grouped.get(ataNumber) ?? [];
      currentItems.push(item);
      grouped.set(ataNumber, currentItems);
    }

    return grouped;
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

    const items = this.normalizePreviewItems(externalItems, ataNumber, warnings);

    const vendorName =
      this.normalizeText(externalItems.find((item) => item.nomeRazaoSocialFornecedor)?.nomeRazaoSocialFornecedor) ||
      null;
    const foundAta = this.buildFoundAta(externalAta, externalItems);

    return {
      source: COMPRAS_GOV_SOURCE,
      uasg: input.uasg.trim(),
      numeroPregao: input.numeroPregao.trim(),
      anoPregao: input.anoPregao.trim(),
      ata: {
        number: this.formatAtaNumber(ataNumber, input),
        type: ataType,
        vendorName,
        managingAgency: managingAgency || input.uasg.trim(),
        validFrom: this.normalizeDateString(externalAta.dataVigenciaInicial),
        validUntil: this.normalizeDateString(externalAta.dataVigenciaFinal),
      },
      coverageGroups: [],
      items,
      atasFound: [foundAta],
      selectedAta: foundAta,
      warnings: [...new Set(warnings)],
    };
  }

  async preview(input: PreviewInput) {
    this.resetRequestDebug();

    try {
      const hasAtaFilter = Boolean(input.numeroAta?.trim());
      const atas = await this.fetchExternalAtas(input);
      const items = await this.fetchExternalItems(input);

      if (atas.length === 0) {
        if (items.length > 0) {
          return this.withPreviewDebug(input, {
            source: COMPRAS_GOV_SOURCE,
            uasg: input.uasg.trim(),
            numeroPregao: input.numeroPregao.trim(),
            anoPregao: input.anoPregao.trim(),
            ata: null,
            coverageGroups: [],
            items: [],
            atasFound: [],
            warnings: ["Pregao encontrado no Compras.gov.br, mas nenhuma ATA foi agrupada para os filtros informados."],
          });
        }

        throw new AppError("Nenhuma ATA encontrada no Compras.gov.br", 404);
      }

      const itemsByAta = this.groupItemsByAta(items);
      const atasFound = atas.map((ata) =>
        this.buildFoundAta(ata, itemsByAta.get(this.getAtaNumber(ata.numeroAtaRegistroPreco)) ?? [])
      );

      if (!hasAtaFilter && atasFound.length > 1) {
        return this.withPreviewDebug(input, {
          source: COMPRAS_GOV_SOURCE,
          uasg: input.uasg.trim(),
          numeroPregao: input.numeroPregao.trim(),
          anoPregao: input.anoPregao.trim(),
          ata: null,
          coverageGroups: [],
          items: [],
          atasFound,
          warnings: ["Foram encontradas várias ATAs. Selecione uma ATA para continuar."],
        });
      }

      const externalData = {
        ata: atas[0],
        items: itemsByAta.get(this.getAtaNumber(atas[0].numeroAtaRegistroPreco)) ?? [],
      };

      return this.withPreviewDebug(input, this.buildPreview(input, externalData.ata, externalData.items));
    } catch (error) {
      if (error instanceof ComprasGovApiError) {
        throw new AppError(this.formatExternalApiError(error), 502);
      }

      throw error;
    }
  }

  private async resolveCoverageGroup(ataId: string, data: ImportInput) {
    const localities = this.normalizeCoverageLocalities(data);
    const coverageGroupSelect = {
      id: true,
      code: true,
      name: true,
      localities: {
        select: {
          cityName: true,
          stateUf: true,
        },
        orderBy: [{ stateUf: "asc" as const }, { cityName: "asc" as const }],
      },
    };

    if (data.coverageGroupId) {
      const group = await prisma.ataCoverageGroup.findFirst({
        where: { id: data.coverageGroupId, ataId },
        select: { id: true },
      });

      if (!group) {
        throw new AppError("Grupo de cobertura nao encontrado para esta ata", 404);
      }

      await prisma.ataCoverageGroup.update({
        where: { id: group.id },
        data: {
          ...(data.coverageGroupName && { name: data.coverageGroupName.trim() }),
        },
      });

      for (const locality of localities) {
        await prisma.ataCoverageLocality.upsert({
          where: {
            coverageGroupId_cityName_stateUf: {
              coverageGroupId: group.id,
              cityName: locality.cityName,
              stateUf: locality.stateUf,
            },
          },
          update: {},
          create: {
            coverageGroupId: group.id,
            cityName: locality.cityName,
            stateUf: locality.stateUf,
          },
        });
      }

      return prisma.ataCoverageGroup.findUniqueOrThrow({
        where: { id: group.id },
        select: coverageGroupSelect,
      });
    }

    const code = (data.coverageGroupCode ?? "COMPRAS").trim().toUpperCase();
    const name = (data.coverageGroupName ?? "Compras.gov.br").trim();

    const group = await prisma.ataCoverageGroup.upsert({
      where: {
        ataId_code: {
          ataId,
          code,
        },
      },
      update: {
        ...(data.coverageGroupName && { name }),
      },
      create: {
        ataId,
        code,
        name,
      },
      select: { id: true },
    });

    for (const locality of localities) {
      await prisma.ataCoverageLocality.upsert({
        where: {
          coverageGroupId_cityName_stateUf: {
            coverageGroupId: group.id,
            cityName: locality.cityName,
            stateUf: locality.stateUf,
          },
        },
        update: {},
        create: {
          coverageGroupId: group.id,
          cityName: locality.cityName,
          stateUf: locality.stateUf,
        },
      });
    }

    return prisma.ataCoverageGroup.findUniqueOrThrow({
      where: { id: group.id },
      select: coverageGroupSelect,
    });
  }

  async importAta(data: ImportInput) {
    this.resetRequestDebug();
    const externalData = await this.fetchExternalData(data);
    const preview = this.buildPreview(data, externalData.ata, externalData.items, data.ataType);

    if (data.dryRun) {
      return {
        dryRun: true,
        preview,
        ata: null,
        coverageGroup: null,
        itemsCreated: 0,
        itemsUpdated: 0,
        warnings: preview.warnings,
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
          select: {
            id: true,
            ataCode: true,
            number: true,
            type: true,
            vendorName: true,
            managingAgency: true,
            validFrom: true,
            validUntil: true,
          },
        })
      : await prisma.ata.create({
          data: ataData as Prisma.AtaCreateInput,
          select: {
            id: true,
            ataCode: true,
            number: true,
            type: true,
            vendorName: true,
            managingAgency: true,
            validFrom: true,
            validUntil: true,
          },
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
      ata,
      coverageGroup,
      itemsCreated: createdItems,
      itemsUpdated: updatedItems,
      warnings: preview.warnings,
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
