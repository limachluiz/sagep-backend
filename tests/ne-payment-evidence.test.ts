import { beforeEach, describe, expect, it, vi } from "vitest";
const fetcher = vi.hoisted(() => vi.fn());
vi.mock("../src/modules/financial-execution/portal-transparencia.client.js", () => ({ fetchPortalJson: fetcher }));
import { amountForNote, collectPaymentEvidence } from "../src/modules/financial-execution/ne-payment-evidence.js";
import { archivedFinancial } from "../src/modules/financial-execution/portfolio-summary.js";
const ne = "160016000012026NE000534", ob = "160016000012026OB000001", ns = "160016000012026NS000001";
const base = "https://api.portaldatransparencia.gov.br/api-de-dados";
beforeEach(() => vi.resetAllMocks());
describe("financial amounts allocated to an exact NE", () => {
  it("sums signed subitem allocations, not the whole payment, and excludes other UGs/NEs", () => {
    const rows = [{ empenho: ne, subitem: "01", valorPago: "100,00", valorRestoPago: "0,00" }, { empenho: ne, subitem: "02", valorPago: "-20,00" }, { empenho: "167016000012026NE000534", subitem: "01", valorPago: "900,00" }];
    expect(amountForNote([...rows, rows[0]!], ne, 3).amount).toBe(80);
    expect(amountForNote([{ empenho: ne.slice(11), subitem: "1", valorPago: "900" }], ne, 3).amount).toBeNull();
  });
  it("includes separately reported paid restos a pagar and rejects conflicting allocations", () => {
    expect(amountForNote([{ empenho: ne, subitem: "1", valorPago: "0,00", valorRestoPago: "25,00" }], ne, 3).amount).toBe(25);
    expect(() => amountForNote([{ empenho: ne, subitem: "1", valorPago: "10" }, { empenho: ne, subitem: "1", valorPago: "20" }], ne, 3)).toThrow("conflitantes");
  });
  it("fetches all pages, deduplicates related documents and reuses cached allocations across NEs", async () => {
    fetcher.mockResolvedValueOnce([{ empenho: ne, subitem: "1", valorPago: "60,00" }]).mockResolvedValueOnce([{ empenho: ne, subitem: "2", valorPago: "40,00" }]).mockResolvedValueOnce([]);
    const related = [{ documento: ob, fase: "Pagamento", valor: "999,00" }];
    const evidence = await collectPaymentEvidence(base, "pagination", ne, [...related, ...related], fetcher);
    expect(evidence.paid).toBe(100); expect(evidence.liquidated).toBeNull(); expect(evidence.documents).toHaveLength(1);
    expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get("pagina"))).toEqual(["1","2","3"]);
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.get("fase")).toBe("3");
    await collectPaymentEvidence(base, "pagination", "167016000012026NE000534", related, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(archivedFinancial({ document: { documento: ne, valor: "100,00" }, financial: evidence }, ne)).toMatchObject({ paid: 100, status: "PAGA", incomplete: true });
  });
  it("supports numeric and Portuguese phases, including liquidation", async () => {
    fetcher.mockResolvedValueOnce([{ empenho: ne, subitem: "1", valorLiquidado: "100,00" }]).mockResolvedValueOnce([]);
    const evidence = await collectPaymentEvidence(base, "liquidation", ne, [{ documento: ns, fase: "Liquidação" }], fetcher);
    expect(evidence.liquidated).toBe(100); expect(evidence.paid).toBeNull();
    expect(archivedFinancial({ document: { documento: ne, valor: "100,00" }, financial: evidence })).toMatchObject({ liquidated: 100, status: "LIQUIDADA" });
  });
  it("publishes the confirmed subtotal and marks the phase incomplete when another payment fails", async () => {
    fetcher
      .mockResolvedValueOnce([{ empenho: ne, subitem: "1", valorPago: "75" }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("HTTP 429"));
    const mixed = await collectPaymentEvidence(base, "mixed", ne, [
      { documento: ob, fase: "3" },
      { documento: "160016000012026OB000002", fase: "3" },
    ], fetcher);
    expect(mixed).toMatchObject({ paid: 75, paidComplete: false });
    expect(archivedFinancial({ document: { documento: ne, valor: 100 }, financial: mixed }, ne)).toMatchObject({
      paid: 75,
      status: "PARCIALMENTE_PAGA",
      incomplete: true,
      paymentIncomplete: true,
      unresolvedPayments: 1,
    });
  });
  it("does not invent a total when every related payment fails", async () => {
    fetcher.mockResolvedValueOnce([{ empenho: ne, subitem: "1", valorPago: "100" }]).mockRejectedValueOnce(new Error("HTTP 429"));
    const failed = await collectPaymentEvidence(base, "failure", ne, [{ documento: ob, fase: "3" }], fetcher);
    expect(failed.paid).toBeNull(); expect(failed.paidComplete).toBe(false); expect(failed.documents[0]?.error).toContain("429");
    fetcher.mockResolvedValue([{ empenho: ne, subitem: "1", valorPago: "100" }]);
    const repeated = await collectPaymentEvidence(base, "repeat", ne, [{ documento: ob, fase: "3" }], fetcher);
    expect(repeated.paid).toBeNull(); expect(repeated.documents[0]?.error).toContain("repetiu");
  });
  it("repairs version 1 snapshots whose summary was null despite confirmed payment documents", () => {
    const result = archivedFinancial({
      document: { documento: ne, valor: "100,00" },
      financial: {
        version: 1,
        externalCode: ne,
        checkedAt: "2026-09-16T22:22:21Z",
        liquidated: 100,
        paid: null,
        documents: [
          { code: ob, phase: 3, amount: 60, subitems: [{}] },
          { code: "160016000012026OB000002", phase: 3, amount: 30, subitems: [{}] },
          { code: "160016000012026OB000003", phase: 3, amount: null, subitems: [], error: "Valor não confirmado" },
        ],
      },
    }, ne);
    expect(result).toMatchObject({ paid: 90, paymentIncomplete: true, unresolvedPayments: 1, status: "PARCIALMENTE_PAGA" });
  });
  it("does not turn absent documents or missing amounts into zero", async () => {
    expect((await collectPaymentEvidence(base, "empty", ne, [], fetcher)).paid).toBeNull();
    expect(amountForNote([{ empenho: ne, subitem: "1", valorPago: "" }], ne, 3).amount).toBeNull();
    expect(amountForNote([{ empenho: ne, subitem: "1", valorPago: "0,00" }], ne, 3).amount).toBe(0);
  });
  it("does not use financial evidence saved for a different full NE code", () => {
    const result = archivedFinancial({ document: { valor: 100 }, financial: { version: 1, externalCode: ne, paid: 100, liquidated: 100 } }, "167016000012026NE000534");
    expect(result.paid).toBeNull();
  });
});
