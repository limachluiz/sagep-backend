import { z } from "zod";

export const notificationListQuerySchema = z.object({
  status: z.enum(["ALL", "UNREAD", "READ", "DISMISSED", "RESOLVED"]).default("ALL"),
  category: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
});

export const notificationIdSchema = z.string().trim().min(1).max(64);

