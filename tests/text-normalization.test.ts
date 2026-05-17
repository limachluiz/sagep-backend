import { describe, expect, it } from "vitest";
import { normalizeMojibakeText } from "../src/shared/text-normalization.js";

describe("normalizeMojibakeText", () => {
  it("fixes common Compras.gov mojibake without changing valid UTF-8 text", () => {
    expect(normalizeMojibakeText("SERVIÃ‡O")).toBe("SERVIÇO");
    expect(normalizeMojibakeText("ElaboraÃ§Ã£o")).toBe("Elaboração");
    expect(normalizeMojibakeText("ObservaÃ§Ãµes")).toBe("Observações");
    expect(normalizeMojibakeText("VigÃªncia")).toBe("Vigência");
    expect(normalizeMojibakeText("Elaboração de Serviço")).toBe("Elaboração de Serviço");
  });
});
