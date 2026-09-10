import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { optionalBoolean, optionalString } from "../../shared/zod-helpers.js";

const ufEnum = z.enum(["AM", "RO", "RR", "AC"]);

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

export const listMilitaryOrganizationsQuerySchema = paginationQuerySchema.extend({
  code: z.coerce.number().int().positive().optional(),
  sigla: optionalString,
  cityName: optionalString,
  stateUf: ufEnum.optional(),
  active: optionalBoolean,
  search: optionalString,
  archived: z.enum(["active", "archived", "all"]).default("active"),
});

export const bulkMilitaryOrganizationsActionSchema = z.object({
  action: z.enum(["INACTIVATE", "ARCHIVE", "DELETE"]),
  ids: z.array(z.string().min(1)).min(1).max(500).optional(),
  allMatching: z.boolean().default(false),
  filters: listMilitaryOrganizationsQuerySchema.pick({ stateUf: true, cityName: true, active: true, search: true, archived: true }).optional(),
}).refine((data) => data.allMatching || Boolean(data.ids?.length), { message: "Selecione ao menos uma OM" });

export const militaryOrganizationIdParamSchema = z.object({
  id: z.string().min(1, "Id da OM é obrigatório"),
});

export const militaryOrganizationCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código da OM inválido"),
});

export const militaryOrganizationsCsvRequestSchema = z.object({
  content: z.string().min(1, "Conteúdo CSV obrigatório").max(1_500_000, "Arquivo CSV muito grande"),
  mode: z.enum(["CREATE_ONLY", "UPSERT"]).default("CREATE_ONLY"),
});
