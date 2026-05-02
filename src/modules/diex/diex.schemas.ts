import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { optionalDate, optionalString} from "../../shared/zod-helpers.js";

export const createDiexSchema = z.object({
  projectId: z.string().min(1).optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  estimateId: z.string().min(1).optional(),
  estimateCode: z.coerce.number().int().positive().optional(),
  diexNumber: optionalString,
  issuedAt: optionalDate,
  supplierCnpj: z.string().trim().min(14, "CNPJ do fornecedor é obrigatório"),
  requesterName: optionalString,
  requesterRank: optionalString,
  requesterCpf: optionalString,
  requesterRole: optionalString,
  issuingOrganization: optionalString,
  commandName: optionalString,
  pregaoNumber: optionalString,
  uasg: optionalString,
  notes: optionalString,
})
  .refine((data) => data.projectId || data.projectCode, {
    message: "Informe projectId ou projectCode",
    path: ["projectId"],
  })
  .refine((data) => !(data.projectId && data.projectCode), {
    message: "Informe projectId ou projectCode, não ambos",
    path: ["projectId"],
  })
  .refine((data) => data.estimateId || data.estimateCode, {
    message: "Informe estimateId ou estimateCode",
    path: ["estimateId"],
  })
  .refine((data) => !(data.estimateId && data.estimateCode), {
    message: "Informe estimateId ou estimateCode, não ambos",
    path: ["estimateId"],
  });

export const updateDiexSchema = z.object({
  diexNumber: optionalString,
  issuedAt: optionalDate,
  supplierCnpj: z.string().trim().min(14).optional(),
  requesterName: z.string().trim().min(3).optional(),
  requesterRank: z.string().trim().min(2).optional(),
  requesterRole: optionalString,
  requesterCpf: optionalString,
  issuingOrganization: optionalString,
  commandName: optionalString,
  pregaoNumber: optionalString,
  uasg: optionalString,
  notes: optionalString,
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe pelo menos um campo para atualizar",
});

export const listDiexQuerySchema = paginationQuerySchema.extend({
  code: z.coerce.number().int().positive().optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  estimateCode: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
  includeArchived: z.coerce.boolean().optional(),
  onlyArchived: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().optional(),
  onlyDeleted: z.coerce.boolean().optional(),
  archivedFrom: optionalDate,
  archivedUntil: optionalDate,
});

export const archivedDiexQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
});

export const diexIdParamSchema = z.object({
  id: z.string().min(1, "Id do DIEx é obrigatório"),
});

export const diexCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código do DIEx inválido"),
});
