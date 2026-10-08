import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const roles = z.array(z.enum(["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"])).max(4).default([]);
const recipient = z.object({ email: z.string().trim().toLowerCase().email().max(254), name: optionalText(120), active: z.boolean().default(true) });

export const smtpSettingsSchema = z.object({
  enabled: z.boolean(), host: z.string().trim().min(1).max(253), port: z.coerce.number().int().min(1).max(65535), secure: z.boolean(),
  username: optionalText(254), password: z.string().max(512).optional(), fromName: z.string().trim().min(1).max(120), fromEmail: z.string().trim().toLowerCase().email().max(254),
});
export const smtpTestSchema = z.object({ recipient: z.string().trim().toLowerCase().email().max(254) });
export const telegramSettingsSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string().trim().regex(/^\d+:[A-Za-z0-9_-]+$/, "Token de bot inválido").max(512).optional(),
  chatId: z.string().trim().min(1).max(80),
});
export const emailListSchema = z.object({
  name: z.string().trim().min(2).max(120), description: optionalText(500), active: z.boolean().default(true), roles,
  recipients: z.array(recipient).min(1).max(500).superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => { if (seen.has(item.email)) context.addIssue({ code: "custom", path: [index, "email"], message: "E-mail repetido na lista" }); seen.add(item.email); });
  }),
});
export const emailListIdSchema = z.string().trim().min(1).max(64);

export const notificationAutomationSchema = z.object({
  enabled: z.boolean(),
  timeZone: z.string().trim().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(); return true; } catch { return false; }
  }, "Fuso horário inválido"),
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7).transform((items) => [...new Set(items)].sort()),
  syncTrackedCommitments: z.boolean(),
  discoverCommitments: z.boolean(),
  syncAtaBalances: z.boolean(),
  managementUnits: z.array(z.string().trim().regex(/^\d{6}$/)).max(20).transform((items) => [...new Set(items)]),
  emailEnabled: z.boolean(),
  telegramEnabled: z.boolean(),
  emailListIds: z.array(z.string().trim().min(1).max(64)).max(100).transform((items) => [...new Set(items)]),
  notifyRoles: roles,
  maxDiscoveryPages: z.coerce.number().int().min(1).max(1000).default(100),
  taskDueDays: z.coerce.number().int().min(1).max(30).default(3),
  projectStaleDays: z.coerce.number().int().min(1).max(365).default(15),
  ataExpiryDays: z.coerce.number().int().min(1).max(365).default(90),
}).refine((value) => value.syncTrackedCommitments || value.discoverCommitments || value.syncAtaBalances, {
  message: "Ative pelo menos uma rotina de verificação",
});

export type SmtpSettingsInput = z.infer<typeof smtpSettingsSchema>;
export type TelegramSettingsInput = z.infer<typeof telegramSettingsSchema>;
export type EmailListInput = z.infer<typeof emailListSchema>;
export type NotificationAutomationInput = z.infer<typeof notificationAutomationSchema>;
