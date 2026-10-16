import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCommitmentExternalCode,
  cancellationAmountFromPayload,
  collectCommitmentItemEvidence,
  portalTransparenciaClient,
} from "../src/modules/financial-execution/portal-transparencia.client.js";
import {
  registerCommitmentNoteSchema,
  standaloneCommitmentNoteLookupSchema,
} from "../src/modules/financial-execution/financial-execution.schemas.js";

vi.mock("../src/modules/system-settings/system-settings.service.js", () => ({
  systemSettingsService: {
    getEffective: vi.fn().mockResolvedValue({ portalTransparenciaBaseUrl: "https://api.portaldatransparencia.gov.br/api-de-dados" }),
    getPortalApiToken: vi.fn().mockResolvedValue("token-de-teste"),
  },
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

  it("identifica anulação no histórico dos itens do empenho", () => {
    expect(cancellationAmountFromPayload({ itens: [{ item: 1, historico: [
      { data: "21/08/2026", operacao: "INCLUSAO", quantidade: "24,07", valorUnitario: "712,00", valorTotal: "17.137,98" },
      { data: "26/08/2026", operacao: "ANULACAO", quantidade: "24,07", valorUnitario: "712,00", valorTotal: "17.137,98" },
    ] }] })).toBe(17_137.98);
  });

  it("classifica como anulada quando a operação está somente no detalhamento do gasto", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        numeroDocumento: "2026NE001162",
        valorOriginalDoEmpenho: "R$ 17.137,98",
        valorAtualDoEmpenho: "R$ 17.137,98",
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ sequencial: 1, valorAtualItem: "0,00" }]), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { data: "21/08/2026", operacao: "INCLUSAO", valorTotal: "17.137,98" },
        { data: "26/08/2026", operacao: "ANULACAO", valorTotal: "17.137,98" },
      ]), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await portalTransparenciaClient.fetchCommitmentNote("160016", "00001", "2026NE001162");

    expect(snapshot.cancelledAmount).toBe(17_137.98);
    expect(snapshot.currentAmount).toBe(0);
    expect(snapshot.financialStatus).toBe("ANULADA");
  });

  it("consolida anulações e saldo atual de todos os itens e páginas", async () => {
    const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([
        { sequencial: 1, valorAtualItem: "400,00" },
        { sequencial: 2, valorAtualItem: "200,00" },
      ]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([{ operacao: "ANULACAO", valorTotal: "400,00" }]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([{ operacao: "ANULAÇÃO", valorTotal: "100,00" }]))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetchMock);

    const evidence = await collectCommitmentItemEvidence("https://api.portaldatransparencia.gov.br/api-de-dados", "token", "160016000012026NE001162");

    expect(evidence).toMatchObject({ currentAmount: 600, cancelledAmount: 500 });
    expect(evidence.histories).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("sequencial=2"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("pagina=2"), expect.any(Object));
  });

  it("preserva o valor atual zero e infere a anulação integral quando a API omite o histórico", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        numeroDocumento: "2026NE001162",
        valorOriginalDoEmpenho: "R$ 17.137,98",
        valorAtualDoEmpenho: "R$ 0,00",
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await portalTransparenciaClient.fetchCommitmentNote("160016", "00001", "2026NE001162");

    expect(snapshot.currentAmount).toBe(0);
    expect(snapshot.cancelledAmount).toBe(17_137.98);
    expect(snapshot.financialStatus).toBe("ANULADA");
  });

  it("trata resposta vazia como Nota de Empenho não localizada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));

    await expect(portalTransparenciaClient.fetchCommitmentNote("160016", "00001", "2026NE001243"))
      .rejects.toMatchObject({
        message: "Nota de Empenho não localizada no Portal da Transparência",
        statusCode: 404,
        code: "PORTAL_TRANSPARENCIA_NOT_FOUND",
      });
  });

  it("trata lista vazia como Nota de Empenho não localizada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(portalTransparenciaClient.fetchCommitmentNote("160016", "00001", "2026NE001243"))
      .rejects.toMatchObject({ statusCode: 404, code: "PORTAL_TRANSPARENCIA_NOT_FOUND" });
  });

  it("interpreta empenho, liquidação e pagamento retornados pela API pública", async () => {
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
        { codigoDocumento: "160016000012026DF000301", numeroDocumento: "2026DF000301", fase: "Pagamento", valor: "- R$ 500,00", especie: "Estorno / Cancelamento" },
        { codigoDocumento: "160016000012026DF000302", numeroDocumento: "2026DF000302", fase: "Pagamento", valor: "R$ 500,00", especie: "Original" },
        { codigoDocumento: "160016000012026DR000300", numeroDocumento: "2026DR000300", fase: "Pagamento", valor: "R$ 500,00" },
      ]), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { empenho: "160016000012026NE000534", subitem: "01", valorLiquidado: "R$ 10.000,00" },
      ]), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { empenho: "160016000012026NE000534", subitem: "01", valorPago: "R$ 9.500,00", valorRestoPago: "R$ 0,00" },
        { empenho: "160016000012026NE000999", subitem: "01", valorPago: "R$ 90.000,00", valorRestoPago: "R$ 0,00" },
      ]), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ codigoDocumento: "160016000012026NS000100", numeroDocumento: "2026NS000100", fase: "Liquidação", valor: "R$ 10.000,00" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ codigoDocumento: "160016000012026OB000200", numeroDocumento: "2026OB000200", fase: "Pagamento", valor: "R$ 10.000,00" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await portalTransparenciaClient.fetchCommitmentNote("160016", "00001", "2026NE000534");

    expect(snapshot.supplierCnpj).toBe("00111222000133");
    expect(snapshot.liquidatedAmount).toBe(10_000);
    expect(snapshot.paidAmount).toBe(10_000);
    expect(snapshot.financialStatus).toBe("PAGA");
    expect(snapshot.documents).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/despesas/documentos-relacionados?"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("codigoDocumento=160016000012026NE000534"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("fase=1"), expect.any(Object));
  });
});
