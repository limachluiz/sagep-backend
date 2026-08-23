export type CertificateLifecycleStatus = "NOT_CONFIGURED" | "VALID" | "EXPIRING" | "EXPIRED" | "INVALID";

export type CertificateRenewalAlert = {
  thresholdDays: 60 | 30 | 15 | 7 | 0;
  severity: "INFO" | "WARNING" | "CRITICAL";
  label: string;
};

export function getCertificateRenewalAlert(status: CertificateLifecycleStatus, daysRemaining?: number): CertificateRenewalAlert | null {
  if (status === "NOT_CONFIGURED" || status === "INVALID" || daysRemaining == null) return null;
  if (status === "EXPIRED" || daysRemaining < 0) return { thresholdDays: 0, severity: "CRITICAL", label: "Certificado vencido" };
  if (daysRemaining <= 7) return { thresholdDays: 7, severity: "CRITICAL", label: "Vence em até 7 dias" };
  if (daysRemaining <= 15) return { thresholdDays: 15, severity: "WARNING", label: "Vence em até 15 dias" };
  if (daysRemaining <= 30) return { thresholdDays: 30, severity: "WARNING", label: "Vence em até 30 dias" };
  if (daysRemaining <= 60) return { thresholdDays: 60, severity: "INFO", label: "Vence em até 60 dias" };
  return null;
}
