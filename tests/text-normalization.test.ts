import { describe, expect, it } from "vitest";
import { normalizeMojibakeText } from "../src/shared/text-normalization.js";

describe("normalizeMojibakeText", () => {
  it("fixes common Compras.gov mojibake without changing valid UTF-8 text", () => {
    expect(normalizeMojibakeText("SERVI\u00c3\u2021O")).toBe("SERVI\u00c7O");
    expect(normalizeMojibakeText("Elabora\u00c3\u00a7\u00c3\u00a3o")).toBe("Elabora\u00e7\u00e3o");
    expect(normalizeMojibakeText("Observa\u00c3\u00a7\u00c3\u00b5es")).toBe("Observa\u00e7\u00f5es");
    expect(normalizeMojibakeText("Vig\u00c3\u00aancia")).toBe("Vig\u00eancia");
    expect(normalizeMojibakeText("Elabora\u00e7\u00e3o de Servi\u00e7o")).toBe(
      "Elabora\u00e7\u00e3o de Servi\u00e7o",
    );
  });

  it("repairs common replacement-character mojibake when recoverable", () => {
    expect(normalizeMojibakeText("instala\ufffd\ufffdo")).toBe("instala\u00e7\u00e3o");
    expect(normalizeMojibakeText("fixa\ufffd\ufffdo")).toBe("fixa\u00e7\u00e3o");
    expect(normalizeMojibakeText("identifica\ufffd\ufffdo")).toBe("identifica\u00e7\u00e3o");
    expect(normalizeMojibakeText("SERVI\ufffdO")).toBe("SERVI\u00c7O");
  });
});
