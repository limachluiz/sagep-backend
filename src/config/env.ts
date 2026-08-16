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
  PORTAL_TRANSPARENCIA_BASE_URL: z.string().url().default("https://api.portaldatransparencia.gov.br/api-de-dados"),
  PORTAL_TRANSPARENCIA_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(15).default(1440),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  CORS_ALLOW_CREDENTIALS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ALLOW_PUBLIC_REGISTRATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  HEALTH_PGADMIN_URL: z.string().url().optional(),
  HEALTH_PROBE_TIMEOUT_MS: z.coerce.number().int().min(250).max(10000).default(2000),
  INTEGRATION_PROBE_TIMEOUT_MS: z.coerce.number().int().min(2000).max(60000).default(15000),
  COMPRAS_GOV_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5000).max(120000).default(30000),
  PNCP_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5000).max(120000).default(30000),
})
  .transform((env) => ({
    ...env,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET ?? env.JWT_SECRET ?? "",
    CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  }))
  .refine((env) => Boolean(env.JWT_ACCESS_SECRET), {
    message: "JWT_SECRET ou JWT_ACCESS_SECRET precisa ser informado",
    path: ["JWT_ACCESS_SECRET"],
  });

export const env = envSchema.parse(process.env);
