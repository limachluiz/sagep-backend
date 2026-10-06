import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { decryptSecret, encryptSecret, secretEncryptionSource } from "../../shared/secret-envelope.js";
import { auditService } from "../audit/audit.service.js";
import { sendSmtpMessage, verifySmtp } from "./smtp.client.js";
import type { EmailListInput, SmtpSettingsInput, TelegramSettingsInput } from "./notification-settings.schemas.js";
import type { UserRole } from "../../generated/prisma/enums.js";

const SMTP_PURPOSE = "notification-smtp-password";
const TELEGRAM_PURPOSE = "notification-telegram-bot-token";
type Actor = { id: string; name?: string; email?: string };

function actorName(actor: Actor) { return actor.name ?? actor.email ?? null; }
function secretSummary(value?: string | null) { return { configured: Boolean(value), encryption: value ? secretEncryptionSource() : null }; }

export class NotificationSettingsService {
  private async configuration() {
    return prisma.notificationChannelConfiguration.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  }

  async get() {
    const [configuration, emailLists] = await Promise.all([
      this.configuration(),
      prisma.notificationEmailList.findMany({ include: { recipients: { orderBy: [{ active: "desc" }, { email: "asc" }] } }, orderBy: { name: "asc" } }),
    ]);
    return {
      smtp: { enabled: configuration.smtpEnabled, host: configuration.smtpHost, port: configuration.smtpPort, secure: configuration.smtpSecure, username: configuration.smtpUsername, fromName: configuration.smtpFromName, fromEmail: configuration.smtpFromEmail, password: secretSummary(configuration.smtpPasswordEncrypted) },
      telegram: { enabled: configuration.telegramEnabled, chatId: configuration.telegramChatId, botToken: secretSummary(configuration.telegramBotTokenEncrypted) },
      emailLists,
    };
  }

  async saveSmtp(input: SmtpSettingsInput, actor: Actor) {
    const current = await this.configuration();
    if (input.enabled && input.username && !input.password && !current.smtpPasswordEncrypted) throw new AppError("Informe a senha SMTP antes de ativar o canal", 422, "SMTP_PASSWORD_REQUIRED");
    await prisma.notificationChannelConfiguration.update({ where: { id: "default" }, data: {
      smtpEnabled: input.enabled, smtpHost: input.host, smtpPort: input.port, smtpSecure: input.secure,
      smtpUsername: input.username || null, smtpFromName: input.fromName, smtpFromEmail: input.fromEmail,
      ...(input.password ? { smtpPasswordEncrypted: encryptSecret(input.password, SMTP_PURPOSE) } : {}), updatedById: actor.id,
    } });
    await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: "NOTIFICATION_SMTP", action: "UPDATE", actor: { id: actor.id, name: actorName(actor) }, summary: "Canal SMTP de notificações atualizado", after: { enabled: input.enabled, host: input.host, port: input.port, secure: input.secure, usernameConfigured: Boolean(input.username), passwordChanged: Boolean(input.password), fromEmail: input.fromEmail } });
    return this.get();
  }

  private async smtpConnection() {
    const config = await this.configuration();
    if (!config.smtpHost || !config.smtpFromEmail) throw new AppError("Configure o servidor SMTP e o remetente", 422, "SMTP_NOT_CONFIGURED");
    return { config, connection: { host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure, username: config.smtpUsername, password: config.smtpPasswordEncrypted ? decryptSecret(config.smtpPasswordEncrypted, SMTP_PURPOSE, "SMTP_PASSWORD_DECRYPTION_FAILED") : null } };
  }

  async testSmtp(recipient: string, actor: Actor) {
    const { config, connection } = await this.smtpConnection();
    await verifySmtp(connection);
    await sendSmtpMessage(connection, { fromName: config.smtpFromName, fromEmail: config.smtpFromEmail!, to: [recipient], subject: "Teste de notificações do SAGEP", text: `O canal SMTP do SAGEP foi configurado com sucesso.\n\nTeste solicitado por ${actorName(actor) ?? "administrador"} em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}.` });
    return { success: true, message: `E-mail de teste enviado para ${recipient}` };
  }

  async saveTelegram(input: TelegramSettingsInput, actor: Actor) {
    const current = await this.configuration();
    if (input.enabled && !input.botToken && !current.telegramBotTokenEncrypted) throw new AppError("Informe o token do bot antes de ativar o Telegram", 422, "TELEGRAM_TOKEN_REQUIRED");
    await prisma.notificationChannelConfiguration.update({ where: { id: "default" }, data: { telegramEnabled: input.enabled, telegramChatId: input.chatId, ...(input.botToken ? { telegramBotTokenEncrypted: encryptSecret(input.botToken, TELEGRAM_PURPOSE) } : {}), updatedById: actor.id } });
    await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: "NOTIFICATION_TELEGRAM", action: "UPDATE", actor: { id: actor.id, name: actorName(actor) }, summary: "Canal Telegram de notificações atualizado", after: { enabled: input.enabled, chatId: input.chatId, tokenChanged: Boolean(input.botToken) } });
    return this.get();
  }

  async testTelegram(actor: Actor) {
    const config = await this.configuration();
    if (!config.telegramBotTokenEncrypted || !config.telegramChatId) throw new AppError("Configure o token do bot e o chat de destino", 422, "TELEGRAM_NOT_CONFIGURED");
    const token = decryptSecret(config.telegramBotTokenEncrypted, TELEGRAM_PURPOSE, "TELEGRAM_TOKEN_DECRYPTION_FAILED");
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: config.telegramChatId, text: `✅ Teste do SAGEP concluído\nCanal configurado por ${actorName(actor) ?? "administrador"}.` }), signal: AbortSignal.timeout(15_000) });
    const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
    if (!response.ok || !payload?.ok) throw new AppError(`Telegram recusou a mensagem: ${payload?.description ?? `HTTP ${response.status}`}`, 502, "TELEGRAM_DELIVERY_FAILED");
    return { success: true, message: "Mensagem de teste enviada ao Telegram" };
  }

  async deliverAutomationDigest(input: {
    subject: string;
    text: string;
    emailEnabled: boolean;
    telegramEnabled: boolean;
    emailListIds: string[];
    notifyRoles: UserRole[];
  }) {
    const configuration = await this.configuration();
    const result: { email: { sent: boolean; recipients: number; error?: string }; telegram: { sent: boolean; error?: string } } = {
      email: { sent: false, recipients: 0 }, telegram: { sent: false },
    };

    if (input.emailEnabled && configuration.smtpEnabled) {
      try {
        const [lists, users] = await Promise.all([
          input.emailListIds.length ? prisma.notificationEmailList.findMany({
            where: { active: true, id: { in: input.emailListIds } }, include: { recipients: { where: { active: true } } },
          }) : Promise.resolve([]),
          input.notifyRoles.length
            ? prisma.user.findMany({ where: { active: true, role: { in: input.notifyRoles } }, select: { email: true } })
            : Promise.resolve([]),
        ]);
        const recipients = [...new Set([
          ...lists.flatMap((list) => list.recipients.map((recipient) => recipient.email)),
          ...users.map((user) => user.email),
        ].map((email) => email.trim().toLowerCase()).filter(Boolean))];
        result.email.recipients = recipients.length;
        if (recipients.length) {
          const { config, connection } = await this.smtpConnection();
          await sendSmtpMessage(connection, { fromName: config.smtpFromName, fromEmail: config.smtpFromEmail!, to: recipients, subject: input.subject, text: input.text });
          result.email.sent = true;
        }
      } catch (error) {
        result.email.error = error instanceof Error ? error.message : String(error);
      }
    }

    if (input.telegramEnabled && configuration.telegramEnabled) {
      try {
        if (!configuration.telegramBotTokenEncrypted || !configuration.telegramChatId) throw new Error("Telegram não configurado");
        const token = decryptSecret(configuration.telegramBotTokenEncrypted, TELEGRAM_PURPOSE, "TELEGRAM_TOKEN_DECRYPTION_FAILED");
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: configuration.telegramChatId, text: `${input.subject}\n\n${input.text}`.slice(0, 4096) }),
          signal: AbortSignal.timeout(15_000),
        });
        const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
        if (!response.ok || !payload?.ok) throw new Error(payload?.description ?? `HTTP ${response.status}`);
        result.telegram.sent = true;
      } catch (error) {
        result.telegram.error = error instanceof Error ? error.message : String(error);
      }
    }
    return result;
  }

  async createEmailList(input: EmailListInput, actor: Actor) {
    const created = await prisma.notificationEmailList.create({ data: { name: input.name, description: input.description || null, active: input.active, roles: input.roles, createdById: actor.id, updatedById: actor.id, recipients: { create: input.recipients } }, include: { recipients: true } });
    await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: created.id, action: "CREATE", actor: { id: actor.id, name: actorName(actor) }, summary: `Lista de e-mail ${created.name} criada`, after: { name: created.name, active: created.active, roles: created.roles, recipients: created.recipients.map((item) => item.email) } });
    return created;
  }

  async updateEmailList(id: string, input: EmailListInput, actor: Actor) {
    const current = await prisma.notificationEmailList.findUnique({ where: { id }, include: { recipients: true } });
    if (!current) throw new AppError("Lista de e-mail não encontrada", 404);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.notificationEmailRecipient.deleteMany({ where: { listId: id } });
      return tx.notificationEmailList.update({ where: { id }, data: { name: input.name, description: input.description || null, active: input.active, roles: input.roles, updatedById: actor.id, recipients: { create: input.recipients } }, include: { recipients: true } });
    });
    await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: id, action: "UPDATE", actor: { id: actor.id, name: actorName(actor) }, summary: `Lista de e-mail ${updated.name} atualizada`, before: { name: current.name, active: current.active, roles: current.roles, recipients: current.recipients.map((item) => item.email) }, after: { name: updated.name, active: updated.active, roles: updated.roles, recipients: updated.recipients.map((item) => item.email) } });
    return updated;
  }

  async deleteEmailList(id: string, actor: Actor) {
    const current = await prisma.notificationEmailList.findUnique({ where: { id } });
    if (!current) throw new AppError("Lista de e-mail não encontrada", 404);
    await prisma.notificationEmailList.delete({ where: { id } });
    await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: id, action: "DELETE", actor: { id: actor.id, name: actorName(actor) }, summary: `Lista de e-mail ${current.name} excluída`, before: { name: current.name } });
    return { deleted: true };
  }
}

export const notificationSettingsService = new NotificationSettingsService();
