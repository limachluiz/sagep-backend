import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/shared/app-error.js";
import {
  decryptAuthorityBackup,
  encryptAuthorityBackup,
  type AuthorityBackupPayload,
} from "../src/modules/deployment/pki-backup.js";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const payload: AuthorityBackupPayload = {
  format: "SAGEP_PKI_BACKUP",
  version: 1,
  createdAt: "2026-08-23T00:00:00.000Z",
  organizationName: "Organização de teste",
  organizationAcronym: "OM TESTE",
  hostName: "sagep.om.eb.mil.br",
  rootCertificatePem: "CERTIFICADO",
  rootPrivateKeyPem: privateKey,
  rootFingerprintSha256: "AA".repeat(32),
};

describe("arquivo criptografado da autoridade", () => {
  it("protege e recupera o conteúdo integral", async () => {
    const archive = await encryptAuthorityBackup(payload, "uma senha extensa e exclusiva para teste");
    expect(archive.toString("utf8")).not.toContain("PRIVATE KEY");
    await expect(decryptAuthorityBackup(archive, "uma senha extensa e exclusiva para teste")).resolves.toEqual(payload);
  });

  it("não diferencia senha incorreta de arquivo adulterado", async () => {
    const archive = await encryptAuthorityBackup(payload, "uma senha extensa e exclusiva para teste");
    const tampered = Buffer.from(archive);
    tampered[tampered.length - 1] ^= 1;

    for (const attempt of [
      () => decryptAuthorityBackup(archive, "senha incorreta com mais de vinte caracteres"),
      () => decryptAuthorityBackup(tampered, "uma senha extensa e exclusiva para teste"),
    ]) {
      await expect(attempt()).rejects.toMatchObject<AppError>({ statusCode: 422, code: "INVALID_AUTHORITY_BACKUP" });
    }
  });
});
