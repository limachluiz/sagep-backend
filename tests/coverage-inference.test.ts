import { describe, expect, it } from "vitest";
import { inferCoverageFromDescription } from "../src/modules/compras-gov/coverage-inference.js";

describe("inferCoverageFromDescription", () => {
  it.each([
    ["(REGIÃO 1 - MANAUS-AM)", "REG-01", "Manaus", "AM"],
    ["REGIAO 2 - IRANDUBA-AM", "REG-02", "Iranduba", "AM"],
    ["REGIÃO 3 - COARI-AM", "REG-03", "Coari", "AM"],
    ["REGIÃO 4 - TONANTINS-AM", "REG-04", "Tonantins", "AM"],
  ])("detects %s", (description, code, cityName, stateUf) => {
    const result = inferCoverageFromDescription(description);
    expect(result?.code).toBe(code);
    expect(result?.localities).toContainEqual({ cityName, stateUf });
  });

  it("recognizes a region even when the source already contains replacement characters", () => {
    expect(inferCoverageFromDescription("REGI��O 1 - MANAUS-AM")).toMatchObject({
      code: "REG-01",
      name: "Região 1",
      localities: [{ cityName: "Manaus", stateUf: "AM" }],
    });
  });

  it("groups multiple localities from the same region", () => {
    expect(inferCoverageFromDescription("REGIÃO 5 - PORTO VELHO-RO, GUAJARÁ-MIRIM/RO")).toMatchObject({
      code: "REG-05",
      name: "Região 5",
      localities: [
        { cityName: "Porto Velho", stateUf: "RO" },
        { cityName: "Guajará-Mirim", stateUf: "RO" },
        { cityName: "Humaitá", stateUf: "AM" },
        { cityName: "Rio Branco", stateUf: "AC" },
        { cityName: "Cruzeiro do Sul", stateUf: "AC" },
      ],
    });
  });

  it("returns null when the source does not identify coverage", () => {
    expect(inferCoverageFromDescription("Serviço de instalação conforme termo de referência")).toBeNull();
  });
});
