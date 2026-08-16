import { afterEach, describe, expect, it, vi } from "vitest";

import { systemSettingsService } from "../src/modules/system-settings/system-settings.service.js";

describe("testes de conexão das integrações", () => {
  afterEach(() => vi.restoreAllMocks());

  it("testa o catálogo do serviço PNCP configurado", async () => {
    vi.spyOn(systemSettingsService, "getEffective").mockResolvedValue({
      pncpBaseUrl: "https://pncp.gov.br/api/pncp",
    } as unknown as Awaited<ReturnType<typeof systemSettingsService.getEffective>>);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const service = systemSettingsService as unknown as {
      probePncp(): Promise<{
        status: string;
        httpStatus: number | null;
        details: Record<string, unknown>;
      }>;
    };

    const result = await service.probePncp();

    expect(result.status).toBe("OPERATIONAL");
    expect(result.httpStatus).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://pncp.gov.br/api/pncp/v3/api-docs"),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(result.details.configuredBaseUrl).toBe("https://pncp.gov.br/api/pncp");
  });
});
