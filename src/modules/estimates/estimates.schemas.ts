import { z } from "zod";

const estimateStatusEnum = z.enum(["RASCUNHO", "FINALIZADA", "CANCELADA"]);
const ufEnum = z.enum(["AM", "RO", "RR", "AC"]);

const optionalString = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}, z.string().trim().optional());

const optionalPositiveNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.number().positive().optional());

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
  omName: optionalString,
  destinationCityName: z.string().trim().min(2, "Cidade de destino inválida"),
  destinationStateUf: ufEnum,
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
  });

export const updateEstimateSchema = z.object({
  omName: optionalString,
  destinationCityName: z.string().trim().min(2).optional(),
  destinationStateUf: ufEnum.optional(),
  notes: optionalString,
  status: estimateStatusEnum.optional(),
  items: z.array(estimateLineInputSchema).min(1, "Informe ao menos um item").optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe pelo menos um campo para atualizar",
});

export const updateEstimateStatusSchema = z.object({
  status: estimateStatusEnum,
});

export const listEstimatesQuerySchema = z.object({
  code: z.coerce.number().int().positive().optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  ataCode: z.coerce.number().int().positive().optional(),
  status: estimateStatusEnum.optional(),
  cityName: z.string().trim().optional(),
  stateUf: ufEnum.optional(),
  search: z.string().trim().optional(),
});

export const estimateIdParamSchema = z.object({
  id: z.string().min(1, "Id da estimativa é obrigatório"),
});

export const estimateCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código da estimativa inválido"),
});