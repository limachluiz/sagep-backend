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

export const sessionStatusSchema = z.enum(["ACTIVE", "REVOKED", "EXPIRED", "ALL"]);

export const listSessionsQuerySchema = z.object({
  status: sessionStatusSchema.default("ACTIVE"),
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1, "Id da sessão é obrigatório"),
});

export const authUserIdParamSchema = z.object({
  userId: z.string().min(1, "Id do usuário é obrigatório"),
});

export const cleanupSessionsSchema = z.object({
  refreshTokenRetentionDays: z.coerce
    .number()
    .int("Retenção de refresh tokens deve ser inteira")
    .min(1, "Retenção de refresh tokens deve ser positiva")
    .max(3650, "Retenção de refresh tokens muito alta")
    .default(90),
  auditRetentionDays: z.coerce
    .number()
    .int("Retenção de auditoria deve ser inteira")
    .min(1, "Retenção de auditoria deve ser positiva")
    .max(3650, "Retenção de auditoria muito alta")
    .default(180),
});
