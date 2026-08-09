import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { optionalBoolean, optionalString } from "../../shared/zod-helpers.js";
import { MILITARY_RANKS } from "../../shared/military-ranks.js";

const optionalMilitaryRank = z.enum(MILITARY_RANKS).optional();

export const createUserByAdminSchema = z.object({
  name: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres"),
  warName: optionalString,
  email: z.email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["PROJETISTA", "GESTOR", "CONSULTA"]),
  rank: optionalMilitaryRank,
  cpf: optionalString,
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"]),
  rank: optionalMilitaryRank,
  cpf: optionalString,
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres").optional(),
    warName: z.string().trim().max(80).nullable().optional(),
    email: z.email("E-mail invalido").optional(),
    rank: z.enum(MILITARY_RANKS).nullable().optional(),
    cpf: optionalString,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe pelo menos um campo para atualizar",
  });

export const updateUserStatusSchema = z
  .object({
    active: optionalBoolean,
  })
  .refine((data) => data.active !== undefined, {
    message: "Informe active para atualizar o status",
    path: ["active"],
  });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"]).optional(),
  active: z.coerce.boolean().optional(),
  search: optionalString,
});

export const listUserOptionsQuerySchema = z
  .object({
    projectId: z.string().min(1).optional(),
    projectCode: z.coerce.number().int().positive().optional(),
  })
  .refine((data) => !(data.projectId && data.projectCode), {
    message: "Informe projectId ou projectCode, não ambos",
    path: ["projectId"],
  });

export const userIdParamSchema = z.object({
  id: z.string().min(1, "Id do usuário é obrigatório"),
});
