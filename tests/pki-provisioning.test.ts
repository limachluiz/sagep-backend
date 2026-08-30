import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { provisionInitialInternalCertificate, ROOT_CERT } from "../src/modules/deployment/pki-provisioning.js";

const temporaryDirectories: string[] = [];

async function directories() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sagep-install-pki-"));
  temporaryDirectories.push(root);
  return { pki: path.join(root, "pki"), tls: path.join(root, "tls") };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("provisionamento HTTPS inicial", () => {
  it("cria uma autoridade exclusiva e reutiliza o mesmo material", async () => {
    const target = await directories();
    const created = await provisionInitialInternalCertificate("sagep.4cta.eb.mil.br", target.pki, target.tls);
    const existing = await provisionInitialInternalCertificate("sagep.4cta.eb.mil.br", target.pki, target.tls);

    expect(created.created).toBe(true);
    expect(existing.created).toBe(false);
    expect(existing.rootFingerprintSha256).toBe(created.rootFingerprintSha256);
    expect((await fs.stat(path.join(target.pki, "sagep-om-root-ca.key"))).mode & 0o777).toBe(0o600);
  }, 30_000);

  it("bloqueia material parcial sem sobrescrever a autoridade", async () => {
    const target = await directories();
    await fs.mkdir(target.pki, { recursive: true });
    await fs.writeFile(path.join(target.pki, ROOT_CERT), "incompleto");

    await expect(provisionInitialInternalCertificate("sagep.4cta.eb.mil.br", target.pki, target.tls))
      .rejects.toMatchObject({ code: "CERTIFICATE_MATERIAL_PARTIAL", statusCode: 409 });
  });

  it("bloqueia reutilização do certificado para outro nome DNS", async () => {
    const target = await directories();
    await provisionInitialInternalCertificate("sagep.4cta.eb.mil.br", target.pki, target.tls);

    await expect(provisionInitialInternalCertificate("sagep.outraom.eb.mil.br", target.pki, target.tls))
      .rejects.toMatchObject({ code: "CERTIFICATE_MATERIAL_MISMATCH", statusCode: 409 });
  }, 30_000);
});
