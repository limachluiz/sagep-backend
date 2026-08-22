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
  certificateMode: z.enum(["INTERNAL_CA", "IMPORTED", "ACME_DNS"]),
});

export const initializeInternalCertificateSchema = z.object({
  hostName: hostNameSchema,
  rotate: z.boolean().default(false),
});

export const trustKitPlatformSchema = z.object({
  platform: z.enum(["windows", "linux"]),
});

export type UpdateDeploymentInput = z.infer<typeof updateDeploymentSchema>;
export type InitializeInternalCertificateInput = z.infer<typeof initializeInternalCertificateSchema>;
