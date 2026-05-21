import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { optionalBoolean, optionalString } from "../../shared/zod-helpers.js";

export const createUserByAdminSchema = z.object({
  name: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres"),
  email: z.email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["PROJETISTA", "GESTOR", "CONSULTA"]),
  rank: optionalString,
  cpf: optionalString,
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"]),
  rank: optionalString,
  cpf: optionalString,
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres").optional(),
    email: z.email("E-mail invalido").optional(),
    rank: optionalString,
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

export const userIdParamSchema = z.object({
  id: z.string().min(1, "Id do usuário é obrigatório"),
});
