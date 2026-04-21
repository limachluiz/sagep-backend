import { z } from "zod";
import { optionalBoolean } from "../../shared/zod-helpers.js";

const ufEnum = z.enum(["AM", "RO", "RR", "AC"]);

const optionalString = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}, z.string().trim().optional());

export const createMilitaryOrganizationSchema = z.object({
  sigla: z.string().trim().min(2, "Sigla inválida"),
  name: z.string().trim().min(3, "Nome inválido"),
  cityName: z.string().trim().min(2, "Cidade inválida"),
  stateUf: ufEnum,
});

export const updateMilitaryOrganizationSchema = z.object({
  sigla: z.string().trim().min(2).optional(),
  name: z.string().trim().min(3).optional(),
  cityName: z.string().trim().min(2).optional(),
  stateUf: ufEnum.optional(),
  isActive: optionalBoolean,
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe pelo menos um campo para atualizar",
});

export const listMilitaryOrganizationsQuerySchema = z.object({
  code: z.coerce.number().int().positive().optional(),
  sigla: optionalString,
  cityName: optionalString,
  stateUf: ufEnum.optional(),
  active: optionalBoolean,
  search: optionalString,
});

export const militaryOrganizationIdParamSchema = z.object({
  id: z.string().min(1, "Id da OM é obrigatório"),
});

export const militaryOrganizationCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código da OM inválido"),
});