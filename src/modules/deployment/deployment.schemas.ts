import { z } from "zod";

const hostNameSchema = z.string().trim().toLowerCase().min(4).max(253).regex(
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
  "Informe um nome DNS completo, por exemplo sagep.4cta.eb.mil.br",
);

const optionalText = z.string().trim().max(255).nullable().optional();
const list = z.array(z.string().trim().min(1).max(255)).max(12).default([]);

export const updateDeploymentSchema = z.object({
  hostName: hostNameSchema.nullable(),
  expectedIp: optionalText,
  gateway: optionalText,
  dnsServers: list,
  ntpServers: list,
  allowedNetworks: list,
  proxyUrl: z.union([z.string().trim().url(), z.literal(""), z.null()]).optional(),
  certificateMode: z.literal("INTERNAL_CA"),
});

export const initializeInternalCertificateSchema = z.object({
  hostName: hostNameSchema,
  rotate: z.boolean().default(false),
});

export const trustKitPlatformSchema = z.object({
  platform: z.enum(["windows", "linux"]),
});

const authorityPassphrase = z.string().min(20, "A senha deve ter pelo menos 20 caracteres").max(256);

export const exportAuthorityBackupSchema = z.object({
  passphrase: authorityPassphrase,
  passphraseConfirmation: authorityPassphrase,
}).refine((input) => input.passphrase === input.passphraseConfirmation, {
  message: "A confirmação da senha é diferente",
  path: ["passphraseConfirmation"],
});

export const restoreAuthorityBackupSchema = z.object({
  archiveBase64: z.string().min(1).max(1_500_000),
  passphrase: authorityPassphrase,
  confirmation: z.literal("RESTAURAR AUTORIDADE"),
});

export type UpdateDeploymentInput = z.infer<typeof updateDeploymentSchema>;
export type InitializeInternalCertificateInput = z.infer<typeof initializeInternalCertificateSchema>;
export type ExportAuthorityBackupInput = z.infer<typeof exportAuthorityBackupSchema>;
export type RestoreAuthorityBackupInput = z.infer<typeof restoreAuthorityBackupSchema>;
