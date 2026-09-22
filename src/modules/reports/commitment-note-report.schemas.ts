import { z } from "zod";

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export const commitmentNoteReportQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  supplier: z.string().trim().max(200).optional(),
  status: z.string().trim().max(40).optional(),
  origin: z.enum(["PROJECT", "IMPORTED", "STANDALONE"]).optional(),
  managementUnit: z.string().trim().regex(/^\d{6}$/).optional(),
  issuedFrom: dateInput,
  issuedTo: dateInput,
  codes: z.string().trim().max(4000).optional().transform((value, context) => {
    if (!value) return [];
    const codes = [...new Set(value.split(",").map((code) => code.trim()).filter(Boolean))];
    if (codes.length > 100 || codes.some((code) => !/^(?:\d{15}NE\d{6}|MANUAL:[A-Za-z0-9:_-]+)$/.test(code))) {
      context.addIssue({ code: "custom", message: "Selecione até 100 códigos válidos de Nota de Empenho" });
      return z.NEVER;
    }
    return codes;
  }),
}).superRefine((value, context) => {
  if (value.issuedFrom && value.issuedTo && value.issuedFrom > value.issuedTo) {
    context.addIssue({ code: "custom", path: ["issuedTo"], message: "A data final deve ser igual ou posterior à inicial" });
  }
});

export type CommitmentNoteReportFilters = z.infer<typeof commitmentNoteReportQuerySchema>;
