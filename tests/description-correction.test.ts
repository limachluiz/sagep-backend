import { describe, expect, it } from "vitest";

import { correctImportedDescription } from "../src/shared/description-correction.js";

describe("motor automático de reconstrução de descrições", () => {
  it.each([
    ["infraestrutura met�lica", "infraestrutura metálica"],
    ["Demais caracter�sticas técnicas", "Demais características técnicas"],
    ["infraestrutura necess�ria", "infraestrutura necessária"],
    ["medida em micr�metros", "medida em micrômetros"],
    ["R EGI�O 1", "REGIÃO 1"],
    ["conforme Re fer�ncia", "conforme Referência"],
    ["utilizando m�to do", "utilizando método"],
  ])("reconstrói automaticamente %s", (damaged, expected) => {
    const result = correctImportedDescription(damaged);
    expect(result.automaticText).toBe(expected);
    expect(result.status).not.toBe("NEEDS_REVIEW");
  });

  it("não inventa uma correção quando o vocabulário não oferece candidato seguro", () => {
    const result = correctImportedDescription("equipamento ZX�Q proprietário");
    expect(result.automaticText).toContain("ZX�Q");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.unresolvedTokens).toContain("ZX�Q");
  });

  it.each([
    ["instalação el�trica", "instalação elétrica"],
    ["rede telef�nica", "rede telefônica"],
    ["proteção mec�nica", "proteção mecânica"],
    ["equipamento eletr�nico", "equipamento eletrônico"],
    ["distância m�xima", "distância máxima"],
  ])("reconstrói palavra inédita usando o léxico pt-BR: %s", (damaged, expected) => {
    expect(correctImportedDescription(damaged).automaticText).toBe(expected);
  });

  it("aceita a saída das regras personalizadas como prioridade", () => {
    const result = correctImportedDescription("CAB� ESPECIAL", "CABO ESPECIAL");
    expect(result.automaticText).toBe("CABO ESPECIAL");
    expect(result.status).toBe("AUTO_CORRECTED");
  });
});
