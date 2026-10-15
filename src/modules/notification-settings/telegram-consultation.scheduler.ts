import type { NotificationAutomationEventType } from "../../generated/prisma/enums.js";
import { prisma } from "../../config/prisma.js";
import { notificationSettingsService } from "./notification-settings.service.js";
import { commitmentNumber } from "./notification-automation.service.js";
import { telegramApiRequest, type TelegramButton } from "./telegram.client.js";

type TelegramUpdate = {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number | string } };
  };
};

const PAGE_SIZE = 5;
const EVENT_TYPES = new Set<NotificationAutomationEventType>([
  "NE_PAID", "NE_LIQUIDATED", "NE_CANCELLED", "NE_DISCOVERED", "ATA_BALANCE_CHANGED", "AUTOMATION_FAILED",
]);
const LABELS: Record<NotificationAutomationEventType, string> = {
  NE_PAID: "✅ NEs pagas",
  NE_LIQUIDATED: "💧 NEs liquidadas",
  NE_CANCELLED: "🚫 NEs anuladas · recurso recolhido",
  NE_DISCOVERED: "🆕 Novas NEs encontradas",
  ATA_BALANCE_CHANGED: "📦 Alterações de saldo das ATAs",
  AUTOMATION_FAILED: "⚠️ Pendências da automação",
};
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const since = () => new Date(Date.now() - 30 * 24 * 60 * 60_000);

async function mainMenu() {
  const grouped = await prisma.notificationAutomationEvent.groupBy({
    by: ["type"],
    where: { occurredAt: { gte: since() }, resolvedAt: null },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((item) => [item.type, item._count._all]));
  const buttons = [...EVENT_TYPES].flatMap((type) => {
    const count = counts.get(type) ?? 0;
    return count ? [{ text: `${LABELS[type]} (${count})`, callbackData: `sagep:c:${type}:0` }] : [];
  });
  return {
    text: `<b>📊 SAGEP · Central de consulta</b>\n\nResultados das verificações agendadas dos últimos 30 dias.\n\n${buttons.length ? "Selecione uma categoria:" : "Nenhum alerta financeiro ativo no período."}`,
    buttons,
  };
}

async function categoryMenu(type: NotificationAutomationEventType, page: number) {
  const where = { type, occurredAt: { gte: since() }, resolvedAt: null } as const;
  const [events, total] = await Promise.all([
    prisma.notificationAutomationEvent.findMany({ where, orderBy: { occurredAt: "desc" }, skip: page * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.notificationAutomationEvent.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  if (safePage !== page) return categoryMenu(type, safePage);
  const text = [
    `<b>${LABELS[type]}</b>`,
    `<i>${total} registro(s) · página ${safePage + 1} de ${pages}</i>`,
    ...events.map((event) => `• <b>${escapeHtml(event.title)}</b>\n  ${escapeHtml(event.description)}`),
  ].join("\n\n");
  const buttons: TelegramButton[] = [];
  for (const event of events) {
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : null;
    const code = typeof payload?.externalCode === "string" ? payload.externalCode : null;
    if (code && /^\d{15}NE\d{6}$/i.test(code)) buttons.push({ text: `🏛️ ${commitmentNumber(code)}`, url: `https://portaldatransparencia.gov.br/despesas/documento/empenho/${encodeURIComponent(code)}` });
  }
  if (safePage > 0) buttons.push({ text: "⬅️ Anterior", callbackData: `sagep:c:${type}:${safePage - 1}` });
  if (safePage + 1 < pages) buttons.push({ text: "Próxima ➡️", callbackData: `sagep:c:${type}:${safePage + 1}` });
  buttons.push({ text: "🏠 Menu principal", callbackData: "sagep:m" });
  return { text, buttons };
}

function keyboard(buttons: TelegramButton[]) {
  const rows: Array<Array<Record<string, string>>> = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2).map((button) => ({ text: button.text, ...(button.url ? { url: button.url } : { callback_data: button.callbackData! }) })));
  }
  return { inline_keyboard: rows };
}

async function handleUpdate(token: string, configuredChatId: string, update: TelegramUpdate) {
  const callback = update.callback_query;
  if (!callback?.message || !callback.data?.startsWith("sagep:")) return;
  if (String(callback.message.chat.id) !== configuredChatId) {
    await telegramApiRequest(token, "answerCallbackQuery", { callback_query_id: callback.id, text: "Esta central pertence ao chat configurado no SAGEP.", show_alert: true });
    return;
  }
  let view: { text: string; buttons: TelegramButton[] };
  const match = callback.data.match(/^sagep:c:([A-Z_]+):(\d+)$/);
  if (callback.data === "sagep:m") view = await mainMenu();
  else if (match && EVENT_TYPES.has(match[1] as NotificationAutomationEventType)) view = await categoryMenu(match[1] as NotificationAutomationEventType, Number(match[2]));
  else {
    await telegramApiRequest(token, "answerCallbackQuery", { callback_query_id: callback.id, text: "Menu expirado ou inválido." });
    return;
  }
  await telegramApiRequest(token, "editMessageText", {
    chat_id: configuredChatId,
    message_id: callback.message.message_id,
    text: view.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard(view.buttons),
  });
  await telegramApiRequest(token, "answerCallbackQuery", { callback_query_id: callback.id });
}

export function startTelegramConsultationScheduler() {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const poll = async () => {
    let delay = 1_000;
    try {
      const configuration = await notificationSettingsService.telegramRuntimeConfiguration();
      if (!configuration) delay = 10_000;
      else {
        const updates = await telegramApiRequest<TelegramUpdate[]>(configuration.token, "getUpdates", {
          ...(configuration.updateOffset == null ? {} : { offset: configuration.updateOffset }),
          timeout: 20,
          limit: 20,
          allowed_updates: ["callback_query"],
        }, 25_000);
        for (const update of updates) {
          try { await handleUpdate(configuration.token, configuration.chatId, update); }
          catch (error) { console.error("Falha ao responder menu de consulta do Telegram", { errorName: error instanceof Error ? error.name : typeof error }); }
        }
        if (updates.length) await notificationSettingsService.saveTelegramUpdateOffset(Math.max(...updates.map((update) => update.update_id)) + 1);
      }
    } catch (error) {
      delay = 10_000;
      console.error("Falha ao consultar interações do Telegram", { errorName: error instanceof Error ? error.name : typeof error });
    } finally {
      if (!stopped) timer = setTimeout(() => void poll(), delay);
    }
  };
  void poll();
  return { stop: () => { stopped = true; if (timer) clearTimeout(timer); } };
}
