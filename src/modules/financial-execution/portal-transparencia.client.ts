import { env } from "../../config/env.js";
import { systemSettingsService } from "../system-settings/system-settings.service.js";
import { AppError } from "../../shared/app-error.js";

export type FinancialPhase = "EMPENHO" | "LIQUIDACAO" | "PAGAMENTO" | "ANULACAO" | "OUTRO";

export type ParsedFinancialDocument = {
  externalCode: string;
  number: string;
  phase: FinancialPhase;
  species: string | null;
  issuedAt: Date | null;
  amount: number;
  supplierName: string | null;
  supplierCnpj: string | null;
  rawSnapshot: Record<string, unknown>;
};

export type CommitmentNoteSnapshot = {
  source: "PORTAL_TRANSPARENCIA" | "MANUAL";
  externalCode: string;
  number: string;
  managementUnit: string;
  management: string;
  supplierName: string | null;
  supplierCnpj: string | null;
  issuedAt: Date | null;
  originalAmount: number;
  currentAmount: number;
  liquidatedAmount: number;
  paidAmount: number;
  cancelledAmount: number;
  financialStatus: "NAO_LIQUIDADA" | "PARCIALMENTE_LIQUIDADA" | "LIQUIDADA" | "PARCIALMENTE_PAGA" | "PAGA" | "PARCIALMENTE_ANULADA" | "ANULADA";
  documents: ParsedFinancialDocument[];
  rawSnapshot: Record<string, unknown>;
  fetchedAt: Date;
};

export type PortalCommitmentSnapshot = CommitmentNoteSnapshot & {
  source: "PORTAL_TRANSPARENCIA";
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function flatten(record: JsonRecord, target = new Map<string, unknown>()) {
  for (const [key, value] of Object.entries(record)) {
    const normalized = normalizeKey(key);
    if (!target.has(normalized)) target.set(normalized, value);
    const nested = asRecord(value);
    if (nested) flatten(nested, target);
  }
  return target;
}

function valueFor(record: JsonRecord, keys: string[]) {
  const values = flatten(record);
  for (const key of keys) {
    const value = values.get(normalizeKey(key));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function stringFor(record: JsonRecord, keys: string[]) {
  const value = valueFor(record, keys);
  return value === undefined ? null : String(value).trim() || null;
}

function decimalFor(record: JsonRecord, keys: string[]) {
  const value = valueFor(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/R\$/gi, "").replace(/\s/g, "");
  const decimal = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const parsed = Number(decimal.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateFor(record: JsonRecord, keys: string[]) {
  const value = stringFor(record, keys);
  if (!value) return null;
  const brazilian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const parsed = brazilian
    ? new Date(`${brazilian[3]}-${brazilian[2]}-${brazilian[1]}T00:00:00.000Z`)
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeCnpj(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === 14 ? digits : value;
}

function phaseFor(record: JsonRecord): FinancialPhase {
  const phase = `${stringFor(record, ["fase", "descricaoFase", "tipoDocumento", "especie"]) ?? ""} ${stringFor(record, ["numeroDocumento", "documento", "codigo"]) ?? ""}`.toUpperCase();
  if (phase.includes("LIQUID" ) || phase.includes("NS")) return "LIQUIDACAO";
  if (phase.includes("PAGAMENTO") || phase.includes("OB")) return "PAGAMENTO";
  if (phase.includes("ANULA") || phase.includes("CANCEL")) return "ANULACAO";
  if (phase.includes("EMPENHO") || phase.includes("NE")) return "EMPENHO";
  return "OUTRO";
}

function relatedRecords(record: JsonRecord) {
  const candidates: JsonRecord[] = [];
  const visit = (value: unknown, parentKey = "") => {
    if (Array.isArray(value)) {
      if (/document|relacion/i.test(parentKey)) {
        for (const item of value) {
          const parsed = asRecord(item);
          if (parsed) candidates.push(parsed);
        }
      }
      return;
    }
    const parsed = asRecord(value);
    if (!parsed) return;
    for (const [key, nested] of Object.entries(parsed)) visit(nested, key);
  };
  visit(record);
  return candidates;
}

function recordsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload.map(asRecord).filter((item): item is JsonRecord => Boolean(item));
  const root = asRecord(payload);
  if (!root) return [];
  const nested = relatedRecords(root);
  return nested.length ? nested : [root];
}

async function fetchPortalJson(url: string, token: string, notFoundMessage: string) {
  const response = await fetch(url, {
    headers: { "chave-api-dados": token, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    throw new AppError("Portal da Transparência indisponível", 502, "PORTAL_TRANSPARENCIA_UNAVAILABLE", { cause: error instanceof Error ? error.message : String(error) });
  });

  if (response.status === 404) throw new AppError(notFoundMessage, 404, "PORTAL_TRANSPARENCIA_NOT_FOUND", { url });
  if (response.status === 429) throw new AppError("Limite de consultas do Portal da Transparência atingido", 429, "PORTAL_TRANSPARENCIA_RATE_LIMIT");
  if (!response.ok) throw new AppError("Falha ao consultar o Portal da Transparência", 502, "PORTAL_TRANSPARENCIA_ERROR", { status: response.status, url });
  return response.json() as Promise<unknown>;
}

function parseDocument(record: JsonRecord, fallbackCode: string): ParsedFinancialDocument {
  const number = stringFor(record, ["numeroDocumento", "documentoResumido", "documento", "numero", "codigoDocumento"]) ?? fallbackCode.slice(11);
  return {
    externalCode: stringFor(record, ["codigoDocumento", "codigo", "idDocumento"]) ?? `${fallbackCode}:${number}`,
    number,
    phase: phaseFor(record),
    species: stringFor(record, ["especie", "tipoDocumento", "descricaoDocumento"]),
    issuedAt: dateFor(record, ["data", "dataDocumento", "dataEmissao"]),
    amount: decimalFor(record, ["valor", "valorDocumento", "valorEmpenhado", "valorLiquidado", "valorPago"]),
    supplierName: stringFor(record, ["nomeFavorecido", "favorecido", "nomeFornecedor", "razaoSocial"]),
    supplierCnpj: normalizeCnpj(stringFor(record, ["codigoFavorecido", "cpfCnpj", "cnpj", "cnpjFornecedor"])),
    rawSnapshot: record,
  };
}

function deriveStatus(current: number, liquidated: number, paid: number, cancelled: number, documents: ParsedFinancialDocument[]): PortalCommitmentSnapshot["financialStatus"] {
  const tolerance = 0.01;
  if (current <= tolerance && cancelled > tolerance) return "ANULADA";
  if (cancelled > tolerance) return "PARCIALMENTE_ANULADA";
  const hasPayment = documents.some((item) => item.phase === "PAGAMENTO");
  const hasLiquidation = documents.some((item) => item.phase === "LIQUIDACAO");
  if ((paid > tolerance && paid + tolerance >= current) || (hasPayment && paid === 0)) return "PAGA";
  if (paid > tolerance) return "PARCIALMENTE_PAGA";
  if ((liquidated > tolerance && liquidated + tolerance >= current) || (hasLiquidation && liquidated === 0)) return "LIQUIDADA";
  if (liquidated > tolerance) return "PARCIALMENTE_LIQUIDADA";
  return "NAO_LIQUIDADA";
}

export function buildCommitmentExternalCode(managementUnit: string, management: string, number: string) {
  return `${managementUnit}${management}${number.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
}

export class PortalTransparenciaClient {
  isConfigured() {
    return Boolean(env.PORTAL_TRANSPARENCIA_API_TOKEN?.trim());
  }

  async fetchCommitmentNote(managementUnit: string, management: string, number: string): Promise<PortalCommitmentSnapshot> {
    const token = env.PORTAL_TRANSPARENCIA_API_TOKEN?.trim();
    if (!token) {
      throw new AppError("Token do Portal da Transparência não configurado", 503, "PORTAL_TRANSPARENCIA_NOT_CONFIGURED");
    }

    const externalCode = buildCommitmentExternalCode(managementUnit, management, number);
    const settings = await systemSettingsService.getEffective();
    const baseUrl = settings.portalTransparenciaBaseUrl.replace(/\/$/, "");
    const payload = await fetchPortalJson(
      `${baseUrl}/despesas/documentos/${encodeURIComponent(externalCode)}`,
      token,
      "Nota de Empenho não localizada no Portal da Transparência",
    );
    const root = Array.isArray(payload) ? asRecord(payload[0]) : asRecord(payload);
    if (!root) throw new AppError("Resposta inválida do Portal da Transparência", 502, "PORTAL_TRANSPARENCIA_INVALID_RESPONSE");

    const baseDocument = parseDocument(root, externalCode);
    baseDocument.phase = "EMPENHO";
    baseDocument.externalCode = externalCode;
    const relatedUrl = new URL(`${baseUrl}/despesas/documentos-relacionados`);
    relatedUrl.searchParams.set("codigoDocumento", externalCode);
    relatedUrl.searchParams.set("fase", "1");
    const relatedPayload = await fetchPortalJson(
      relatedUrl.toString(),
      token,
      "Documentos relacionados da Nota de Empenho não foram localizados",
    );
    const relatedDocuments = await Promise.all(recordsFromPayload(relatedPayload).map(async (relation) => {
      const summary = parseDocument(relation, externalCode);
      if (!/^\d{6}\d{5}\d{4}(?:NS|OB|NE)\d{6}$/i.test(summary.externalCode) || summary.externalCode === externalCode) return summary;
      try {
        const detailPayload = await fetchPortalJson(
          `${baseUrl}/despesas/documentos/${encodeURIComponent(summary.externalCode)}`,
          token,
          `Documento relacionado ${summary.number} não localizado`,
        );
        const detail = Array.isArray(detailPayload) ? asRecord(detailPayload[0]) : asRecord(detailPayload);
        if (!detail) return summary;
        const enriched = parseDocument({ ...relation, ...detail }, summary.externalCode);
        enriched.phase = summary.phase === "OUTRO" ? enriched.phase : summary.phase;
        enriched.rawSnapshot = { relation, detail };
        return enriched;
      } catch {
        return summary;
      }
    }));
    const documents = [baseDocument, ...relatedDocuments]
      .filter((item, index, all) => all.findIndex((candidate) => candidate.externalCode === item.externalCode) === index);
    const originalAmount = decimalFor(root, ["valorOriginalDoEmpenho", "valorOriginal", "valorEmpenhado", "valor"]);
    const cancelledAmount = documents.filter((item) => item.phase === "ANULACAO").reduce((sum, item) => sum + Math.abs(item.amount), 0);
    const currentFromPortal = decimalFor(root, ["valorAtualDoEmpenho", "valorAtual", "saldoEmpenho"]);
    const currentAmount = currentFromPortal || Math.max(0, originalAmount - cancelledAmount);
    const liquidatedAmount = documents.filter((item) => item.phase === "LIQUIDACAO").reduce((sum, item) => sum + Math.abs(item.amount), 0);
    const paidAmount = documents.filter((item) => item.phase === "PAGAMENTO").reduce((sum, item) => sum + Math.abs(item.amount), 0);

    return {
      source: "PORTAL_TRANSPARENCIA",
      externalCode,
      number: number.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      managementUnit,
      management,
      supplierName: baseDocument.supplierName,
      supplierCnpj: baseDocument.supplierCnpj,
      issuedAt: baseDocument.issuedAt,
      originalAmount,
      currentAmount,
      liquidatedAmount,
      paidAmount,
      cancelledAmount,
      financialStatus: deriveStatus(currentAmount, liquidatedAmount, paidAmount, cancelledAmount, documents),
      documents,
      rawSnapshot: root,
      fetchedAt: new Date(),
    };
  }
}

export const portalTransparenciaClient = new PortalTransparenciaClient();
