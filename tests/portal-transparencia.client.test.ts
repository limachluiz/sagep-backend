import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import {
  buildCommitmentExternalCode,
  portalTransparenciaClient,
} from "../src/modules/financial-execution/portal-transparencia.client.js";

afterEach(() => vi.unstubAllGlobals());

describe("PortalTransparenciaClient", () => {
  it("monta o código oficial com UG, gestão e número normalizado", () => {
    expect(buildCommitmentExternalCode("160016", "00001", "2026ne000534"))
      .toBe("160016000012026NE000534");
  });

  it("interpreta empenho, liquidação e pagamento retornados pela API pública", async () => {
    env.PORTAL_TRANSPARENCIA_API_TOKEN = "token-de-teste";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      numeroDocumento: "2026NE000534",
      nomeFavorecido: "EMPRESA TESTE",
      codigoFavorecido: "00.111.222/0001-33",
      dataEmissao: "13/08/2026",
      valorOriginalDoEmpenho: "R$ 10.000,00",
      valorAtualDoEmpenho: "R$ 10.000,00",
      documentosRelacionados: [
        { codigoDocumento: "160016000012026NS000100", numeroDocumento: "2026NS000100", fase: "Liquidação", valor: "R$ 10.000,00" },
        { codigoDocumento: "160016000012026OB000200", numeroDocumento: "2026OB000200", fase: "Pagamento", valor: "R$ 10.000,00" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const snapshot = await portalTransparenciaClient.fetchCommitmentNote("160016", "00001", "2026NE000534");

    expect(snapshot.supplierCnpj).toBe("00111222000133");
    expect(snapshot.liquidatedAmount).toBe(10_000);
    expect(snapshot.paidAmount).toBe(10_000);
    expect(snapshot.financialStatus).toBe("PAGA");
    expect(snapshot.documents).toHaveLength(3);
  });
});
