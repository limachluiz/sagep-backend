import { describe, expect, it } from "vitest";
import { inferCoverageFromDescription } from "../src/modules/compras-gov/coverage-inference.js";

describe("inferCoverageFromDescription", () => {
  it.each([
    ["(REGIÃO 1 - MANAUS-AM)", "REG-01", "Manaus", "AM"],
    ["REGIAO 2 - BOA VISTA-RR", "REG-02", "Boa Vista", "RR"],
    ["REGIÃO 3 - PORTO VELHO-RO", "REG-03", "Porto Velho", "RO"],
    ["REGIÃO 4 - RIO BRANCO-AC", "REG-04", "Rio Branco", "AC"],
  ])("detects %s", (description, code, cityName, stateUf) => {
    expect(inferCoverageFromDescription(description)).toMatchObject({
      code,
      localities: [{ cityName, stateUf }],
    });
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
      ],
    });
  });

  it("returns null when the source does not identify coverage", () => {
    expect(inferCoverageFromDescription("Serviço de instalação conforme termo de referência")).toBeNull();
  });
});