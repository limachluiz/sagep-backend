import { describe, expect, it, vi } from "vitest";
import { ComprasGovService } from "../src/modules/compras-gov/compras-gov.service.js";
const input = { uasg: "160016", numeroPregao: "90004", anoPregao: "2025", numeroAta: "00093/2025" };
function client(items: object[]) {
  const service = new ComprasGovService();
  Object.assign(service, { fetchExternalAtas: vi.fn().mockResolvedValue([{ numeroAtaRegistroPreco: input.numeroAta }]), fetchExternalItems: vi.fn().mockResolvedValue(items) });
  return service;
}
const item = { numeroAtaRegistroPreco: input.numeroAta, nomeRazaoSocialFornecedor: "EMPRESA LTDA", niFornecedor: "12.345.678/0001-90" };
describe("CNPJ from exact official ATA", () => {
  it("accepts one supplier on the exact ATA, normalizing formatting", async () => {
    await expect(client([item, item]).resolveAtaSupplier(input, "Empresa Ltda.")).resolves.toBe("12345678000190");
  });
  it("does not use a supplier from another ATA", async () => {
    await expect(client([{ ...item, numeroAtaRegistroPreco: "00094/2025" }]).resolveAtaSupplier(input, "Empresa Ltda")).rejects.toThrow("ambíguo");
  });
  it("does not choose the first of conflicting CNPJs", async () => {
    await expect(client([item, { ...item, niFornecedor: "98765432000110" }]).resolveAtaSupplier(input, "Empresa Ltda")).rejects.toThrow("ambíguo");
  });
  it("does not assign a different supplier's CNPJ", async () => {
    await expect(client([item]).resolveAtaSupplier(input, "Outra empresa")).rejects.toThrow("ambíguo");
  });
});
