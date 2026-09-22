import { createHash } from "node:crypto";
import { moneyFrom } from "./portfolio-summary.js";

type RecordValue = Record<string, unknown>;
export type PaymentEvidence = {
  version: 1 | 2 | 3; externalCode: string; checkedAt: string;
  liquidated: number | null; paid: number | null;
  paidNet?: number | null; deductions?: number | null;
  liquidatedComplete?: boolean; paidComplete?: boolean;
  documents: Array<{ code: string; phase: 2 | 3; amount: number | null; subitems: RecordValue[]; error?: string }>;
};
const fullCode = /^\d{15}(?:NE|NS|OB)\d{6}$/;
export function financialDocumentType(code: unknown): "NS" | "OB" | "DR" | "DF" | null {
  const match = String(code ?? "").trim().toUpperCase().match(/^\d{15}(NS|OB|DR|DF)\d{6}$/);
  return match?.[1] as "NS" | "OB" | "DR" | "DF" | undefined ?? null;
}
const cache = new Map<string, { expires: number; value: Promise<RecordValue[]> }>();
type PortalFetcher = (url: string, token: string, notFoundMessage: string, options?: { allowEmptyArray?: boolean }) => Promise<unknown>;
export function paymentPhase(value: unknown, code?: unknown): 2 | 3 | null {
  const documentType = code === undefined ? null : financialDocumentType(code);
  if (code !== undefined && !documentType) return null;
  const phase = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const declared = phase === "2" || phase.includes("LIQUIDA") ? 2 : phase === "3" || phase.includes("PAGAMENTO") ? 3 : null;
  if (documentType === "NS") return declared === 3 ? null : 2;
  if (documentType === "OB") return declared === 2 ? null : 3;
  if (documentType === "DR" || documentType === "DF") return null;
  return declared;
}
async function impacts(base: string, token: string, code: string, phase: 2 | 3, fetchPortalJson: PortalFetcher): Promise<RecordValue[]> {
  // Auth is part of the cache key without storing the credential in plain text.
  const key = `${base}:${createHash("sha256").update(token).digest("hex")}:${code}:${phase}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (cache.size >= 300) cache.delete(cache.keys().next().value!);
  const entry = { expires: Date.now() + 300_000, value: Promise.resolve([] as RecordValue[]) };
  entry.value = (async () => {
    const rows: RecordValue[] = [], pages = new Set<string>();
    const started = Date.now();
    for (let page = 1; page <= 100; page++) {
      if (Date.now() - started > 60_000) throw new Error("Consulta de empenhos impactados excedeu o prazo; tente novamente");
      const url = new URL(`${base}/despesas/empenhos-impactados`);
      url.searchParams.set("codigoDocumento", code); url.searchParams.set("fase", String(phase)); url.searchParams.set("pagina", String(page));
      const payload = await fetchPortalJson(url.toString(), token, "Empenhos impactados indisponíveis", { allowEmptyArray: true });
      if (!Array.isArray(payload) || payload.some(r => !r || typeof r !== "object" || Array.isArray(r))) throw new Error("Formato inesperado dos empenhos impactados");
      if (!payload.length) return rows;
      const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      if (pages.has(fingerprint)) throw new Error("Fonte repetiu uma página de empenhos impactados");
      pages.add(fingerprint); rows.push(...payload);
    }
    throw new Error("Limite de páginas de empenhos impactados atingido");
  })().catch(error => { if (cache.get(key) === entry) cache.delete(key); throw error; });
  cache.set(key, entry);
  return entry.value;
}
export function amountForNote(rows: RecordValue[], externalCode: string, phase: 2 | 3) {
  const unique = new Map<string, RecordValue>();
  for (const row of rows) {
    if (String(row.empenho ?? "").trim() !== externalCode) continue;
    // The API identifies one allocation by NE and subitem; never use a shortened number across UGs.
    if (row.subitem == null) throw new Error("Fonte não identificou o subitem do empenho impactado");
    const key = String(row.subitem);
    const old = unique.get(key);
    if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new Error("Fonte retornou valores conflitantes para o mesmo subitem");
    unique.set(key, row);
  }
  const subitems = [...unique.values()];
  if (!subitems.length) return { amount: null, subitems };
  let total = 0;
  for (const row of subitems) {
    const amount = moneyFrom(phase === 2 ? row.valorLiquidado : row.valorPago);
    const rest = phase === 3 && row.valorRestoPago != null && row.valorRestoPago !== "" ? moneyFrom(row.valorRestoPago) : 0;
    if (amount === null || rest === null) return { amount: null, subitems };
    total += amount + rest;
  }
  return { amount: Math.round(total * 100) / 100, subitems };
}
export async function collectPaymentEvidence(base: string, token: string, externalCode: string, related: unknown, fetchPortalJson: PortalFetcher): Promise<PaymentEvidence> {
  if (!Array.isArray(related)) throw new Error("Formato inesperado dos documentos relacionados");
  const documents: PaymentEvidence["documents"] = [];
  const seen = new Set<string>();
  for (const row of related) {
    const code = String(row.documento ?? row.codigoDocumento ?? "").trim();
    // DR/DF and other auxiliary records describe deductions/retentions. They are
    // evidence attached to the payment, not another amount still to be paid.
    const phase = paymentPhase(row?.fase, code);
    if (!phase) continue;
    const key = `${phase}:${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fullCode.test(code)) { documents.push({ code, phase, amount: null, subitems: [], error: "Código completo do documento não informado" }); continue; }
    try {
      const result = amountForNote(await impacts(base, token, code, phase, fetchPortalJson), externalCode, phase);
      documents.push({ code, phase, ...result, ...(result.amount === null ? { error: "Valor desta NE não confirmado nos subitens" } : {}) });
    } catch (error) { documents.push({ code, phase, amount: null, subitems: [], error: error instanceof Error ? error.message : "Fonte indisponível" }); }
  }
  const sum = (phase: 2 | 3) => {
    const items = documents.filter(d => d.phase === phase);
    const known = items.filter(d => d.amount !== null);
    return {
      amount: known.length ? Math.round(known.reduce((n,d) => n + d.amount!, 0) * 100) / 100 : null,
      complete: items.length > 0 && known.length === items.length,
    };
  };
  const liquidated = sum(2), paid = sum(3);
  const deductionRows = related.filter(row => ["DR", "DF"].includes(financialDocumentType(row?.documento ?? row?.codigoDocumento) ?? ""));
  const deductionByCode = new Map<string, number>();
  let deductionsValid = deductionRows.length > 0;
  for (const row of deductionRows) {
    const code = String(row?.documento ?? row?.codigoDocumento ?? "").trim();
    const amount = moneyFrom(row?.valor ?? row?.valorDocumento);
    const previous = deductionByCode.get(code);
    if (amount === null || (previous !== undefined && Math.abs(previous - amount) > 0.001)) { deductionsValid = false; break; }
    deductionByCode.set(code, amount);
  }
  const deductions = deductionsValid
    ? Math.round([...deductionByCode.values()].reduce((total, value) => total + value, 0) * 100) / 100
    : null;
  const grossPaid = paid.amount !== null && deductions !== null && deductions > 0 && liquidated.amount !== null
    && Math.abs(paid.amount + deductions - liquidated.amount) <= 0.01
    ? Math.round((paid.amount + deductions) * 100) / 100
    : paid.amount;
  return {
    version: 3,
    externalCode,
    checkedAt: new Date().toISOString(),
    liquidated: liquidated.amount,
    paid: grossPaid,
    paidNet: paid.amount,
    deductions,
    liquidatedComplete: liquidated.complete,
    paidComplete: paid.complete,
    documents,
  };
}
