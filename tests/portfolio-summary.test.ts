import { describe, expect, it } from "vitest";
import { archivedFinancial, financialPosition, consolidatePortfolio, moneyFrom } from "../src/modules/financial-execution/portfolio-summary.js";
describe("consolidated portfolio", () => {
  it("keeps missing liquidation/payment unknown even if related documents are absent", () => {
    expect(archivedFinancial({ document: { valor: "R$ 1.234,56", nomeFavorecido: "Fornecedor" }, related: [] })).toMatchObject({ current: 1234.56, liquidated: null, paid: null, status: "A_CONFERIR", incomplete: true, supplierName: "Fornecedor" });
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
  it("deduplicates by official code and does not expose a project outside access scope via archive", () => {
    const row = (externalCode: string, amount: number) => ({ externalCode, ...financialPosition(amount, 0, 0, "Fornecedor") });
    const result = consolidatePortfolio([row("project", 100)], [row("project", 200), row("private-project", 300), row("imported", 50), row("imported", 50)], ["project", "private-project"]);
    expect(result.total).toBe(2); expect(result.totals.committed).toBe(150);
  });
  it("excludes inconsistent rows from financial totals and counts incomplete rows as pending", () => {
    const result = consolidatePortfolio([], [{ externalCode: "a", ...financialPosition(10, 0, 20, "A") }, { externalCode: "b", ...financialPosition(50, null, null, "B") }], []);
    expect(result.totals).toEqual({ committed: 50, liquidated: 0, paid: 0, pending: 2 });
  });
});
