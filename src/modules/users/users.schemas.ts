import { z } from "zod";
import { optionalString } from "../../shared/zod-helpers.js";

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

export const userIdParamSchema = z.object({
  id: z.string().min(1, "Id do usuário é obrigatório"),
});