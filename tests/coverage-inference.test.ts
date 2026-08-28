import { describe, expect, it } from "vitest";
import { inferCoverageFromDescription } from "../src/modules/compras-gov/coverage-inference.js";

describe("inferCoverageFromDescription", () => {
  it.each([
    ["(REGIÃO 1 - MANAUS-AM)", "MNS", "Manaus", "AM"],
    ["REGIAO 2 - BOA VISTA-RR", "BVB", "Boa Vista", "RR"],
    ["REGIÃO 3 - PORTO VELHO-RO", "PVH", "Porto Velho", "RO"],
    ["REGIÃO 4 - RIO BRANCO-AC", "RBC", "Rio Branco", "AC"],
  ])("detects %s", (description, code, cityName, stateUf) => {
    expect(inferCoverageFromDescription(description)).toMatchObject({
      code,
      localities: [{ cityName, stateUf }],
    });
  });

  it("returns null when the source does not identify coverage", () => {
    expect(inferCoverageFromDescription("Serviço de instalação conforme termo de referência")).toBeNull();
  });
});
