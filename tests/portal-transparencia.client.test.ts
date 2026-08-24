import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import {
  buildCommitmentExternalCode,
  portalTransparenciaClient,
} from "../src/modules/financial-execution/portal-transparencia.client.js";
import {
  registerCommitmentNoteSchema,
  standaloneCommitmentNoteLookupSchema,
} from "../src/modules/financial-execution/financial-execution.schemas.js";

vi.mock("../src/modules/system-settings/system-settings.service.js", () => ({
  systemSettingsService: { getEffective: vi.fn().mockResolvedValue({ portalTransparenciaBaseUrl: "https://api.portaldatransparencia.gov.br/api-de-dados" }) },
}));

afterEach(() => vi.unstubAllGlobals());

describe("PortalTransparenciaClient", () => {
  it("aceita consulta avulsa sem identificador de projeto", () => {
    expect(standaloneCommitmentNoteLookupSchema.parse({ number: "2026ne000534" }))
      .toEqual({ number: "2026NE000534" });
  });

  it("exige justificativa e confirmação no registro manual", () => {
    expect(() => registerCommitmentNoteSchema.parse({
      projectId: "project-1",
      number: "2026NE000534",
      receivedAt: "2026-08-24",
      registrationMode: "MANUAL",
    })).toThrow();

    expect(registerCommitmentNoteSchema.parse({
      projectId: "project-1",
      number: "2026NE000534",
      receivedAt: "2026-08-24",
      registrationMode: "MANUAL",
      manualReason: "Portal indisponível durante o registro",
      confirmManualRegistration: true,
    })).toMatchObject({
      registrationMode: "MANUAL",
      manualReason: "Portal indisponível durante o registro",
      confirmManualRegistration: true,
    });
  });

  it("monta o código oficial com UG, gestão e número normalizado", () => {
    expect(buildCommitmentExternalCode("160016", "00001", "2026ne000534"))
      .toBe("160016000012026NE000534");
  });

  it("interpreta empenho, liquidação e pagamento retornados pela API pública", async () => {
    env.PORTAL_TRANSPARENCIA_API_TOKEN = "token-de-teste";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
      numeroDocumento: "2026NE000534",
      nomeFavorecido: "EMPRESA TESTE",
      codigoFavorecido: "00.111.222/0001-33",
      dataEmissao: "13/08/2026",
      valorOriginalDoEmpenho: "R$ 10.000,00",
      valorAtualDoEmpenho: "R$ 10.000,00",
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { codigoDocumento: "160016000012026NS000100", numeroDocumento: "2026NS000100", fase: "Liquidação", valor: "R$ 10.000,00" },
        { codigoDocumento: "160016000012026OB000200", numeroDocumento: "2026OB000200", fase: "Pagamento", valor: "R$ 10.000,00" },
      ]), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ codigoDocumento: "160016000012026NS000100", numeroDocumento: "2026NS000100", fase: "Liquidação", valor: "R$ 10.000,00" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ codigoDocumento: "160016000012026OB000200", numeroDocumento: "2026OB000200", fase: "Pagamento", valor: "R$ 10.000,00" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await portalTransparenciaClient.fetchCommitmentNote("160016", "00001", "2026NE000534");

    expect(snapshot.supplierCnpj).toBe("00111222000133");
    expect(snapshot.liquidatedAmount).toBe(10_000);
    expect(snapshot.paidAmount).toBe(10_000);
    expect(snapshot.financialStatus).toBe("PAGA");
    expect(snapshot.documents).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/despesas/documentos-relacionados?"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("codigoDocumento=160016000012026NE000534"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("fase=1"), expect.any(Object));
  });
});
