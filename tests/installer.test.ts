import { describe, expect, it } from "vitest";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseEnvironmentFile } from "../scripts/env-file.mjs";
import { evaluateEnvironment } from "../scripts/check-deployment-preflight.mjs";
import {
  buildProductionEnvironment,
  atomicEnvironmentWrite,
  generateInstallerSecrets,
  renderFirewallService,
  renderHomologationNetworkService,
  validateInstallerAnswers,
} from "../scripts/install-sagep.mjs";

const answers = {
  hostName: "sagep.example.test",
  bindIp: "192.168.50.20",
  allowedNetworks: "192.168.0.0/16",
  pgAdminEmail: "admin@example.invalid",
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
    expect(values.CORS_ALLOWED_ORIGINS).toBe("https://sagep.example.test");
    expect(values.SAGEP_ALLOWED_NETWORKS).toBe("192.168.0.0/16");
    expect(values.JWT_SECRET).not.toBe(values.JWT_REFRESH_SECRET);
    expect(values.SAGEP_SECRETS_ENCRYPTION_KEY).toHaveLength(64);
    expect(values.SAGEP_SECRETS_ENCRYPTION_KEY).not.toBe(values.JWT_REFRESH_SECRET);
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
    const homologation = renderFirewallService(
      "/opt/sagep-homolog/sagep-backend",
      "/opt/sagep-homolog/sagep-backend/.env.homolog",
    );
    expect(homologation).toContain("--env /opt/sagep-homolog/sagep-backend/.env.homolog");
  });

  it("restaura o IPv4 da homologação antes do Docker iniciar", () => {
    const unit = renderHomologationNetworkService("192.168.250.10");
    expect(unit).toContain("Before=docker.service");
    expect(unit).toContain("ExecStart=/usr/sbin/ip address replace 192.168.250.10/32 dev lo");
    expect(unit).toContain("WantedBy=multi-user.target");
    expect(() => renderHomologationNetworkService("0.0.0.0")).toThrow(/inválido/);
  });

  it("preserva proprietário, grupo e permissão ao finalizar o ambiente", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "sagep-installer-"));
    const envPath = path.join(directory, ".env.homolog");
    try {
      await writeFile(envPath, "SAGEP_SETUP_TOKEN=temporaria\n", { mode: 0o600 });
      const before = await stat(envPath);
      await atomicEnvironmentWrite(envPath, "SAGEP_SETUP_TOKEN=\n", "finalize");
      const after = await stat(envPath);

      expect(after.uid).toBe(before.uid);
      expect(after.gid).toBe(before.gid);
      expect(after.mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
