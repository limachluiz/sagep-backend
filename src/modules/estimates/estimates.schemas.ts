import { z } from "zod";
import { optionalString} from "../../shared/zod-helpers.js";

const estimateStatusEnum = z.enum(["RASCUNHO", "FINALIZADA", "CANCELADA"]);
const ufEnum = z.enum(["AM", "RO", "RR", "AC"]);

const estimateLineInputSchema = z
  .object({
    ataItemId: z.string().min(1).optional(),
    ataItemCode: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().positive("Quantidade deve ser maior que zero"),
    notes: optionalString,
  })
  .refine((data) => data.ataItemId || data.ataItemCode, {
    message: "Informe ataItemId ou ataItemCode",
    path: ["ataItemId"],
  })
  .refine((data) => !(data.ataItemId && data.ataItemCode), {
    message: "Informe ataItemId ou ataItemCode, não ambos",
    path: ["ataItemId"],
  });

export const createEstimateSchema = z.object({
  projectId: z.string().min(1).optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  ataId: z.string().min(1).optional(),
  ataCode: z.coerce.number().int().positive().optional(),
  coverageGroupId: z.string().min(1).optional(),
  coverageGroupCode: z.string().trim().min(2).optional(),
  omId: z.string().min(1).optional(),
  omCode: z.coerce.number().int().positive().optional(),
  notes: optionalString,
  items: z.array(estimateLineInputSchema).min(1, "Informe ao menos um item"),
})
  .refine((data) => data.projectId || data.projectCode, {
    message: "Informe projectId ou projectCode",
    path: ["projectId"],
  })
  .refine((data) => !(data.projectId && data.projectCode), {
    message: "Informe projectId ou projectCode, não ambos",
    path: ["projectId"],
  })
  .refine((data) => data.ataId || data.ataCode, {
    message: "Informe ataId ou ataCode",
    path: ["ataId"],
  })
  .refine((data) => !(data.ataId && data.ataCode), {
    message: "Informe ataId ou ataCode, não ambos",
    path: ["ataId"],
  })
  .refine((data) => data.coverageGroupId || data.coverageGroupCode, {
    message: "Informe coverageGroupId ou coverageGroupCode",
    path: ["coverageGroupId"],
  })
  .refine((data) => !(data.coverageGroupId && data.coverageGroupCode), {
    message: "Informe coverageGroupId ou coverageGroupCode, não ambos",
    path: ["coverageGroupId"],
  })
  .refine((data) => data.omId || data.omCode, {
    message: "Informe omId ou omCode",
    path: ["omId"],
  })
  .refine((data) => !(data.omId && data.omCode), {
    message: "Informe omId ou omCode, não ambos",
    path: ["omId"],
  });

export const updateEstimateSchema = z.object({
  omId: z.string().min(1).optional(),
  omCode: z.coerce.number().int().positive().optional(),
  notes: optionalString,
  status: estimateStatusEnum.optional(),
  items: z.array(estimateLineInputSchema).min(1, "Informe ao menos um item").optional(),
})
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe pelo menos um campo para atualizar",
  })
  .refine((data) => !(data.omId && data.omCode), {
    message: "Informe omId ou omCode, não ambos",
    path: ["omId"],
  });

export const updateEstimateStatusSchema = z.object({
  status: estimateStatusEnum,
});

export const listEstimatesQuerySchema = z.object({
  code: z.coerce.number().int().positive().optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  ataCode: z.coerce.number().int().positive().optional(),
  omCode: z.coerce.number().int().positive().optional(),
  status: estimateStatusEnum.optional(),
  cityName: z.string().trim().optional(),
  stateUf: ufEnum.optional(),
  search: z.string().trim().optional(),
  includeArchived: z.coerce.boolean().optional(),
  onlyArchived: z.coerce.boolean().optional(),
});

export const archivedEstimateQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
});

export const estimateIdParamSchema = z.object({
  id: z.string().min(1, "Id da estimativa é obrigatório"),
});

export const estimateCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código da estimativa inválido"),
});
