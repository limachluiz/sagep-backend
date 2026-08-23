import { describe, expect, it } from "vitest";
import { parseEnvironmentFile } from "../scripts/env-file.mjs";
import { evaluateEnvironment } from "../scripts/check-deployment-preflight.mjs";
import {
  buildProductionEnvironment,
  generateInstallerSecrets,
  renderFirewallService,
  validateInstallerAnswers,
} from "../scripts/install-sagep.mjs";

const answers = {
  hostName: "sagep.4cta.eb.mil.br",
  bindIp: "10.78.10.20",
  allowedNetworks: "10.78.0.0/16",
  pgAdminEmail: "admin@sagep.4cta.eb.mil.br",
};

describe("instalador assistido", () => {
  it("valida somente DNS, IP e redes internas coerentes", () => {
    expect(validateInstallerAnswers(answers)).toEqual(answers);
    expect(() => validateInstallerAnswers({ ...answers, bindIp: "0.0.0.0" })).toThrow(/IPv4 privado/);
    expect(() => validateInstallerAnswers({ ...answers, allowedNetworks: "0.0.0.0/0" })).toThrow(/CIDR/);
    expect(() => validateInstallerAnswers({ ...answers, hostName: "sagep" })).toThrow(/DNS interno/);
  });

  it("gera produção HTTPS sem reutilizar segredos ou expor placeholders", () => {
    let counter = 0;
    const secrets = generateInstallerSecrets((bytes: number) => `${String(++counter).padStart(2, "0")}${"a".repeat(bytes * 2 - 2)}`);
    const values = parseEnvironmentFile(buildProductionEnvironment(answers, secrets));

    expect(values.NODE_ENV).toBe("production");
    expect(values.AUTH_COOKIE_SECURE).toBe("true");
    expect(values.TRUST_PROXY_HOPS).toBe("1");
    expect(values.CORS_ALLOWED_ORIGINS).toBe("https://sagep.4cta.eb.mil.br");
    expect(values.SAGEP_ALLOWED_NETWORKS).toBe("10.78.0.0/16");
    expect(values.JWT_SECRET).not.toBe(values.JWT_REFRESH_SECRET);
    expect(values.DATABASE_URL).toContain(values.POSTGRES_PASSWORD);
    expect(JSON.stringify(values)).not.toMatch(/change-?me|<.*>|exemplo/i);
    expect(evaluateEnvironment(values).every((check) => check.status === "PASS")).toBe(true);
  });

  it("renderiza persistência do firewall somente dentro do projeto informado", () => {
    const unit = renderFirewallService("/opt/sagep/sagep-backend");
    expect(unit).toContain("WorkingDirectory=/opt/sagep/sagep-backend");
    expect(unit).toContain("PartOf=docker.service");
    expect(unit).not.toContain("sshd");
    expect(() => renderFirewallService("/opt/sagep com espaço")).toThrow(/espaços/);
  });
});
