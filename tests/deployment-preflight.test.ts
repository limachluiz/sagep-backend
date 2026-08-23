import { describe, expect, it } from "vitest";
import { evaluateDeploymentPreflight, type DeploymentPreflightInput } from "../src/modules/deployment/deployment-preflight.js";

function readyInput(overrides: Partial<DeploymentPreflightInput> = {}): DeploymentPreflightInput {
  return {
    nodeMajorVersion: 22,
    nodeEnvironment: "production",
    cookieSecure: true,
    trustProxyHops: 1,
    corsOrigins: ["https://sagep.4cta.eb.mil.br"],
    publicRegistrationAllowed: false,
    setupTokenConfigured: false,
    userCount: 1,
    hostName: "sagep.4cta.eb.mil.br",
    environmentHostName: "sagep.4cta.eb.mil.br",
    bindIp: "10.78.10.20",
    expectedIp: "10.78.10.20",
    expectedIpMatches: true,
    dnsMatchesExpectedIp: true,
    dnsError: null,
    allowedNetworks: ["10.78.0.0/16"],
    opensslAvailable: true,
    certificateStatus: "VALID",
    directories: [
      { id: "backups", label: "Backups", path: "/app/backups", exists: true, writable: true },
      { id: "pki", label: "PKI", path: "/app/pki", exists: true, writable: true },
      { id: "tls", label: "TLS", path: "/app/tls", exists: true, writable: true },
    ],
    ...overrides,
  };
}

describe("pré-validação da implantação", () => {
  it("considera pronta uma instalação de produção coerente", () => {
    const result = evaluateDeploymentPreflight(readyInput());
    expect(result.status).toBe("READY");
    expect(result.counts).toEqual({ pass: result.checks.length, warn: 0, fail: 0 });
  });

  it("bloqueia produção sem HTTPS, DNS coerente e volumes graváveis", () => {
    const result = evaluateDeploymentPreflight(readyInput({
      cookieSecure: false,
      dnsMatchesExpectedIp: false,
      certificateStatus: "NOT_CONFIGURED",
      directories: [{ id: "pki", label: "PKI", path: "/app/pki", exists: true, writable: false }],
    }));
    expect(result.status).toBe("BLOCKED");
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "security.cookie", status: "FAIL" }),
      expect.objectContaining({ id: "network.dns", status: "FAIL" }),
      expect.objectContaining({ id: "certificate.status", status: "FAIL" }),
      expect.objectContaining({ id: "storage.pki", status: "FAIL" }),
    ]));
  });

  it("alerta quando a chave temporária permanece após criar o administrador", () => {
    const result = evaluateDeploymentPreflight(readyInput({ setupTokenConfigured: true }));
    expect(result.status).toBe("ATTENTION");
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "security.setup-token", status: "WARN" }));
  });
});
