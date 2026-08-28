import { describe, expect, it } from "vitest";
import {
  applyTextCorrectionsSchema,
  saveTextCorrectionSchema,
  testTextCorrectionSchema,
} from "../src/modules/text-corrections/text-corrections.schemas.js";
import { applyTextCorrectionRules, buildLiteralCorrectionPattern } from "../src/modules/text-corrections/text-corrections.service.js";

describe("dicionário configurável de correções", () => {
  it("aplica regras literais sem interpretar caracteres de expressão regular", () => {
    expect(applyTextCorrectionRules("Item EQUIP�MENTO (IP)+", [
      { damagedText: "EQUIP�MENTO (IP)+", correctedText: "EQUIPAMENTO IP" },
    ])).toBe("Item EQUIPAMENTO IP");
  });

  it("preserva cifrões no texto corrigido", () => {
    expect(applyTextCorrectionRules("VALOR�", [
      { damagedText: "VALOR�", correctedText: "R$ 10,00" },
    ])).toBe("R$ 10,00");
  });

  it.each(["EQUIP � MENTO", "EQUIP� MENTO", "EQUIP �MENTO", "EQUIP � MENTO"])(
    "aplica a mesma regra configurável quando o código possui espaços: %s",
    (damaged) => {
      expect(applyTextCorrectionRules(damaged, [
        { damagedText: "EQUIP�MENTO", correctedText: "EQUIPAMENTO" },
      ])).toBe("EQUIPAMENTO");
    },
  );

  it("mantém espaços normais fora do marcador corrompido", () => {
    expect("CABO DE FIBRA".replace(buildLiteralCorrectionPattern("FIBR�"), "FIBRA")).toBe("CABO DE FIBRA");
  });

  it("valida cadastro, teste e escopos de aplicação", () => {
    expect(saveTextCorrectionSchema.parse({ damagedText: "ALVAR�ES", correctedText: "ALVARÃES" })).toEqual({ damagedText: "ALVAR�ES", correctedText: "ALVARÃES" });
    expect(testTextCorrectionSchema.parse({ text: "ALVAR�ES", damagedText: "ALVAR�ES", correctedText: "ALVARÃES" })).toBeTruthy();
    expect(applyTextCorrectionsSchema.parse({ scope: "CATALOG" })).toEqual({ scope: "CATALOG" });
  });

  it("rejeita correção idêntica e prévia incompleta", () => {
    expect(() => saveTextCorrectionSchema.parse({ damagedText: "texto", correctedText: "texto" })).toThrow();
    expect(() => testTextCorrectionSchema.parse({ text: "texto", damagedText: "erro" })).toThrow();
  });
});
