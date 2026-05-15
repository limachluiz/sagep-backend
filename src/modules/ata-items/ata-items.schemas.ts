import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { optionalBoolean, optionalString } from "../../shared/zod-helpers.js";

const ufEnum = z.enum(["AM", "RO", "RR", "AC"]);

const optionalPositiveNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.coerce.number().positive().optional());

export const createAtaItemSchema = z.object({
  coverageGroupCode: z.string().trim().min(2, "Código do grupo inválido"),
  referenceCode: z.string().trim().min(1, "Referência do item é obrigatória"),
  description: z.string().trim().min(3, "Descrição deve ter pelo menos 3 caracteres"),
  unit: z.string().trim().min(1, "Unidade é obrigatória"),
  unitPrice: z.coerce.number().positive("Valor unitário deve ser maior que zero"),
  initialQuantity: z.coerce.number().positive("Saldo inicial deve ser maior que zero"),
  notes: optionalString,
});

export const updateAtaItemSchema = z
  .object({
    coverageGroupCode: z.string().trim().min(2, "Código do grupo inválido").optional(),
    referenceCode: z.string().trim().min(1, "Referência do item é obrigatória").optional(),
    description: z.string().trim().min(3, "Descrição deve ter pelo menos 3 caracteres").optional(),
    unit: z.string().trim().min(1, "Unidade é obrigatória").optional(),
    unitPrice: optionalPositiveNumber,
    initialQuantity: optionalPositiveNumber,
    notes: optionalString,
    isActive: optionalBoolean,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe pelo menos um campo para atualizar",
  });

export const registerExternalConsumptionSchema = z.object({
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero"),
  reason: z.string().trim().min(3, "Justificativa e obrigatoria"),
  source: z.string().trim().min(1, "Fonte e obrigatoria"),
  externalStatus: z.string().trim().min(1, "Status externo e obrigatorio"),
  externalReference: z.string().trim().min(1, "Referencia externa e obrigatoria"),
  commitmentNumber: optionalString,
  unit: optionalString,
  notes: optionalString,
});

export const listAtaItemsQuerySchema = paginationQuerySchema.extend({
  code: z.coerce.number().int().positive().optional(),
  ataCode: z.coerce.number().int().positive().optional(),
  groupCode: z.string().trim().optional(),
  cityName: z.string().trim().optional(),
  stateUf: ufEnum.optional(),
  active: optionalBoolean,
  search: z.string().trim().optional(),
});

export const ataIdParamSchema = z.object({
  id: z.string().min(1, "Id da ata é obrigatório"),
});

export const ataItemIdParamSchema = z.object({
  id: z.string().min(1, "Id do item da ata é obrigatório"),
});

export const ataItemCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código do item da ata inválido"),
});
