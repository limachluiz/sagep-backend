import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { optionalBoolean, optionalString } from "../../shared/zod-helpers.js";

const ataTypeEnum = z.enum(["CFTV", "FIBRA_OPTICA"]);

export const listPregoesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  year: z.string().trim().regex(/^\d{4}$/).optional(),
  uasg: z.string().trim().optional(),
  type: ataTypeEnum.optional(),
  active: optionalBoolean,
});

export const pregaoIdParamSchema = z.object({
  id: z.string().min(1, "Id do pregão é obrigatório"),
});

export const updatePregaoSchema = z.object({
  modality: z.string().trim().min(2).optional(),
  object: optionalString,
  type: ataTypeEnum.nullable().optional(),
  managingAgency: optionalString,
  isActive: optionalBoolean,
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe pelo menos um campo para atualizar",
});
