import { describe, expect, it } from "vitest";

import { resolveDiexPregaoNumber } from "../src/modules/diex/diex-document-data.js";

const source = (overrides: {
  pregaoNumber?: string | null;
  catalog?: { number: string; year: string } | null;
  externalNumber?: string | null;
  externalYear?: string | null;
} = {}) => ({
  pregaoNumber: overrides.pregaoNumber,
  estimate: {
    ata: {
      pregao: overrides.catalog,
      externalPregaoNumber: overrides.externalNumber,
      externalPregaoYear: overrides.externalYear,
    },
  },
});

describe("resolveDiexPregaoNumber", () => {
  it("prioriza o pregão cadastrado e vinculado à ATA", () => {
    expect(resolveDiexPregaoNumber(source({
      pregaoNumber: "Não configurado",
      catalog: { number: "90004", year: "2026" },
      externalNumber: "legado",
      externalYear: "2025",
    }))).toBe("90004/2026");
  });

  it("usa os dados externos da ATA quando não há pregão catalogado", () => {
    expect(resolveDiexPregaoNumber(source({
      externalNumber: "90005",
      externalYear: "2026",
    }))).toBe("90005/2026");
  });

  it("preserva o campo legado do DIEx como último fallback", () => {
    expect(resolveDiexPregaoNumber(source({ pregaoNumber: "04/2025" }))).toBe("04/2025");
  });
});
