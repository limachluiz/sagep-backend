import { z } from "zod";

export const updateSystemSettingsSchema = z.object({
  organizationName: z.string().trim().min(3).max(160),
  organizationAcronym: z.string().trim().min(2).max(40),
  uasg: z.string().trim().regex(/^\d{6}$/, "A UASG deve possuir 6 dígitos"),
  management: z.string().trim().regex(/^\d{5}$/, "A Gestão deve possuir 5 dígitos"),
  timeZone: z.string().trim().min(3).max(80),
  commandName: z.string().trim().min(3).max(160),
  portalTransparenciaBaseUrl: z.string().url(),
  portalSyncIntervalMinutes: z.coerce.number().int().min(15).max(43_200),
  portalSyncOnStartup: z.boolean(),
  comprasGovBaseUrl: z.string().url(),
  pncpBaseUrl: z.string().url().optional(),
  defaultBiddingNumber: z.string().trim().max(30).nullable().optional(),
  defaultBiddingYear: z.coerce.number().int().min(2000).max(2200).nullable().optional(),
  defaultImmediateCommitment: z.boolean(),
  defaultEstimateGroup: z.string().trim().min(1).max(20),
});

export const integrationProviderSchema = z.object({
  provider: z.enum(["DATABASE", "PORTAL_TRANSPARENCIA", "COMPRAS_GOV", "PNCP"]),
});

export const portalApiTokenSchema = z.object({
  token: z.string().trim().min(8, "Informe um token válido").max(512),
});

export const implantationModeSchema = z.object({
  active: z.boolean(),
  cutoffAt: z.coerce.date().optional(),
  reason: z.string().trim().min(10, "Informe uma justificativa com pelo menos 10 caracteres").max(500),
  confirm: z.literal(true),
}).superRefine((input, context) => {
  if (input.active && !input.cutoffAt) {
    context.addIssue({ code: "custom", path: ["cutoffAt"], message: "Informe a data de corte da implantação" });
  }
});

export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsSchema>;
export type IntegrationProviderInput = z.infer<typeof integrationProviderSchema>["provider"];
export type PortalApiTokenInput = z.infer<typeof portalApiTokenSchema>;
export type ImplantationModeInput = z.infer<typeof implantationModeSchema>;
