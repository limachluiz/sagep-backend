import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  scrypt,
  timingSafeEqual,
  X509Certificate,
} from "node:crypto";
import { AppError } from "../../shared/app-error.js";

const MAGIC = Buffer.from("SAGEP-PKI1", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
export const MAX_PKI_BACKUP_BYTES = 1024 * 1024;

export type AuthorityBackupPayload = {
  format: "SAGEP_PKI_BACKUP";
  version: 1;
  createdAt: string;
  organizationName: string;
  organizationAcronym: string;
  hostName: string;
  rootCertificatePem: string;
  rootPrivateKeyPem: string;
  rootFingerprintSha256: string;
};

function deriveKey(passphrase: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(passphrase, salt, KEY_BYTES, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key));
    });
  });
}

function invalidBackup(): never {
  throw new AppError("Arquivo de autoridade inválido ou senha incorreta", 422, "INVALID_AUTHORITY_BACKUP");
}

export function authorityFingerprint(certificate: X509Certificate) {
  return certificate.fingerprint256.replaceAll(":", "").toUpperCase();
}

export async function encryptAuthorityBackup(payload: AuthorityBackupPayload, passphrase: string) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(MAGIC);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}

export async function decryptAuthorityBackup(archive: Buffer, passphrase: string): Promise<AuthorityBackupPayload> {
  if (archive.length > MAX_PKI_BACKUP_BYTES || archive.length <= MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES) {
    invalidBackup();
  }
  const magic = archive.subarray(0, MAGIC.length);
  if (magic.length !== MAGIC.length || !timingSafeEqual(magic, MAGIC)) invalidBackup();
  const saltOffset = MAGIC.length;
  const ivOffset = saltOffset + SALT_BYTES;
  const tagOffset = ivOffset + IV_BYTES;
  const cipherOffset = tagOffset + TAG_BYTES;
  const key = await deriveKey(passphrase, archive.subarray(saltOffset, ivOffset));
  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, archive.subarray(ivOffset, tagOffset));
    decipher.setAAD(MAGIC);
    decipher.setAuthTag(archive.subarray(tagOffset, cipherOffset));
    plaintext = Buffer.concat([decipher.update(archive.subarray(cipherOffset)), decipher.final()]);
    const parsed = JSON.parse(plaintext.toString("utf8")) as Partial<AuthorityBackupPayload>;
    if (
      parsed.format !== "SAGEP_PKI_BACKUP" || parsed.version !== 1 ||
      typeof parsed.createdAt !== "string" || typeof parsed.organizationName !== "string" ||
      typeof parsed.organizationAcronym !== "string" || typeof parsed.hostName !== "string" ||
      typeof parsed.rootCertificatePem !== "string" || typeof parsed.rootPrivateKeyPem !== "string" ||
      typeof parsed.rootFingerprintSha256 !== "string"
    ) invalidBackup();
    return parsed as AuthorityBackupPayload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    invalidBackup();
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
  return invalidBackup();
}

export function validateAuthorityMaterial(payload: AuthorityBackupPayload, expectedOrganizationAcronym?: string) {
  try {
    if (expectedOrganizationAcronym && payload.organizationAcronym.trim().toUpperCase() !== expectedOrganizationAcronym.trim().toUpperCase()) {
      throw new AppError("O arquivo pertence a outra organização militar", 409, "AUTHORITY_ORGANIZATION_MISMATCH", {
        archiveOrganizationAcronym: payload.organizationAcronym,
      });
    }
    const certificate = new X509Certificate(payload.rootCertificatePem);
    if (!certificate.ca || !certificate.verify(certificate.publicKey)) invalidBackup();
    if (certificate.publicKey.asymmetricKeyType !== "rsa") invalidBackup();
    const keyDetails = certificate.publicKey.asymmetricKeyDetails;
    if (!keyDetails?.modulusLength || keyDetails.modulusLength < 4096) invalidBackup();
    const privateKey = createPrivateKey(payload.rootPrivateKeyPem);
    const certificatePublicKey = certificate.publicKey.export({ type: "spki", format: "der" });
    const privatePublicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" });
    if (!timingSafeEqual(Buffer.from(certificatePublicKey), Buffer.from(privatePublicKey))) invalidBackup();
    const fingerprint = authorityFingerprint(certificate);
    if (fingerprint !== payload.rootFingerprintSha256.toUpperCase()) invalidBackup();
    const daysRemaining = Math.floor((new Date(certificate.validTo).getTime() - Date.now()) / 86_400_000);
    if (daysRemaining <= 430) {
      throw new AppError("A autoridade do arquivo está próxima do vencimento", 409, "CERTIFICATE_AUTHORITY_EXPIRING", { rootDaysRemaining: daysRemaining });
    }
    return { certificate, fingerprint, daysRemaining };
  } catch (error) {
    if (error instanceof AppError) throw error;
    invalidBackup();
  }
}

export function authorityArchiveChecksum(archive: Buffer) {
  return createHash("sha256").update(archive).digest("hex");
}
