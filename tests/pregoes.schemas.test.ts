import { describe, expect, it } from "vitest";
import { createPregaoSchema, updatePregaoSchema } from "../src/modules/pregoes/pregoes.schemas.js";

describe("schemas de pregões", () => {
  it("aceita um cadastro manual completo", () => {
    const result = createPregaoSchema.parse({
      uasg: "160016", number: "90004", year: "2025", modality: "PREGÃO ELETRÔNICO",
      type: "FIBRA_OPTICA", managingAgency: "4º CTA", object: "Serviços de infraestrutura",
      openingAt: "2025-01-10", homologatedAt: "2025-02-20", isActive: true,
    });
    expect(result.number).toBe("90004");
    expect(result.homologatedAt).toBe("2025-02-20");
  });

  it("permite limpar campos opcionais durante a edição", () => {
    const result = updatePregaoSchema.parse({ object: null, managingAgency: null, openingAt: null, homologatedAt: null });
    expect(result).toEqual({ object: null, managingAgency: null, openingAt: null, homologatedAt: null });
  });

  it("rejeita ano inválido", () => {
    expect(() => createPregaoSchema.parse({ uasg: "160016", number: "4", year: "25" })).toThrow();
  });
});
