import { describe, expect, it } from "vitest";
import { archivedFinancial, creditNotesFrom, financialPosition, consolidatePortfolio, moneyFrom } from "../src/modules/financial-execution/portfolio-summary.js";
describe("consolidated portfolio", () => {
  it("keeps missing liquidation/payment unknown even if related documents are absent", () => {
    expect(archivedFinancial({ document: { valor: "R$ 1.234,56", nomeFavorecido: "Fornecedor" }, related: [] })).toMatchObject({ current: 1234.56, liquidated: null, paid: null, status: "A_CONFERIR", incomplete: true, supplierName: "Fornecedor" });
  });
  it("extracts the issue date and only NC references present in the saved official data", () => {
    const snapshot = { document: { data: "21/01/2026", observacao: "Crédito recebido pela 2026NC400044/DCT", codigoDocumento: "160016000012026NC400044" } };
    expect(archivedFinancial(snapshot)).toMatchObject({ issuedAt: "21/01/2026", creditNotes: ["2026NC400044"] });
    expect(creditNotesFrom({ observacao: "Sem nota de crédito referenciada" })).toEqual([]);
  });
  it("does not sum whole related payments that may cover multiple NEs", () => {
    expect(archivedFinancial({ document: { valor: 100 }, related: [{ fase: "Pagamento", valor: 200 }] }).paid).toBeNull();
  });
  it("preserves explicit zero and rejects malformed amounts", () => {
    expect(archivedFinancial({ document: { valorAtualDoEmpenho: 0, valor: 500, valorLiquidado: 0, valorPago: 0 } }).current).toBe(0);
    expect(moneyFrom("não informado")).toBeNull(); expect(moneyFrom("")).toBeNull(); expect(moneyFrom("0,00")).toBe(0);
  });
  it("flags paid above committed/liquidated instead of capping amounts", () => {
    expect(financialPosition(17233.86, 0, 36096.34, "Fornecedor")).toMatchObject({ status: "DIVERGENTE", paid: 36096.34, inconsistent: true });
  });
  it("reads totals explicitly provided by the source", () => {
    expect(archivedFinancial({ document: { valorAtual: 100, valorLiquidado: 100, valorPago: 100, favorecido: { nome: "Fornecedor" } } })).toMatchObject({ status: "PAGA", supplierName: "Fornecedor" });
  });
  it("uses the documentary lifecycle instead of comparing a net OB with the gross NS", () => {
    expect(financialPosition(28_800, 28_800, 28_800, "Fornecedor", { liquidationCompleted: true, paymentCompleted: true, paidNet: 27_936, deductions: 864 }))
      .toMatchObject({ status: "PAGA", incomplete: false, paid: 28_800, paidNet: 27_936, deductions: 864 });
    expect(financialPosition(28_800, 28_800, null, "Fornecedor", { liquidationCompleted: true, paymentCompleted: false }))
      .toMatchObject({ status: "LIQUIDADA", incomplete: false });
  });
  it("deduplicates by official code and does not expose a project outside access scope via archive", () => {
    const row = (externalCode: string, amount: number) => ({ externalCode, ...financialPosition(amount, 0, 0, "Fornecedor") });
    const result = consolidatePortfolio([row("project", 100)], [row("project", 200), row("private-project", 300), row("imported", 50), row("imported", 50)], ["project", "private-project"]);
    expect(result.total).toBe(2); expect(result.totals.committed).toBe(150);
  });
  it("excludes inconsistent rows from financial totals and counts incomplete rows as pending", () => {
    const result = consolidatePortfolio([], [{ externalCode: "a", ...financialPosition(10, 0, 20, "A") }, { externalCode: "b", ...financialPosition(50, null, null, "B") }], []);
    expect(result.totals).toEqual({ committed: 50, liquidated: 0, paid: 0, pending: 2 });
  });
  it("reports every NE with partially confirmed financial evidence", () => {
    const partial = { externalCode: "a", ...financialPosition(100, 100, 75, "A", { paymentIncomplete: true, unresolvedPayments: 1 }) };
    const result = consolidatePortfolio([], [partial], []);
    expect(result.totals).toMatchObject({ paid: 75, pending: 1 });
    expect(result.diagnostics).toEqual({ partialLiquidations: 0, partialPayments: 1 });
  });
});
