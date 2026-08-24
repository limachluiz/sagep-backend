import { z } from "zod";

export const evidenceCategorySchema = z.enum([
  "IMAGE", "VIDEO", "KMZ_KML", "TECHNICAL_DOCUMENT", "CERTIFICATION", "DIAGRAM", "AS_BUILT", "OTHER",
]);
export const evidencePhaseSchema = z.enum(["BEFORE", "DURING", "AFTER", "GENERAL"]);

export const evidenceUploadHeadersSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  filename: z.string().trim().min(1).max(255),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  category: evidenceCategorySchema,
  phase: evidencePhaseSchema.default("GENERAL"),
  includeInReport: z.boolean().default(false),
});

export const updateEvidenceSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: evidenceCategorySchema.optional(),
  phase: evidencePhaseSchema.optional(),
  includeInReport: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
}).refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo");
