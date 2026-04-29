import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { optionalBoolean, optionalDate, optionalString } from "../../shared/zod-helpers.js";

const ataTypeEnum = z.enum(["CFTV", "FIBRA_OPTICA"]);
const ufEnum = z.enum(["AM", "RO", "RR", "AC"]);

const localitySchema = z.object({
  cityName: z.string().trim().min(2, "Cidade inválida"),
  stateUf: ufEnum,
});

const coverageGroupSchema = z.object({
  code: z.string().trim().min(2, "Código do grupo inválido"),
  name: z.string().trim().min(2, "Nome do grupo inválido"),
  description: optionalString,
  localities: z.array(localitySchema).min(1, "Informe ao menos uma localidade"),
});

export const createAtaSchema = z
  .object({
    number: z.string().trim().min(3, "Número da ata deve ter pelo menos 3 caracteres"),
    type: ataTypeEnum,
    vendorName: z.string().trim().min(3, "Fornecedor deve ter pelo menos 3 caracteres"),
    managingAgency: optionalString,
    validFrom: optionalDate,
    validUntil: optionalDate,
    notes: optionalString,
    coverageGroups: z.array(coverageGroupSchema).min(1, "Informe ao menos um grupo de cobertura"),
  })
  .refine(
    (data) => {
      if (data.validFrom && data.validUntil) {
        return data.validUntil >= data.validFrom;
      }
      return true;
    },
    {
      message: "A vigência final não pode ser menor que a inicial",
      path: ["validUntil"],
    }
  );

export const updateAtaSchema = z
  .object({
    number: z.string().trim().min(3, "Número da ata deve ter pelo menos 3 caracteres").optional(),
    type: ataTypeEnum.optional(),
    vendorName: z.string().trim().min(3, "Fornecedor deve ter pelo menos 3 caracteres").optional(),
    managingAgency: optionalString,
    validFrom: optionalDate,
    validUntil: optionalDate,
    notes: optionalString,
    isActive: optionalBoolean,
    coverageGroups: z.array(coverageGroupSchema).min(1, "Informe ao menos um grupo de cobertura").optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe pelo menos um campo para atualizar",
  })
  .refine(
    (data) => {
      if (data.validFrom && data.validUntil) {
        return data.validUntil >= data.validFrom;
      }
      return true;
    },
    {
      message: "A vigência final não pode ser menor que a inicial",
      path: ["validUntil"],
    }
  );

export const listAtasQuerySchema = paginationQuerySchema.extend({
  code: z.coerce.number().int().positive().optional(),
  type: ataTypeEnum.optional(),
  groupCode: z.string().trim().optional(),
  cityName: z.string().trim().optional(),
  stateUf: ufEnum.optional(),
  active: optionalBoolean,
  search: z.string().trim().optional(),
});

export const ataIdParamSchema = z.object({
  id: z.string().min(1, "Id da ata é obrigatório"),
});

export const ataCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código da ata inválido"),
});
