import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";

const COMPRAS_GOV_BASE_URL = "https://dadosabertos.compras.gov.br";
const COMPRAS_GOV_SOURCE = "COMPRAS_GOV";
const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 20;

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

type ExternalRequestDebug = {
  url: string;
  status?: number;
  body?: string;
  recordsReturned?: number;
  sampleRecords?: unknown[];
  ataNumberTried?: string;
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
};

type BalanceComparisonStatus =
  | "OK"
  | "DIVERGENTE"
  | "CONSUMO_EXTERNO_DETECTADO"
  | "NAO_ENCONTRADO"
  | "ERRO_CONSULTA_EXTERNA"
  | "SEM_EMPENHO_REGISTRADO";

type ExternalBalance = {
  externalItemNumber: string;
  source: "COMPRAS_GOV" | "COMPRAS_GOV_IMPORT_FALLBACK";
  registeredQuantity: Prisma.Decimal;
  committedQuantity: Prisma.Decimal;
  availableQuantity: Prisma.Decimal;
  lastUpdatedAt: Date | null;
  rawRecords: number;
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
    context?: { ataNumberTried?: string }
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
    context?: { ataNumberTried?: string }
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
        };

      const updatedAt = this.normalizeDate(record.dataHoraAtualizacao);
      current.registeredQuantity = current.registeredQuantity.add(this.normalizeNumber(record.quantidadeRegistrada));
      current.committedQuantity = current.committedQuantity.add(this.normalizeNumber(record.quantidadeEmpenhada));
      current.availableQuantity = current.availableQuantity.add(this.normalizeNumber(record.saldoEmpenho));
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
        failures.push(error as ExternalRequestError);
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
    };
  }

  private resolveStatus(localAvailable: Prisma.Decimal, externalAvailable: Prisma.Decimal | null) {
    if (!externalAvailable) return "NAO_ENCONTRADO" satisfies BalanceComparisonStatus;
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
          }
        : null,
      difference: difference?.toString() ?? null,
      lastSyncAt: item.externalLastSyncAt,
      status: externalError
        ? ("ERRO_CONSULTA_EXTERNA" satisfies BalanceComparisonStatus)
        : fallbackReason
          ? ("SEM_EMPENHO_REGISTRADO" satisfies BalanceComparisonStatus)
        : this.resolveStatus(localAvailable, externalAvailable),
      externalError: externalError
        ? {
            status: externalError.status ?? null,
            url: externalError.url ?? null,
            body: externalError.body ?? externalError.message,
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

    const localBalanceMap = await ataItemBalanceService.getBalanceMapForAtaItems(ata.items);
    const useImportFallback = externalResult.records.length === 0 && externalResult.error === null;
    const items = ata.items.map((item) =>
    {
      const externalBalance =
        this.findExternalBalance(item, externalResult.balances) ??
        (useImportFallback ? this.buildImportFallbackBalance(item) : undefined);

      return this.buildComparison(
        item,
        localBalanceMap.get(item.id)!,
        externalBalance,
        undefined,
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
        ...(useImportFallback
          ? [
              "Compras.gov.br não retornou empenhos para esta ATA. Saldo externo exibido com base na quantidade registrada importada.",
            ]
          : []),
      ],
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

  async syncAta(ataId: string) {
    const comparison = await this.compareAta(ataId);
    const now = new Date();

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
