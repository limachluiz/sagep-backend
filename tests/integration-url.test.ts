import { describe, expect, it } from "vitest";
import { assertAllowedIntegrationUrl } from "../src/shared/integration-url.js";

describe("integration URL allowlist", () => {
  it("aceita somente endpoints HTTPS oficiais", () => {
    expect(
      assertAllowedIntegrationUrl(
        "https://api.portaldatransparencia.gov.br/api-de-dados",
        "PORTAL_TRANSPARENCIA",
      ).hostname,
    ).toBe("api.portaldatransparencia.gov.br");

    expect(() =>
      assertAllowedIntegrationUrl("https://pncp.gov.br/api/pncp", "PNCP"),
    ).not.toThrow();
  });

  it.each([
    ["http://pncp.gov.br/api/pncp", "PNCP"],
    ["https://pncp.gov.br.evil.example/api", "PNCP"],
    ["https://127.0.0.1/internal", "PNCP"],
    ["https://user:password@dadosabertos.compras.gov.br", "COMPRAS_GOV"],
    ["https://dadosabertos.compras.gov.br:8443", "COMPRAS_GOV"],
  ] as const)("rejeita URL não autorizada: %s", (url, provider) => {
    expect(() => assertAllowedIntegrationUrl(url, provider)).toThrowError(
      expect.objectContaining({ code: "INTEGRATION_URL_NOT_ALLOWED" }),
    );
  });
});
