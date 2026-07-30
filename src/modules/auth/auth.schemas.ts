import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { MILITARY_RANKS } from "../../shared/military-ranks.js";

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

const avatarDataUrlSchema = z
  .string()
  .max(360_000, "A imagem do avatar deve ter no máximo 256 KB")
  .regex(
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    "Use uma imagem PNG, JPEG ou WebP válida",
  )
  .refine(
    (value) => Buffer.byteLength(value.slice(value.indexOf(",") + 1), "base64") <= 256 * 1024,
    "A imagem do avatar deve ter no máximo 256 KB",
  );

export const updateOwnProfileSchema = z
  .object({
    name: z.string().trim().min(3, "Nome deve ter pelo menos 3 caracteres").max(120).optional(),
    warName: z.string().trim().max(80).nullable().optional(),
    rank: z.enum(MILITARY_RANKS).nullable().optional(),
    cpf: z
      .string()
      .trim()
      .regex(/^\d{11}$/, "CPF deve conter 11 dígitos")
      .nullable()
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\d{10,11}$/, "Telefone deve conter 10 ou 11 dígitos")
      .nullable()
      .optional(),
    avatarDataUrl: avatarDataUrlSchema.nullable().optional(),
    themePreference: z.enum(["LIGHT", "DARK", "SYSTEM"]).optional(),
    notifications: z
      .object({
        taskAssignments: z.boolean(),
        deadlines: z.boolean(),
        workflowUpdates: z.boolean(),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe pelo menos um campo para atualizar",
  });

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres").max(128),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "A nova senha deve ser diferente da senha atual",
    path: ["newPassword"],
  });

export const sessionStatusSchema = z.enum(["ACTIVE", "REVOKED", "EXPIRED", "ALL"]);

export const listSessionsQuerySchema = paginationQuerySchema.extend({
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
