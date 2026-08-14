import { z } from "zod";
import { optionalDate, optionalString } from "../../shared/zod-helpers.js";

const commitmentNumberSchema = z.string().trim().transform((value) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
).refine((value) => /^\d{4}NE\d{6}$/.test(value), {
  message: "Informe a NE no formato 2026NE000534",
});

const portalLookupFields = {
  number: commitmentNumberSchema,
  managementUnit: z.string().regex(/^\d{6}$/).default("160016"),
  management: z.string().regex(/^\d{5}$/).default("00001"),
};

export const standaloneCommitmentNoteLookupSchema = z.object(portalLookupFields);

const lookupFields = {
  projectId: z.string().trim().min(1),
  ...portalLookupFields,
};

export const previewCommitmentNoteSchema = z.object(lookupFields);

export const registerCommitmentNoteSchema = z.object({
  ...lookupFields,
  receivedAt: z.coerce.date(),
  acceptDivergence: z.boolean().default(false),
});

export const listCommitmentNotesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  financialStatus: z.enum([
    "NAO_LIQUIDADA",
    "PARCIALMENTE_LIQUIDADA",
    "LIQUIDADA",
    "PARCIALMENTE_PAGA",
    "PAGA",
    "PARCIALMENTE_ANULADA",
    "ANULADA",
  ]).optional(),
  syncStatus: z.enum(["VALIDADO", "DIVERGENTE", "ERRO"]).optional(),
  projectId: z.string().trim().optional(),
});

export const commitmentNoteIdSchema = z.object({ id: z.string().trim().min(1) });

export const createInvoiceSchema = z.object({
  projectId: z.string().trim().min(1),
  commitmentNoteId: optionalString,
  number: z.string().trim().min(1),
  series: optionalString,
  accessKey: z.string().trim().regex(/^\d{44}$/, "A chave da NFe deve possuir 44 dígitos").optional(),
  supplierCnpj: z.string().trim().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 14, "CNPJ inválido"),
  issuedAt: z.coerce.date(),
  grossAmount: z.coerce.number().positive(),
  attestedAmount: z.coerce.number().positive().optional(),
  attestedAt: optionalDate,
  documentLink: z.string().url().optional(),
  notes: optionalString,
});

export type PreviewCommitmentNoteInput = z.infer<typeof previewCommitmentNoteSchema>;
export type StandaloneCommitmentNoteLookupInput = z.infer<typeof standaloneCommitmentNoteLookupSchema>;
export type RegisterCommitmentNoteInput = z.infer<typeof registerCommitmentNoteSchema>;
export type ListCommitmentNotesInput = z.infer<typeof listCommitmentNotesSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
