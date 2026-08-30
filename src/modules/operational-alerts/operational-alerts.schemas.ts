import { z } from "zod";

export const operationalAlertsQuerySchema = z.object({
  staleDays: z.coerce.number().int().positive().max(365).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const notificationKeyParamSchema = z.object({
  notificationKey: z.string().trim().min(1),
});
