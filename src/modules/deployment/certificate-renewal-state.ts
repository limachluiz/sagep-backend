import { env } from "../../config/env.js";

export type CertificateRenewalResult = "NEVER_RUN" | "NOT_CONFIGURED" | "NOT_DUE" | "RENEWED" | "FAILED";

type MutableRenewalState = {
  lastCheckedAt: string | null;
  lastAttemptAt: string | null;
  lastRenewedAt: string | null;
  lastResult: CertificateRenewalResult;
  lastErrorCode: string | null;
};

const state: MutableRenewalState = {
  lastCheckedAt: null,
  lastAttemptAt: null,
  lastRenewedAt: null,
  lastResult: "NEVER_RUN",
  lastErrorCode: null,
};

export function getCertificateRenewalAutomationStatus() {
  return {
    enabled: env.CERTIFICATE_AUTO_RENEW_ENABLED,
    renewBeforeDays: env.CERTIFICATE_AUTO_RENEW_DAYS,
    checkIntervalHours: env.CERTIFICATE_RENEWAL_CHECK_HOURS,
    proxyReloadMode: env.CERTIFICATE_PROXY_AUTO_RELOAD ? "AUTOMATIC" as const : "MANUAL" as const,
    ...state,
  };
}

export function updateCertificateRenewalState(update: Partial<MutableRenewalState>) {
  Object.assign(state, update);
}

export function resetCertificateRenewalState() {
  Object.assign(state, {
    lastCheckedAt: null,
    lastAttemptAt: null,
    lastRenewedAt: null,
    lastResult: "NEVER_RUN",
    lastErrorCode: null,
  });
}
