import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn(), bodies: [] as string[] }));
vi.mock("node:https", () => ({ default: { request: mocks.request } }));

import { sendTelegramMessage } from "../src/modules/notification-settings/telegram.client.js";

function telegramReply(statusCode: number, payload: unknown) {
  mocks.request.mockImplementationOnce((options: Record<string, unknown>, callback: (response: EventEmitter & { statusCode: number; destroy: (error: Error) => void }) => void) => {
    const operation = new EventEmitter() as EventEmitter & { end: (body: string) => void; destroy: (error: Error) => void };
    operation.end = (body) => {
      mocks.bodies.push(body);
      const response = new EventEmitter() as EventEmitter & { statusCode: number; destroy: (error: Error) => void };
      response.statusCode = statusCode;
      response.destroy = (error) => response.emit("error", error);
      callback(response);
      queueMicrotask(() => { response.emit("data", Buffer.from(JSON.stringify(payload))); response.emit("end"); });
    };
    operation.destroy = (error) => operation.emit("error", error);
    Object.assign(operation, { options });
    return operation;
  });
}

describe("cliente Telegram", () => {
  beforeEach(() => { mocks.request.mockReset(); mocks.bodies.length = 0; });

  it("envia usando IPv4 e aceita a confirmação da API", async () => {
    telegramReply(200, { ok: true });
    await expect(sendTelegramMessage("123:abc", "456", "teste")).resolves.toBeUndefined();
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ hostname: "api.telegram.org", family: 4, method: "POST" }), expect.any(Function));
  });

  it("explica quando o bot ainda não conhece o chat", async () => {
    telegramReply(400, { ok: false, description: "Bad Request: chat not found" });
    await expect(sendTelegramMessage("123:abc", "456", "teste")).rejects.toMatchObject({
      statusCode: 422,
      code: "TELEGRAM_CHAT_NOT_FOUND",
    });
  });

  it("repete uma falha transitória antes de concluir", async () => {
    telegramReply(502, { ok: false, description: "Bad Gateway" });
    telegramReply(200, { ok: true });
    await expect(sendTelegramMessage("123:abc", "456", "teste")).resolves.toBeUndefined();
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it("envia HTML e botões de acesso como teclado inline", async () => {
    telegramReply(200, { ok: true });
    await sendTelegramMessage("123:abc", "456", "<b>Resumo</b>", { parseMode: "HTML", buttons: [
      { text: "NE 1", url: "https://portaldatransparencia.gov.br/ne/1" },
      { text: "Pagas", callbackData: "sagep:c:NE_PAID:0" },
    ] });
    expect(JSON.parse(mocks.bodies[0]!)).toMatchObject({
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[
        { text: "NE 1", url: "https://portaldatransparencia.gov.br/ne/1" },
        { text: "Pagas", callback_data: "sagep:c:NE_PAID:0" },
      ]] },
    });
  });
});
