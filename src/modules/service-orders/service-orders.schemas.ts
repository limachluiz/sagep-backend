import { z } from "zod";
import { optionalBoolean, optionalDate, optionalString } from "../../shared/zod-helpers.js";

export const createServiceOrderSchema = z.object({
  projectId: z.string().min(1).optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  estimateId: z.string().min(1).optional(),
  estimateCode: z.coerce.number().int().positive().optional(),
  diexId: z.string().min(1).optional(),
  diexCode: z.coerce.number().int().positive().optional(),
  serviceOrderNumber: z.string().trim().min(3, "Número da OS é obrigatório"),
  issuedAt: z.coerce.date(),
  contractorCnpj: z.string().trim().min(14, "CNPJ da empresa é obrigatório"),
  requesterName: z.string().trim().min(3, "Nome do responsável é obrigatório"),
  requesterRank: z.string().trim().min(2, "Posto/graduação é obrigatório"),
  requesterRole: optionalString,
  issuingOrganization: optionalString,
  isEmergency: optionalBoolean,
  plannedStartDate: optionalDate,
  plannedEndDate: optionalDate,
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
  })
  .refine((data) => !(data.diexId && data.diexCode), {
    message: "Informe diexId ou diexCode, não ambos",
    path: ["diexId"],
  })
  .refine((data) => {
    if (data.plannedStartDate && data.plannedEndDate) {
      return data.plannedEndDate >= data.plannedStartDate;
    }
    return true;
  }, {
    message: "A data prevista de entrega não pode ser menor que a data prevista de início",
    path: ["plannedEndDate"],
  });

export const updateServiceOrderSchema = z.object({
  serviceOrderNumber: z.string().trim().min(3).optional(),
  issuedAt: optionalDate,
  contractorCnpj: z.string().trim().min(14).optional(),
  requesterName: z.string().trim().min(3).optional(),
  requesterRank: z.string().trim().min(2).optional(),
  requesterRole: optionalString,
  issuingOrganization: optionalString,
  isEmergency: optionalBoolean,
  plannedStartDate: optionalDate,
  plannedEndDate: optionalDate,
  notes: optionalString,
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe pelo menos um campo para atualizar",
}).refine((data) => {
  if (data.plannedStartDate && data.plannedEndDate) {
    return data.plannedEndDate >= data.plannedStartDate;
  }
  return true;
}, {
  message: "A data prevista de entrega não pode ser menor que a data prevista de início",
  path: ["plannedEndDate"],
});

export const listServiceOrdersQuerySchema = z.object({
  code: z.coerce.number().int().positive().optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  estimateCode: z.coerce.number().int().positive().optional(),
  diexCode: z.coerce.number().int().positive().optional(),
  emergency: optionalBoolean,
  search: z.string().trim().optional(),
});

export const serviceOrderIdParamSchema = z.object({
  id: z.string().min(1, "Id da OS é obrigatório"),
});

export const serviceOrderCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código da OS inválido"),
});