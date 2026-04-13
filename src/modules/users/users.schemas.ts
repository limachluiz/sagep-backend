import { z } from "zod";

export const createUserByAdminSchema = z.object({
  name: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres"),
  email: z.email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["PROJETISTA", "GESTOR", "CONSULTA"]),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"]),
});

export const userIdParamSchema = z.object({
  id: z.string().min(1, "Id do usuário é obrigatório"),
});