import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), fetch: vi.fn() }));
vi.mock("../src/config/prisma.js", () => ({ prisma: { ata: { findMany: mocks.findMany } } }));
vi.mock("../src/modules/system-settings/system-settings.service.js", () => ({ systemSettingsService: {
  getPortalApiToken: async () => "test", getEffective: async () => ({ portalTransparenciaBaseUrl: "https://api.portaldatransparencia.gov.br/api-de-dados" }),
} }));
vi.mock("../src/modules/financial-execution/portal-transparencia.client.js", () => ({ fetchPortalJson: mocks.fetch }));
import { discoveryPage, discoveryPageSchema, filterDiscoveryRows } from "../src/modules/financial-execution/ne-discovery.service.js";
const input = { pregaoIds: ["one"], cnpj: "12345678000190", ug: "167016", startDate: "2025-06-01", endDate: "2026-08-31", year: 2026, page: 2 };
beforeEach(() => { vi.clearAllMocks(); mocks.findMany.mockResolvedValue([{ vendorCnpj: "12.345.678/0001-90" }]); });
describe("NE discovery coverage", () => {
  it("validates real dates and year boundaries", () => {
    expect(discoveryPageSchema.safeParse(input).success).toBe(true);
    expect(discoveryPageSchema.safeParse({ ...input, startDate: "2025-02-30" }).success).toBe(false);
    expect(discoveryPageSchema.safeParse({ ...input, year: 2024 }).success).toBe(false);
  });
  it("retains unverified dates explicitly and includes both date boundaries", () => {
    const result = filterDiscoveryRows([{ data: "01/06/2025" }, { data: "31/08/2026" }, { data: "01/09/2026" }, { data: "bad" }], input.startDate, input.endDate);
    expect(result.items).toHaveLength(3); expect(result.missingDates).toBe(1);
    expect(result.items[2].dateUnverified).toBe(true);
  });
  it("does not mark an out-of-period page as exhausted", async () => {
    mocks.fetch.mockResolvedValue([{ data: "01/09/2026" }]);
    const result = await discoveryPage(input);
    expect(result.items).toEqual([]); expect(result.exhausted).toBe(false);
    const url = new URL(mocks.fetch.mock.calls[0][0]);
    expect(url.searchParams.get("ug")).toBe("167016");
    expect(url.searchParams.get("pagina")).toBe("2");
    expect(url.searchParams.get("codigoPessoa")).toBe(input.cnpj);
  });
  it("only an empty successful array ends pagination", async () => {
    mocks.fetch.mockResolvedValue([]); expect((await discoveryPage(input)).exhausted).toBe(true);
    mocks.fetch.mockResolvedValue({ error: "unavailable" }); await expect(discoveryPage(input)).rejects.toThrow("Formato inesperado");
  });
  it("rejects suppliers outside the selected procurement records", async () => {
    mocks.findMany.mockResolvedValue([]); await expect(discoveryPage(input)).rejects.toThrow("Fornecedor");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
