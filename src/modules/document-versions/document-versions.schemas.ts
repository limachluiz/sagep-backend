import { z } from "zod";

export const documentVersionListSchema = z.object({
  entityType: z.string().trim().min(1).max(80),
  entityId: z.string().trim().min(1).max(120),
  documentType: z.string().trim().min(1).max(80).optional(),
});

export const documentVersionIdSchema = z.object({ id: z.string().trim().min(1) });

export const signedDocumentSchema = z.object({
  fileBase64: z.string().min(1),
  filename: z.string().trim().min(1).max(180),
  signerName: z.string().trim().min(2).max(160),
  signerDocument: z.string().trim().max(40).optional(),
  signatureProvider: z.string().trim().min(2).max(120),
  signedAt: z.coerce.date().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
});

export const signatureValidationSchema = z.object({
  status: z.enum(["VALID", "INVALID"]),
  validator: z.string().trim().min(2).max(120),
  validatedAt: z.coerce.date().default(() => new Date()),
  details: z.string().trim().min(3).max(1000),
});

export const invalidateDocumentVersionSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});
