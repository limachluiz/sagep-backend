import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContratosGovBalanceService,
  calculateOfficialOpeningBalance,
  createPublicSession,
  fetchText,
  parseExternalBalanceItem,
  parsePublicDecimal,
  type ExternalAtaBalance,
} from "../src/modules/compras-gov/contratos-gov-balance.service.js";

const context = {
  ataItemId: "item-13",
  itemNumber: "00013",
  referenceCode: "13",
  description: "Projeto executivo",
  unit: "UN",
  ataNumber: "00001/2026",
  uasg: "160016",
  pregaoNumber: "90012",
  pregaoYear: "2025",
  contratosAtaId: "327576",
};

const table = (headers: string[], rows: string[][]) => `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

const html = `
  <main>
    <p>Número da ata de registro de preços: 00001/2026</p>
    <p>Unidade gerenciadora: 160016 - CMDO CMA</p>
    <p>Número da compra/ Ano: 90012/2025</p>
    <p>Número do item: 00013</p>
    ${table(
      ["Código", "Unidade", "Tipo da unidade", "Quantidade registrada", "Quantidade disponível para remanejamento/empenho"],
      [["160016", "CMDO CMA", "Gerenciadora", "120.00000", "117.00000"]],
    )}
    <section id="tab4">
      <p>Quantidade Registrada/Autorizada: 180.00000</p>
      <p>Saldo para Empenho: 176.00000</p>
      ${table(
        ["Unidade", "Tipo", "Quantidade registrada", "Quantidade empenhada", "Saldo para empenho"],
        [["160016 - CMDO CMA", "Gerenciadora", "120.00000", "3.00000", "117.00000"]],
      )}
      ${table(
        ["Número de empenho", "Unidade", "Fornecedor", "Data do empenho", "Quantidade incluída", "Reforço", "Anulação", "Quantidade empenhada", "Valor"],
        [["2026NE000784", "160016 - CMDO CMA", "00.000.000/0001-00 - FORNECEDOR", "18/06/2026", "3.00000", "0.00000", "0.00000", "3.00000", "2400.00"]],
      )}
    </section>
    <section id="tab3">
      <p>Qtd. limite para adesão: 240.00000</p>
      <p>Quantidade disponivel para adesão: 179.00000</p>
    </section>
  </main>`;

describe("consulta pública de saldo da ATA", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserva a precisão das quantidades públicas", () => {
    expect(parsePublicDecimal("3.287,15400")).toBe("3287.15400");
    expect(parsePublicDecimal("117.00000")).toBe("117.00000");
  });

  it("calcula a abertura a partir do registrado oficial, sem tratar diferença cadastral como consumo", () => {
    const result = calculateOfficialOpeningBalance("300", "300");
    expect(result.initialQuantity.toString()).toBe("300");
    expect(result.openingConsumedQuantity.toString()).toBe("0");
  });

  it("considera consumo histórico somente a diferença entre registrado e disponível", () => {
    const result = calculateOfficialOpeningBalance("18000", "17640");
    expect(result.initialQuantity.toString()).toBe("18000");
    expect(result.openingConsumedQuantity.toString()).toBe("360");
  });

  it("extrai o saldo da unidade gerenciadora e os totais publicados", () => {
    const result = parseExternalBalanceItem(html, context);
    expect(result.managerRegisteredQuantity).toBe("120.00000");
    expect(result.managerCommittedQuantity).toBe("3.00000");
    expect(result.managerAvailableQuantity).toBe("117.00000");
    expect(result.publishedTotalAvailableForCommitment).toBe("176.00000");
    expect(result.publishedAvailableForAdhesion).toBe("179.00000");
    expect(result.commitments).toEqual([
      expect.objectContaining({
        number: "2026NE000784",
        unit: "160016",
        committedQuantity: "3.00000",
        transparencyUrl: "https://portaldatransparencia.gov.br/despesas/documento/empenho/160016000012026NE000784",
      }),
    ]);
    expect(result.detailUrl).toContain("/00013/327576/show");
  });

  it("aceita item sem empenhos e calcula os totais pelas alocações publicadas", () => {
    const withoutCommitments = html
      .replace(/<section id="tab4">[\s\S]*?<\/section>/, '<section id="tab4">Não há informações de empenho</section>')
      .replace("<p>Quantidade disponivel para adesão: 179.00000</p>", "");

    const result = parseExternalBalanceItem(withoutCommitments, context);

    expect(result.units).toEqual([]);
    expect(result.commitments).toEqual([]);
    expect(result.managerRegisteredQuantity).toBe("120.00000");
    expect(result.managerCommittedQuantity).toBeNull();
    expect(result.managerAvailableQuantity).toBe("117.00000");
    expect(result.publishedTotalRegisteredAuthorized).toBe("120");
    expect(result.publishedTotalAvailableForCommitment).toBe("117");
    expect(result.publishedAvailableForAdhesion).toBe("240.00000");
  });

  it("rejeita uma página que pertença a outro pregão", () => {
    expect(() => parseExternalBalanceItem(html.replace("90012/2025", "90013/2025"), context)).toThrow(
      "não corresponde à ATA ou ao item",
    );
  });

  it("inicia a sessão pública e envia cookies e token CSRF nas consultas", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("login", {
        status: 200,
        headers: [
          ["set-cookie", "XSRF-TOKEN=token%3D; Path=/"],
          ["set-cookie", "laravel_session=session-123; Path=/; HttpOnly"],
        ],
      }))
      .mockResolvedValueOnce(new Response("transparencia", { status: 200 }))
      .mockResolvedValueOnce(new Response('{"data":[]}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const session = await createPublicSession();
    await fetchText("https://contratos.sistema.gov.br/transparencia/transparencia/arp-item", {
      method: "POST",
      body: "draw=1",
    }, session);

    const request = fetchMock.mock.calls[2]![1] as RequestInit;
    expect(request.headers).toMatchObject({
      Cookie: expect.stringContaining("laravel_session=session-123"),
      "X-XSRF-TOKEN": "token=",
    });
  });

  it("repete uma consulta quando o portal responde com falha temporária", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("indisponível", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchText("https://contratos.sistema.gov.br/transparencia/arp-item", undefined, {
      cookies: new Map(),
      expiresAt: Date.now() + 60_000,
    });

    expect(result).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aplica explicitamente o snapshot salvo sem consultar novamente o portal", async () => {
    const service = new ContratosGovBalanceService();
    const snapshot = { retrieval: "SNAPSHOT_FALLBACK" } as ExternalAtaBalance;
    const internals = service as unknown as {
      loadStoredBalance: (ataId: string) => Promise<ExternalAtaBalance | null>;
      queryAtaBalance: (ataId: string, itemId?: string, forceRefresh?: boolean) => Promise<ExternalAtaBalance>;
      applyOpeningBalance: (result: ExternalAtaBalance, actor: { id: string }, reason: string) => Promise<unknown>;
    };
    const loadStoredBalance = vi.spyOn(internals, "loadStoredBalance").mockResolvedValue(snapshot);
    const queryAtaBalance = vi.spyOn(internals, "queryAtaBalance");
    const applyOpeningBalance = vi.spyOn(internals, "applyOpeningBalance").mockResolvedValue({ applied: true });

    await service.applyAtaOpeningBalance("ata-1", { id: "admin-1" }, "Carga inicial da implantação", "SAVED_SNAPSHOT");

    expect(loadStoredBalance).toHaveBeenCalledWith("ata-1");
    expect(queryAtaBalance).not.toHaveBeenCalled();
    expect(applyOpeningBalance).toHaveBeenCalledWith(snapshot, { id: "admin-1" }, "Carga inicial da implantação");
  });

  it("mantém a consulta ao vivo como origem padrão do saldo de abertura", async () => {
    const service = new ContratosGovBalanceService();
    const live = { retrieval: "LIVE" } as ExternalAtaBalance;
    const internals = service as unknown as {
      loadStoredBalance: (ataId: string) => Promise<ExternalAtaBalance | null>;
      queryAtaBalance: (ataId: string, itemId?: string, forceRefresh?: boolean) => Promise<ExternalAtaBalance>;
      applyOpeningBalance: (result: ExternalAtaBalance, actor: { id: string }, reason: string) => Promise<unknown>;
    };
    const loadStoredBalance = vi.spyOn(internals, "loadStoredBalance");
    const queryAtaBalance = vi.spyOn(internals, "queryAtaBalance").mockResolvedValue(live);
    const applyOpeningBalance = vi.spyOn(internals, "applyOpeningBalance").mockResolvedValue({ applied: true });

    await service.applyAtaOpeningBalance("ata-1", { id: "admin-1" }, "Carga inicial da implantação");

    expect(queryAtaBalance).toHaveBeenCalledWith("ata-1", undefined, true);
    expect(loadStoredBalance).not.toHaveBeenCalled();
    expect(applyOpeningBalance).toHaveBeenCalledWith(live, { id: "admin-1" }, "Carga inicial da implantação");
  });
});
