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

const optionalDate = z.union([z.iso.datetime(), z.iso.date()]).nullable().optional();

export const createPregaoSchema = z.object({
  uasg: z.string().trim().min(3).max(20),
  number: z.string().trim().min(1).max(30),
  year: z.string().trim().regex(/^\d{4}$/),
  modality: z.string().trim().min(2).default("PREGÃO ELETRÔNICO"),
  object: optionalString,
  type: ataTypeEnum.nullable().optional(),
  managingAgency: optionalString,
  openingAt: optionalDate,
  homologatedAt: optionalDate,
  isActive: z.boolean().optional(),
});

export const updatePregaoSchema = z.object({
  uasg: z.string().trim().min(3).max(20).optional(),
  number: z.string().trim().min(1).max(30).optional(),
  year: z.string().trim().regex(/^\d{4}$/).optional(),
  modality: z.string().trim().min(2).optional(),
  object: z.string().trim().nullable().optional(),
  type: ataTypeEnum.nullable().optional(),
  managingAgency: z.string().trim().nullable().optional(),
  openingAt: optionalDate,
  homologatedAt: optionalDate,
  isActive: optionalBoolean,
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe pelo menos um campo para atualizar",
});
