import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";
import { deploymentService, getDeploymentCertificateStatus } from "./deployment.service.js";
import { updateCertificateRenewalState } from "./certificate-renewal-state.js";

export async function runCertificateRenewalCheck(trigger: "STARTUP" | "INTERVAL") {
  const checkedAt = new Date().toISOString();
  updateCertificateRenewalState({ lastCheckedAt: checkedAt, lastErrorCode: null });
  const certificate = await getDeploymentCertificateStatus();
  if (!certificate.configured || certificate.daysRemaining == null) {
    updateCertificateRenewalState({ lastResult: "NOT_CONFIGURED" });
    return { result: "NOT_CONFIGURED" as const };
  }
  if (certificate.daysRemaining > env.CERTIFICATE_AUTO_RENEW_DAYS) {
    updateCertificateRenewalState({ lastResult: "NOT_DUE" });
    return { result: "NOT_DUE" as const, daysRemaining: certificate.daysRemaining };
  }

  const attemptedAt = new Date().toISOString();
  updateCertificateRenewalState({ lastAttemptAt: attemptedAt });
  try {
    const renewed = await deploymentService.renewServerCertificate(null, "AUTOMATIC");
    updateCertificateRenewalState({ lastResult: "RENEWED", lastRenewedAt: new Date().toISOString() });
    console.info("Certificado HTTPS renovado automaticamente", { trigger, daysRemaining: certificate.daysRemaining });
    return { result: "RENEWED" as const, certificate: renewed };
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : "CERTIFICATE_AUTO_RENEWAL_FAILED";
    updateCertificateRenewalState({ lastResult: "FAILED", lastErrorCode: errorCode });
    throw error;
  }
}

export function startCertificateRenewalScheduler() {
  if (!env.CERTIFICATE_AUTO_RENEW_ENABLED) {
    console.info("Renovação automática de certificado desativada por configuração");
    return null;
  }
  let stopped = false;
  let running = false;
  const run = async (trigger: "STARTUP" | "INTERVAL") => {
    if (stopped || running) return;
    running = true;
    try {
      await runCertificateRenewalCheck(trigger);
    } catch (error) {
      console.error("Falha na verificação automática do certificado", {
        trigger,
        code: error instanceof AppError ? error.code : "CERTIFICATE_AUTO_RENEWAL_FAILED",
      });
    } finally {
      running = false;
    }
  };
  void run("STARTUP");
  const timer = setInterval(() => void run("INTERVAL"), env.CERTIFICATE_RENEWAL_CHECK_HOURS * 3_600_000);
  timer.unref();
  return { stop: () => { stopped = true; clearInterval(timer); } };
}
