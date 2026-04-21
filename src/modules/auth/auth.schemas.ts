import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(3, "Nome inválido"),
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token é obrigatório"),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token é obrigatório"),
});