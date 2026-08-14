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
  defaultBiddingNumber: z.string().trim().max(30).nullable().optional(),
  defaultBiddingYear: z.coerce.number().int().min(2000).max(2200).nullable().optional(),
  defaultImmediateCommitment: z.boolean(),
  defaultEstimateGroup: z.string().trim().min(1).max(20),
});

export const integrationProviderSchema = z.object({
  provider: z.enum(["DATABASE", "PORTAL_TRANSPARENCIA", "COMPRAS_GOV"]),
});

export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsSchema>;
export type IntegrationProviderInput = z.infer<typeof integrationProviderSchema>["provider"];
