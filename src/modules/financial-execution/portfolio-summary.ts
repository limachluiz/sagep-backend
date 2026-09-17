import type { PaymentEvidence } from "./ne-payment-evidence.js";
type Json = Record<string, unknown>;
export function moneyFrom(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const s = value.replace(/R\$|\s/gi, "");
  if (!/^-?\d+(?:[.,]\d+)*$/.test(s)) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}
function field(root: Json, names: string[]): unknown {
  for (const name of names) if (root[name] !== undefined && root[name] !== null) return root[name];
  return undefined;
}
export function archivedFinancial(snapshot: unknown, externalCode?: string) {
  const data = snapshot as { document?: Json | Json[]; financial?: PaymentEvidence } | null;
  const raw = data?.document;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const root: Json = candidate && typeof candidate === "object" ? candidate : {};
  const current = moneyFrom(field(root, ["valorAtualDoEmpenho", "valorAtual", "saldoEmpenho", "valorEmpenhado", "valor"]));
  const evidence = data?.financial?.version === 1 && data.financial.externalCode === (externalCode ?? root.documento) ? data.financial : undefined;
  const liquidated = moneyFrom(field(root, ["valorLiquidado", "valorLiquidadoDoEmpenho"])) ?? evidence?.liquidated ?? null;
  const paid = moneyFrom(field(root, ["valorPago", "valorPagoDoEmpenho"])) ?? evidence?.paid ?? null;
  const beneficiary = root.favorecido && typeof root.favorecido === "object" ? root.favorecido as Json : {};
  const supplier = field(root, ["nomeFavorecido", "nomeFornecedor", "nomePessoa", "razaoSocial"]) ?? field(beneficiary, ["nome", "razaoSocial"]) ?? (typeof root.favorecido === "string" ? root.favorecido : undefined);
  const supplierName = typeof supplier === "string" ? supplier : "Não informado";
  return financialPosition(current, liquidated, paid, supplierName);
}
export function financialPosition(current: number | null, liquidated: number | null, paid: number | null, supplierName: string) {
  const inconsistent = [current, liquidated, paid].some(v => v !== null && v < 0) || (current !== null && paid !== null && paid > current + 0.01) || (current !== null && liquidated !== null && liquidated > current + 0.01) || (liquidated !== null && paid !== null && paid > liquidated + 0.01);
  const incomplete = current === null || liquidated === null || paid === null;
  const status = inconsistent ? "DIVERGENTE" : paid !== null && paid > 0 && current !== null && paid >= current - 0.01 ? "PAGA" : paid !== null && paid > 0 ? "PARCIALMENTE_PAGA" : liquidated !== null && liquidated > 0 && current !== null && liquidated >= current - 0.01 ? "LIQUIDADA" : liquidated !== null && liquidated > 0 ? "PARCIALMENTE_LIQUIDADA" : incomplete ? "A_CONFERIR" : "NAO_LIQUIDADA";
  return { current, liquidated, paid, supplierName, status, inconsistent, incomplete };
}

// Ignore archive copies for every active project NE, including projects outside the user's scope.
type PortfolioAmount = ReturnType<typeof financialPosition> & { externalCode: string };
export function consolidatePortfolio<T extends PortfolioAmount, U extends PortfolioAmount>(projects: T[], archives: U[], activeCodes: string[]) {
  const registered = new Set(activeCodes);
  const unique = new Map<string, T | U>();
  for (const row of projects) unique.set(row.externalCode, row);
  for (const row of archives) if (!registered.has(row.externalCode) && !unique.has(row.externalCode)) unique.set(row.externalCode, row);
  const rows = [...unique.values()];
  const totals = rows.reduce((sum, row) => {
    if (!row.inconsistent) { sum.committed += row.current ?? 0; sum.liquidated += row.liquidated ?? 0; sum.paid += row.paid ?? 0; }
    if (row.inconsistent || row.incomplete) sum.pending++;
    return sum;
  }, { committed: 0, liquidated: 0, paid: 0, pending: 0 });
  totals.committed = Math.round(totals.committed * 100) / 100;
  totals.liquidated = Math.round(totals.liquidated * 100) / 100;
  totals.paid = Math.round(totals.paid * 100) / 100;
  const coverage = { committed: 0, liquidated: 0, paid: 0 };
  for (const row of rows) if (!row.inconsistent) {
    if (row.current !== null) coverage.committed++;
    if (row.liquidated !== null) coverage.liquidated++;
    if (row.paid !== null) coverage.paid++;
  }
  return { rows, totals, coverage, total: rows.length };
}
