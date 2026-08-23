import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  renew: vi.fn(),
}));

vi.mock("../src/modules/deployment/deployment.service.js", () => ({
  getDeploymentCertificateStatus: mocks.status,
  deploymentService: { renewServerCertificate: mocks.renew },
}));

import { env } from "../src/config/env.js";
import { getCertificateRenewalAutomationStatus, resetCertificateRenewalState } from "../src/modules/deployment/certificate-renewal-state.js";
import { runCertificateRenewalCheck, startCertificateRenewalScheduler } from "../src/modules/deployment/certificate-renewal.scheduler.js";

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  resetCertificateRenewalState();
  env.CERTIFICATE_AUTO_RENEW_ENABLED = true;
  env.CERTIFICATE_AUTO_RENEW_DAYS = 30;
  env.CERTIFICATE_RENEWAL_CHECK_HOURS = 24;
  mocks.renew.mockResolvedValue({ configured: true, daysRemaining: 396 });
});

describe("renovação automática do certificado", () => {
  it("não renova antes da janela configurada", async () => {
    mocks.status.mockResolvedValue({ configured: true, daysRemaining: 31 });
    await expect(runCertificateRenewalCheck("INTERVAL")).resolves.toEqual({ result: "NOT_DUE", daysRemaining: 31 });
    expect(mocks.renew).not.toHaveBeenCalled();
    expect(getCertificateRenewalAutomationStatus()).toMatchObject({ lastResult: "NOT_DUE", lastCheckedAt: expect.any(String) });
  });

  it("renova na janela sem solicitar rotação da autoridade", async () => {
    mocks.status.mockResolvedValue({ configured: true, daysRemaining: 30 });
    await expect(runCertificateRenewalCheck("INTERVAL")).resolves.toMatchObject({ result: "RENEWED" });
    expect(mocks.renew).toHaveBeenCalledWith(null, "AUTOMATIC");
    expect(getCertificateRenewalAutomationStatus()).toMatchObject({
      lastResult: "RENEWED",
      lastAttemptAt: expect.any(String),
      lastRenewedAt: expect.any(String),
    });
  });

  it("verifica o certificado ao iniciar o backend", async () => {
    mocks.status.mockResolvedValue({ configured: false });
    const scheduler = startCertificateRenewalScheduler();
    await vi.waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1));
    expect(getCertificateRenewalAutomationStatus().lastResult).toBe("NOT_CONFIGURED");
    scheduler?.stop();
  });
});
