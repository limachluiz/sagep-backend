import { AppError } from "./app-error.js";

export type IntegrationProvider = "PORTAL_TRANSPARENCIA" | "COMPRAS_GOV" | "PNCP";

const allowedHosts: Record<IntegrationProvider, ReadonlySet<string>> = {
  PORTAL_TRANSPARENCIA: new Set(["api.portaldatransparencia.gov.br"]),
  COMPRAS_GOV: new Set(["dadosabertos.compras.gov.br"]),
  PNCP: new Set(["pncp.gov.br"]),
};

export function assertAllowedIntegrationUrl(rawUrl: string, provider: IntegrationProvider) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError("URL de integração inválida", 400, "INTEGRATION_URL_INVALID");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowed =
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443") &&
    allowedHosts[provider].has(hostname);

  if (!allowed) {
    throw new AppError(
      "A URL da integração não pertence a um endpoint oficial autorizado",
      400,
      "INTEGRATION_URL_NOT_ALLOWED",
      { provider, hostname },
    );
  }

  return url;
}
