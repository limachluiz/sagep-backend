import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

const VERSION = "v1";
const AAD = Buffer.from("sagep:portal-transparencia-api-token:v1", "utf8");

function encryptionKey() {
  if (env.SAGEP_SECRETS_ENCRYPTION_KEY) {
    return Buffer.from(env.SAGEP_SECRETS_ENCRYPTION_KEY, "hex");
  }
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(env.JWT_REFRESH_SECRET, "utf8"),
    Buffer.from("sagep-secrets-fallback-v1", "utf8"),
    AAD,
    32,
  ));
}

export function secretEncryptionSource() {
  return env.SAGEP_SECRETS_ENCRYPTION_KEY ? "DEDICATED" as const : "DERIVED" as const;
}

export function encryptPortalApiToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptPortalApiToken(envelope: string) {
  try {
    const [version, ivValue, tagValue, encryptedValue, extra] = envelope.split(":");
    if (version !== VERSION || !ivValue || !tagValue || !encryptedValue || extra) throw new Error("Envelope inválido");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      "O token protegido não pôde ser descriptografado; substitua-o nas configurações",
      503,
      "PORTAL_TRANSPARENCIA_TOKEN_DECRYPTION_FAILED",
    );
  }
}
