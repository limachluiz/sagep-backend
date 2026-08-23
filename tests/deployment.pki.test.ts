import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const configuration = {
    id: "default",
    deploymentHostName: null as string | null,
    deploymentExpectedIp: null as string | null,
    deploymentGateway: null as string | null,
    deploymentDnsServers: [] as string[],
    deploymentNtpServers: [] as string[],
    deploymentAllowedNetworks: [] as string[],
    deploymentProxyUrl: null as string | null,
    deploymentCertificateMode: "INTERNAL_CA",
    updatedAt: new Date(),
  };
  return {
    configuration,
    upsert: vi.fn(async () => configuration),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(configuration, data, { updatedAt: new Date() })),
    auditCreate: vi.fn(async ({ data }: { data: unknown }) => data),
  };
});

vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    systemConfiguration: { upsert: mocks.upsert, update: mocks.update },
    auditLog: { create: mocks.auditCreate },
  },
}));

import { env } from "../src/config/env.js";
import { DeploymentService } from "../src/modules/deployment/deployment.service.js";

let temporaryDirectory: string;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "sagep-pki-test-"));
  env.DEPLOYMENT_PKI_DIRECTORY = path.join(temporaryDirectory, "pki");
  env.DEPLOYMENT_TLS_DIRECTORY = path.join(temporaryDirectory, "tls");
});

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("PKI interna da OM", () => {
  const actor = { id: "admin-1", name: "Administrador", email: "admin@sagep.local", role: "ADMIN", permissions: ["settings.manage"] };

  it("emite certificado DNS e exporta somente material público nos kits", async () => {
    const service = new DeploymentService();
    const status = await service.initializeInternalCertificate({ hostName: "sagep.4cta.eb.mil.br", rotate: false }, actor);

    expect(status).toMatchObject({ configured: true, toolAvailable: true, status: "VALID" });
    expect(status.rootFingerprintSha256).toMatch(/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);

    for (const platform of ["windows", "linux"] as const) {
      const kit = await service.trustKit(platform, actor);
      const zip = await JSZip.loadAsync(kit.buffer);
      expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
        "sagep-om-root-ca.crt",
        "IMPRESSAO-DIGITAL-SHA256.txt",
        "LEIA-ME.txt",
      ]));
      expect(Object.keys(zip.files).some((name) => name.endsWith(".key"))).toBe(false);
    }
  }, 30_000);

  it("renova somente o certificado do servidor e preserva a autoridade da OM", async () => {
    const service = new DeploymentService();
    const before = await service.initializeInternalCertificate({ hostName: "sagep.4cta.eb.mil.br", rotate: true }, actor);
    const renewed = await service.renewServerCertificate(actor);

    expect(renewed).toMatchObject({ configured: true, status: "VALID", proxyRestartRequired: true });
    expect(renewed.rootFingerprintSha256).toBe(before.rootFingerprintSha256);
    expect(renewed.fingerprintSha256).not.toBe(before.fingerprintSha256);
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        summary: "Certificado HTTPS do servidor renovado sem rotação da autoridade",
        metadata: expect.objectContaining({ rootRotated: false }),
      }),
    }));
  }, 30_000);
});
