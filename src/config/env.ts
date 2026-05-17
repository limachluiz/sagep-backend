import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(1).optional(),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1),
  PDF_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  PDF_RENDER_MODE: z.enum(["mock", "real"]).optional(),
  COMPRAS_GOV_DEBUG: z.coerce.boolean().optional(),
  PORTAL_TRANSPARENCIA_API_TOKEN: z.string().optional(),
})
  .transform((env) => ({
    ...env,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET ?? env.JWT_SECRET ?? "",
  }))
  .refine((env) => Boolean(env.JWT_ACCESS_SECRET), {
    message: "JWT_SECRET ou JWT_ACCESS_SECRET precisa ser informado",
    path: ["JWT_ACCESS_SECRET"],
  });

export const env = envSchema.parse(process.env);
