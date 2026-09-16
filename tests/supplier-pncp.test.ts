import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePncpSupplier, uniqueSupplier } from "../src/modules/financial-execution/supplier-pncp.client.js";
const result = { tipoPessoa: "PJ", niFornecedor: "26605545000115", nomeRazaoSocialFornecedor: "SIDI SERVICOS DE COMUNICACAO LTDA", situacaoCompraItemResultadoId: 1 };
afterEach(() => vi.unstubAllGlobals());
describe("dynamic PNCP supplier lookup", () => {
  it("matches exact normalized names and excludes cancelled awards", () => {
    expect(uniqueSupplier([result], "Sidi Serviços de Comunicação Ltda")).toBe(result.niFornecedor);
    expect(uniqueSupplier([{ ...result, dataCancelamento: "2026-01-01" }], result.nomeRazaoSocialFornecedor)).toBeNull();
    expect(uniqueSupplier([result], "Outra empresa")).toBeNull();
    expect(() => uniqueSupplier([result, { ...result, niFornecedor: "12345678000190" }], result.nomeRazaoSocialFornecedor)).toThrow("diferentes");
  });
  it("builds URLs from the purchase and shares in-flight requests", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify([result])));
    vi.stubGlobal("fetch", fetcher);
    const args = ["https://pncp.gov.br/api/pncp", "12345678000190-1-000987/2026-000002", ["5", "5"], result.nomeRazaoSocialFornecedor] as const;
    const [a, b] = await Promise.all([resolvePncpSupplier(args[0], args[1], [...args[2]], args[3]), resolvePncpSupplier(args[0], args[1], [...args[2]], args[3])]);
    expect(a.cnpj).toBe(b.cnpj); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://pncp.gov.br/pncp-api/v1/orgaos/12345678000190/compras/2026/987/itens/5/resultados");
  });
  it("does not cache failures", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify([result])));
    vi.stubGlobal("fetch", fetcher);
    const lookup = () => resolvePncpSupplier("https://pncp.gov.br/pncp-api", "12345678000190-1-988/2026-2", ["1"], result.nomeRazaoSocialFornecedor);
    await expect(lookup()).rejects.toThrow("503");
    expect((await lookup()).cnpj).toBe(result.niFornecedor);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("stops after an official item identifies the supplier without fetching unrelated items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.includes("/2/resultados") ? new Response("{}", { status: 500 }) : new Response(JSON.stringify([result]))));
    expect((await resolvePncpSupplier("https://pncp.gov.br/pncp-api", "12345678000190-1-989/2026-2", ["1", "2"], result.nomeRazaoSocialFornecedor)).cnpj).toBe(result.niFornecedor);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
