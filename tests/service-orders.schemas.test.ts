import { describe, expect, it } from "vitest";
import { createServiceOrderSchema, updateServiceOrderSchema } from "../src/modules/service-orders/service-orders.schemas.js";

describe("schemas da Ordem de Serviço", () => {
  it("permite herdar contratada e CNPJ do DIEx", () => {
    const parsed = createServiceOrderSchema.parse({
      projectId: "project-1",
      estimateId: "estimate-1",
      diexId: "diex-1",
      issuedAt: "2026-08-31",
    });

    expect(parsed.contractorName).toBeUndefined();
    expect(parsed.contractorCnpj).toBeUndefined();
  });

  it("aceita a razão social como campo editável", () => {
    expect(updateServiceOrderSchema.parse({ contractorName: "Empresa de Teste" }))
      .toEqual({ contractorName: "Empresa de Teste" });
  });

  it("mantém o fiscal do projeto opcional", () => {
    const parsed = createServiceOrderSchema.parse({
      projectId: "project-1",
      estimateId: "estimate-1",
      issuedAt: "2026-09-03",
      hasProjectInspector: false,
    });

    expect(parsed.hasProjectInspector).toBe(false);
  });

  it("exige os dados de assinatura quando o fiscal é incluído", () => {
    expect(() => createServiceOrderSchema.parse({
      projectId: "project-1",
      estimateId: "estimate-1",
      issuedAt: "2026-09-03",
      hasProjectInspector: true,
    })).toThrow();

    expect(createServiceOrderSchema.parse({
      projectId: "project-1",
      estimateId: "estimate-1",
      issuedAt: "2026-09-03",
      hasProjectInspector: true,
      projectInspectorName: "Maria da Silva",
      projectInspectorRank: "1º Ten",
      projectInspectorCpf: "12345678901",
      projectInspectorRole: "Fiscal do Projeto",
    }).projectInspectorName).toBe("Maria da Silva");
  });
});
