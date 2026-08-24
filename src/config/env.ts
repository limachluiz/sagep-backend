import "dotenv/config";
import { z } from "zod";
import { isCanonicalPrivateIpv4Cidr, normalizePrivateIpv4Cidrs } from "../shared/network.js";

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
  AUTH_REFRESH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default("sagep_refresh"),
  AUTH_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).default(600),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  SENSITIVE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  STEP_UP_EXPIRES_IN_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  PDF_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  PDF_RENDER_MODE: z.enum(["mock", "real"]).optional(),
  COMPRAS_GOV_DEBUG: z.coerce.boolean().optional(),
  PORTAL_TRANSPARENCIA_API_TOKEN: z.string().optional(),
  SAGEP_SECRETS_ENCRYPTION_KEY: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().regex(/^[0-9a-fA-F]{64}$/, "SAGEP_SECRETS_ENCRYPTION_KEY deve possuir 64 caracteres hexadecimais").optional(),
  ),
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
  BACKUP_DIRECTORY: z.string().min(1).default("./backups"),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  BACKUP_MAX_FILES: z.coerce.number().int().min(1).max(1000).default(30),
  BACKUP_SCHEDULE_HOURS: z.coerce.number().min(0).max(8760).default(24),
  BACKUP_RUN_ON_STARTUP: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  BACKUP_MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(4096).default(512),
  DEPLOYMENT_PKI_DIRECTORY: z.string().min(1).default("./pki"),
  DEPLOYMENT_TLS_DIRECTORY: z.string().min(1).default("./tls"),
  CERTIFICATE_AUTO_RENEW_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  CERTIFICATE_AUTO_RENEW_DAYS: z.coerce.number().int().min(15).max(60).default(30),
  CERTIFICATE_RENEWAL_CHECK_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  CERTIFICATE_PROXY_AUTO_RELOAD: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SAGEP_HOSTNAME: z.string().trim().toLowerCase().optional(),
  SAGEP_BIND_IP: z.string().trim().optional(),
  SAGEP_ALLOWED_NETWORKS: z.string().default(""),
  SAGEP_SETUP_TOKEN: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(32).max(256).optional(),
  ),
})
  .transform((env) => ({
    ...env,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET ?? env.JWT_SECRET ?? "",
    CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    SAGEP_ALLOWED_NETWORKS: normalizePrivateIpv4Cidrs(env.SAGEP_ALLOWED_NETWORKS.split(",")),
  }))
  .refine((env) => Boolean(env.JWT_ACCESS_SECRET), {
    message: "JWT_SECRET ou JWT_ACCESS_SECRET precisa ser informado",
    path: ["JWT_ACCESS_SECRET"],
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message: "Os segredos JWT de acesso e renovação devem ser diferentes",
    path: ["JWT_REFRESH_SECRET"],
  })
  .refine((env) => env.SAGEP_ALLOWED_NETWORKS.every(isCanonicalPrivateIpv4Cidr), {
    message: "SAGEP_ALLOWED_NETWORKS aceita somente redes IPv4 privadas em CIDR canônico",
    path: ["SAGEP_ALLOWED_NETWORKS"],
  })
  .refine((env) => env.SAGEP_ALLOWED_NETWORKS.length <= 12, {
    message: "SAGEP_ALLOWED_NETWORKS aceita no máximo 12 redes",
    path: ["SAGEP_ALLOWED_NETWORKS"],
  })
  .refine(
    (env) =>
      env.NODE_ENV !== "production" ||
      (env.JWT_ACCESS_SECRET.length >= 32 && env.JWT_REFRESH_SECRET.length >= 32),
    {
      message: "Em produção, os segredos JWT devem possuir pelo menos 32 caracteres",
      path: ["JWT_ACCESS_SECRET"],
    },
  );

export const env = envSchema.parse(process.env);
