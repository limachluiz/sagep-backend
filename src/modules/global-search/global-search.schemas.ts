import { z } from "zod";

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "Termo de busca é obrigatório"),
  limit: z.coerce.number().int().positive().max(20).optional(),
});
