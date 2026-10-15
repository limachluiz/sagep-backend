import https from "node:https";

import { AppError } from "../../shared/app-error.js";

type TelegramResponse = {
  ok?: boolean;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function telegramError(payload: TelegramResponse | null, statusCode: number) {
  const description = payload?.description ?? `HTTP ${statusCode}`;
  const normalized = description.toLowerCase();
  if (statusCode === 401 || normalized.includes("unauthorized")) {
    return new AppError("O Telegram recusou o token do bot. Copie novamente o token fornecido pelo BotFather", 422, "TELEGRAM_TOKEN_INVALID");
  }
  if (normalized.includes("chat not found")) {
    return new AppError("Chat ID não encontrado. Envie /start ao bot antes do teste e confira o Chat ID informado", 422, "TELEGRAM_CHAT_NOT_FOUND");
  }
  if (statusCode === 403 || normalized.includes("forbidden")) {
    return new AppError("O bot não pode enviar mensagens para esse destino. Inicie a conversa ou adicione o bot ao grupo/canal com permissão para publicar", 422, "TELEGRAM_DESTINATION_FORBIDDEN");
  }
  if (statusCode === 429) {
    const seconds = payload?.parameters?.retry_after;
    return new AppError(seconds ? `O Telegram limitou os envios. Tente novamente em ${seconds} segundo(s)` : "O Telegram limitou os envios. Aguarde e tente novamente", 429, "TELEGRAM_RATE_LIMITED");
  }
  if (statusCode >= 500) {
    return new AppError("O Telegram está temporariamente indisponível. Tente novamente em instantes", 503, "TELEGRAM_UNAVAILABLE");
  }
  return new AppError(`Telegram recusou a mensagem: ${description}`, 422, "TELEGRAM_DELIVERY_REJECTED");
}

type TelegramFormat = { parseMode?: "HTML"; buttons?: Array<{ text: string; url: string }> };
const buttonRows = (buttons: Array<{ text: string; url: string }>) => {
  const rows: Array<Array<{ text: string; url: string }>> = [];
  for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
  return rows;
};

function request(token: string, chatId: string, text: string, format?: TelegramFormat) {
  return new Promise<{ statusCode: number; payload: TelegramResponse | null }>((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      ...(format?.parseMode ? { parse_mode: format.parseMode } : {}),
      disable_web_page_preview: true,
      ...(format?.buttons?.length ? { reply_markup: { inline_keyboard: buttonRows(format.buttons) } } : {}),
    });
    const operation = https.request({
      hostname: "api.telegram.org",
      port: 443,
      family: 4,
      method: "POST",
      path: `/bot${token}/sendMessage`,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), accept: "application/json" },
      timeout: 15_000,
    }, (response) => {
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > 64 * 1024) {
          response.destroy(new Error("Resposta do Telegram excedeu o limite permitido"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        let payload: TelegramResponse | null = null;
        try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as TelegramResponse; } catch { /* resposta inválida tratada abaixo */ }
        resolve({ statusCode: response.statusCode ?? 502, payload });
      });
    });
    operation.on("timeout", () => operation.destroy(new Error("timeout")));
    operation.on("error", reject);
    operation.end(body);
  });
}

export async function sendTelegramMessage(token: string, chatId: string, text: string, format?: TelegramFormat) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await request(token, chatId, text, format);
      if (result.statusCode < 500 && result.statusCode !== 429) {
        if (result.statusCode >= 200 && result.statusCode < 300 && result.payload?.ok) return;
        throw telegramError(result.payload, result.statusCode);
      }
      lastError = telegramError(result.payload, result.statusCode);
    } catch (error) {
      if (error instanceof AppError && error.statusCode < 500) throw error;
      lastError = error;
    }
    if (attempt === 0) await wait(process.env.NODE_ENV === "test" ? 0 : 350);
  }
  if (lastError instanceof AppError) throw lastError;
  throw new AppError("Não foi possível conectar ao Telegram. Verifique a internet, o DNS e o firewall do servidor SAGEP", 503, "TELEGRAM_CONNECTION_FAILED");
}
