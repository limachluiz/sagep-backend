import { describe, expect, it } from "vitest";
import { exportAuthorityBackupSchema, initializeInternalCertificateSchema, restoreAuthorityBackupSchema, trustKitPlatformSchema, updateDeploymentSchema } from "../src/modules/deployment/deployment.schemas.js";

describe("configuração de implantação", () => {
  it("aceita o nome DNS interno completo da OM", () => {
    expect(initializeInternalCertificateSchema.parse({ hostName: "SAGEP.EXAMPLE.TEST" })).toEqual({
      hostName: "sagep.example.test",
      rotate: false,
    });
  });

  it("rejeita hostname incompleto e plataforma desconhecida", () => {
    expect(() => initializeInternalCertificateSchema.parse({ hostName: "sagep" })).toThrow();
    expect(() => trustKitPlatformSchema.parse({ platform: "macos" })).toThrow();
  });

  it("limita listas administrativas e normaliza o modo de certificado", () => {
    const parsed = updateDeploymentSchema.parse({
      hostName: "sagep.example.test",
      expectedIp: "192.168.50.20",
      gateway: "192.168.50.1",
      dnsServers: ["192.168.50.10"],
      ntpServers: ["192.168.50.30"],
      allowedNetworks: ["192.168.0.0/16"],
      proxyUrl: "",
      certificateMode: "INTERNAL_CA",
    });
    expect(parsed.certificateMode).toBe("INTERNAL_CA");
    expect(parsed.allowedNetworks).toEqual(["192.168.0.0/16"]);
  });

  it("rejeita CIDR público ou não canônico e normaliza duplicações", () => {
    const base = {
      hostName: "sagep.example.test",
      expectedIp: "192.168.50.20",
      gateway: "192.168.50.1",
      dnsServers: ["192.168.50.10"],
      ntpServers: ["192.168.50.30"],
      proxyUrl: null,
      certificateMode: "INTERNAL_CA" as const,
    };
    expect(updateDeploymentSchema.parse({ ...base, allowedNetworks: ["192.168.0.0/16", "192.168.0.0/16"] }).allowedNetworks).toEqual(["192.168.0.0/16"]);
    expect(() => updateDeploymentSchema.parse({ ...base, allowedNetworks: ["0.0.0.0/0"] })).toThrow();
    expect(() => updateDeploymentSchema.parse({ ...base, allowedNetworks: ["192.168.1.1/16"] })).toThrow();
  });
});

describe("schemas de custódia da autoridade", () => {
  it("exige senha longa, confirmação coincidente e confirmação literal", () => {
    expect(exportAuthorityBackupSchema.safeParse({ passphrase: "curta", passphraseConfirmation: "curta" }).success).toBe(false);
    expect(exportAuthorityBackupSchema.safeParse({ passphrase: "senha longa com vinte caracteres", passphraseConfirmation: "outra senha longa diferente" }).success).toBe(false);
    expect(restoreAuthorityBackupSchema.safeParse({ archiveBase64: "U0FHRVA=", passphrase: "senha longa com vinte caracteres", confirmation: "RESTAURAR" }).success).toBe(false);
  });
});
