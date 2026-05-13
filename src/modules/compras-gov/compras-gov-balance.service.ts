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
  valor: string | null;
  affectsManagedBalance: boolean;
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
  | "NAO_ENCONTRADO"
  | "ERRO_CONSULTA_EXTERNA"
  | "RATE_LIMIT_COMPRAS_GOV"
  | "SEM_EMPENHO_REGISTRADO";

type ExternalBalance = {
  externalItemNumber: string;
  source: "COMPRAS_GOV" | "COMPRAS_GOV_IMPORT_FALLBACK";
  registeredQuantity: Prisma.Decimal;
  committedQuantity: Prisma.Decimal;
  availableQuantity: Prisma.Decimal;
  lastUpdatedAt: Date | null;
  rawRecords: number;
  commitments: ExternalCommitment[];
  nonParticipantCommitments: ExternalCommitment[];
  adhesions: ExternalCommitment[];
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
    }
  ): ExternalCommitment | null {
    const numeroEmpenho = this.pickText(record, [
      "numeroEmpenho",
      "numeroNotaEmpenho",
      "notaEmpenho",
      "empenho",
      "numeroNe",
      "numeroNE",
      "ne",
      "notaDeEmpenho",
      "numeroNota",
      "numeroDocumento",
    ]);
    const quantidadeEmpenhada =
      options?.quantidadeEmpenhada ??
      this.pickNumber(record, [
        "quantidadeEmpenhada",
        "qtdEmpenhada",
        "quantidadeEmpenho",
        "qtdEmpenho",
        "quantidadeUtilizada",
        "qtdUtilizada",
        "quantidadeAprovadaAdesao",
        "quantidade",
        "quantidadeIncluida",
      ]);
    const quantidadeIncluida = this.pickNumber(record, [
      "quantidadeIncluida",
      "quantidadeAprovadaAdesao",
      "quantidade",
    ]);
    const valor = this.pickNumber(record, ["valor", "valorEmpenhado", "valorTotal"]);

    if (!numeroEmpenho && !quantidadeEmpenhada && !quantidadeIncluida && !valor) return null;

    return {
      numeroEmpenho,
      unidade:
        options?.unidade ??
        this.pickText(record, ["unidade", "codigoUnidade", "unidadeNaoParticipante"]),
      tipoUnidade: options?.tipoUnidade ?? this.pickText(record, ["tipoUnidade"]),
      fornecedor:
        options?.fornecedor ??
        this.pickText(record, ["fornecedor", "nomeRazaoSocialFornecedor", "credor"]),
      dataEmpenho: this.normalizeDate(
        record.dataEmpenho ?? record.dataEmissao ?? record.dataHoraInclusao ?? record.dataAprovacaoAnalise
      ),
      quantidadeIncluida: quantidadeIncluida?.toString() ?? null,
      quantidadeEmpenhada: quantidadeEmpenhada?.toString() ?? null,
      valor: valor?.toString() ?? null,
      affectsManagedBalance: options?.affectsManagedBalance ?? true,
    };
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
        "numeroNotaEmpenho",
        "notaEmpenho",
        "empenho",
        "numeroNe",
        "numeroNE",
        "ne",
        "notaDeEmpenho",
        "numeroNota",
        "numeroDocumento",
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

  private aggregateRecords(records: ComprasGovEmpenhoSaldoItem[]) {
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
          registeredQuantity: decimal(0),
          committedQuantity: decimal(0),
          availableQuantity: decimal(0),
          lastUpdatedAt: null,
          rawRecords: 0,
          commitments: [],
          nonParticipantCommitments: [],
          adhesions: [],
        };

      const updatedAt = this.normalizeDate(record.dataHoraAtualizacao);
      current.registeredQuantity = current.registeredQuantity.add(this.normalizeNumber(record.quantidadeRegistrada));
      current.committedQuantity = current.committedQuantity.add(this.normalizeNumber(record.quantidadeEmpenhada));
      current.availableQuantity = current.availableQuantity.add(this.normalizeNumber(record.saldoEmpenho));
      const commitment = this.buildCommitment(record);
      if (commitment?.numeroEmpenho) {
        current.commitments.push(commitment);
      }
      current.lastUpdatedAt =
        updatedAt && (!current.lastUpdatedAt || updatedAt > current.lastUpdatedAt)
          ? updatedAt
          : current.lastUpdatedAt;
      current.rawRecords += 1;
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
            balances: this.aggregateRecords(records),
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
            balances: this.aggregateRecords(records),
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
          fornecedor: this.normalizeText(record.fornecedor) || null,
          affectsManagedBalance: true,
          quantidadeEmpenhada: this.getCommittedQuantityFromUnit(record),
        })
      )
      .filter((commitment): commitment is ExternalCommitment => Boolean(commitment));
    const nonParticipantCommitments = [
      ...nonParticipantUnits
        .filter((record) => this.hasCommitmentNumber(record))
        .map((record) =>
          this.buildCommitment(record, {
            unidade: [
              this.getUnitCode(record),
              this.normalizeText(record.nomeUnidade),
            ].filter(Boolean).join(" - ") || this.pickText(record, ["unidade"]) || null,
            tipoUnidade: this.normalizeText(record.tipoUnidade) || "NAO_PARTICIPANTE",
            fornecedor: this.normalizeText(record.fornecedor) || null,
            affectsManagedBalance: false,
            quantidadeEmpenhada: this.getCommittedQuantityFromUnit(record),
          })
        ),
      ...matchingAdesoes
        .filter((record) => this.hasCommitmentNumber(record))
        .map((record) =>
          this.buildCommitment(record, {
            unidade: this.normalizeText(record.unidadeNaoParticipante) || null,
            tipoUnidade: "NAO_PARTICIPANTE",
            affectsManagedBalance: false,
          })
        ),
    ].filter((commitment): commitment is ExternalCommitment => Boolean(commitment));
    const adhesions = [
      ...nonParticipantCommitments,
      ...matchingAdesoes
        .filter((record) => !this.hasCommitmentNumber(record))
        .map((record) =>
          this.buildCommitment(record, {
            unidade: this.normalizeText(record.unidadeNaoParticipante) || null,
            tipoUnidade: "NAO_PARTICIPANTE",
            affectsManagedBalance: false,
          })
        )
        .filter((commitment): commitment is ExternalCommitment => Boolean(commitment)),
    ];

    const balance: ExternalBalance = {
      externalItemNumber: this.normalizeText(externalItem?.numeroItem) || numeroItem,
      source: "COMPRAS_GOV",
      registeredQuantity,
      committedQuantity,
      availableQuantity,
      lastUpdatedAt,
      rawRecords: records.length,
      commitments,
      nonParticipantCommitments,
      adhesions,
      matchKey: pncpAta
        ? `numeroControlePncpAta:${pncpAta};numeroItem:${numeroItem}`
        : `numeroAta:${numeroAta};numeroItem:${numeroItem}`,
    };

    if (this.requestDebug.length > 0) {
      this.requestDebug[this.requestDebug.length - 1].sampleCommitments = [
        ...commitments,
        ...nonParticipantCommitments,
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
      registeredQuantity: initialQuantity,
      committedQuantity: decimal(0),
      availableQuantity: initialQuantity,
      lastUpdatedAt: item.externalLastSyncAt,
      rawRecords: 0,
      commitments: [],
      nonParticipantCommitments: [],
      adhesions: [],
    };
  }

  private resolveStatus(
    localBalance: Awaited<ReturnType<typeof ataItemBalanceService.getBalanceForAtaItem>>,
    externalBalance: ExternalBalance | undefined
  ) {
    const localAvailable = decimal(localBalance.availableQuantity);
    const externalAvailable = externalBalance?.availableQuantity ?? null;
    const localConsumed = decimal(localBalance.consumedQuantity);

    if (!externalAvailable) return "NAO_ENCONTRADO" satisfies BalanceComparisonStatus;
    if (externalBalance?.committedQuantity.greaterThan(0) && localConsumed.equals(0)) {
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
    const externalAvailable = externalBalance?.availableQuantity ?? null;
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
            registeredQuantity: externalBalance.registeredQuantity.toString(),
            committedQuantity: externalBalance.committedQuantity.toString(),
            availableQuantity: externalBalance.availableQuantity.toString(),
            lastUpdatedAt: externalBalance.lastUpdatedAt,
            rawRecords: externalBalance.rawRecords,
            commitments: externalBalance.commitments,
            nonParticipantCommitments: externalBalance.nonParticipantCommitments,
            adhesions: externalBalance.adhesions,
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

  async compareAta(ataId: string) {
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

  async compareItem(ataItemId: string) {
    const item = await prisma.ataItem.findUnique({
      where: { id: ataItemId },
      select: {
        id: true,
        ataId: true,
      },
    });

    if (!item) {
      throw new AppError("Item da ata nao encontrado", 404);
    }

    const comparison = await this.compareAta(item.ataId);
    const itemComparison = comparison.items.find((candidate) => candidate.item.id === item.id);

    if (!itemComparison) {
      throw new AppError("Comparacao de saldo nao encontrada para o item", 404);
    }

    return {
      source: comparison.source,
      ata: comparison.ata,
      comparedAt: comparison.comparedAt,
      ...itemComparison,
    };
  }

  async syncItem(ataItemId: string) {
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
        ...comparison,
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
    const comparison = await this.compareAta(ataId);
    const now = new Date();
    const hasExternalError = comparison.items.some((item) =>
      ["ERRO_CONSULTA_EXTERNA", "RATE_LIMIT_COMPRAS_GOV"].includes(item.status)
    );

    if (hasExternalError) {
      return {
        ...comparison,
        syncedAt: null,
        updatedItems: 0,
        warnings: [
          ...comparison.warnings,
          "Sincronizacao nao concluida; timestamp externo nao foi atualizado.",
        ],
      };
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

    return {
      ...comparison,
      syncedAt: now,
      updatedItems: comparison.items.filter((item) => item.externalBalance).length,
      warnings: [
        "Saldo local nao foi alterado automaticamente; apenas snapshot/timestamp externo foi atualizado.",
        ...comparison.warnings,
      ],
    };
  }
}

export const comprasGovBalanceService = new ComprasGovBalanceService();
