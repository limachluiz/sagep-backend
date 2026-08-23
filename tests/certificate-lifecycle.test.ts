import { describe, expect, it } from "vitest";
import { getCertificateRenewalAlert } from "../src/modules/deployment/certificate-lifecycle.js";

describe("ciclo de validade do certificado HTTPS", () => {
  it.each([
    [61, null],
    [60, { thresholdDays: 60, severity: "INFO" }],
    [30, { thresholdDays: 30, severity: "WARNING" }],
    [15, { thresholdDays: 15, severity: "WARNING" }],
    [7, { thresholdDays: 7, severity: "CRITICAL" }],
    [-1, { thresholdDays: 0, severity: "CRITICAL" }],
  ])("classifica %i dias restantes", (daysRemaining, expected) => {
    const status = daysRemaining < 0 ? "EXPIRED" : daysRemaining <= 30 ? "EXPIRING" : "VALID";
    const alert = getCertificateRenewalAlert(status, daysRemaining);
    if (!expected) expect(alert).toBeNull();
    else expect(alert).toMatchObject(expected);
  });

  it("não alerta instalação sem certificado", () => {
    expect(getCertificateRenewalAlert("NOT_CONFIGURED")).toBeNull();
  });
});
