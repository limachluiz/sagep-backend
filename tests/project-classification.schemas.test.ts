import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  updateProjectSchema,
} from "../src/modules/projects/projects.schemas.js";

describe("classificação de projetos", () => {
  it("aceita tipo e OM juntos na criação", () => {
    const result = createProjectSchema.safeParse({
      title: "Projeto de CFTV do 4º CTA",
      projectType: "CFTV",
      omId: "om-manaus",
      startDate: "2026-07-14",
    });

    expect(result.success).toBe(true);
  });

  it("rejeita classificação incompleta na criação", () => {
    const result = createProjectSchema.safeParse({
      title: "Projeto de fibra óptica",
      projectType: "FIBRA_OPTICA_PONTO_LOGICO",
    });

    expect(result.success).toBe(false);
  });

  it("permite atualização parcial para combinação com os dados persistidos", () => {
    const result = updateProjectSchema.safeParse({ omId: "outra-om" });

    expect(result.success).toBe(true);
  });

  it("não aceita atualização manual isolada do status", () => {
    const result = updateProjectSchema.safeParse({ status: "EM_ANDAMENTO" });

    expect(result.success).toBe(false);
  });
});
