import { afterEach, describe, expect, it, vi } from "vitest";
import { PncpService } from "../src/modules/compras-gov/pncp.service.js";
import { systemSettingsService } from "../src/modules/system-settings/system-settings.service.js";

describe("PncpService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("consulta a ata e os contratos vinculados pelo numero de controle", async () => {
    vi.spyOn(systemSettingsService, "getEffective").mockResolvedValue({
      pncpBaseUrl: "https://pncp.gov.br/api/pncp",
    } as unknown as Awaited<ReturnType<typeof systemSettingsService.getEffective>>);

    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/contratos")) {
        return new Response(JSON.stringify({ data: [{ numeroContratoEmpenho: "2026NE000304" }], totalRegistros: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        numeroControlePNCP: "00394452000103-1-022869/2025-000001",
        numeroAtaRegistroPreco: "00001",
        anoAta: 2026,
        dataVigenciaInicio: "2026-02-16",
        dataVigenciaFim: "2027-02-15",
        dataAtualizacaoGlobal: "2026-07-01T13:59:21",
        cancelado: false,
        possibilidadeAdesao: true,
        orgaoEntidade: { cnpj: "00394452000103", razaoSocial: "COMANDO DO EXERCITO" },
        unidadeOrgao: { codigoUnidade: "160016", nomeUnidade: "CMA", municipioNome: "Manaus", ufSigla: "AM" },
      }), { status: 200 });
    });

    const snapshot = await new PncpService().fetchAtaSnapshot(
      "00394452000103-1-022869/2025-000001",
    );

    expect(requestedUrls).toEqual([
      "https://pncp.gov.br/api/pncp/v1/orgaos/00394452000103/compras/2025/22869/atas/1",
      "https://pncp.gov.br/api/pncp/v1/orgaos/00394452000103/compras/2025/22869/atas/1/contratos",
    ]);
    expect(snapshot.managingUnit.code).toBe("160016");
    expect(snapshot.linkedContracts.total).toBe(1);
    expect(snapshot.cancelled).toBe(false);
  });

  it("rejeita numero de controle PNCP invalido sem chamar a API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(new PncpService().fetchAtaSnapshot("ATA-INVALIDA")).rejects.toThrow(
      "Número de controle PNCP inválido",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
