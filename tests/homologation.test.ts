import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { parseEnvironmentFile } from "../scripts/env-file.mjs";
import { generateInstallerSecrets } from "../scripts/install-sagep.mjs";
import {
  buildHomologationEnvironment,
  homologationDefaults,
  validateHomologationEnvironment,
} from "../scripts/prepare-homologation.mjs";

describe("homologação isolada no Pop!_OS", () => {
  it("gera recursos, portas e origem separados do ambiente existente", () => {
    let counter = 0;
    const secrets = generateInstallerSecrets((bytes: number) =>
      `${String(++counter).padStart(2, "0")}${"b".repeat(bytes * 2 - 2)}`);
    const values = parseEnvironmentFile(buildHomologationEnvironment(secrets));

    expect(validateHomologationEnvironment(values)).toBe(values);
    expect(values.SAGEP_COMPOSE_PROJECT).toBe("sagep-homolog");
    expect(values.SAGEP_CONTAINER_PREFIX).toBe("sagep_homolog");
    expect(values.SAGEP_VOLUME_PREFIX).toBe("sagep_homolog");
    expect(values.SAGEP_FIREWALL_NAMESPACE).toBe("SAGEP-HML");
    expect(values.DATABASE_URL).toContain(`localhost:${homologationDefaults.postgresPort}`);
    expect(values.DOCKER_DATABASE_URL).toContain("postgres:5432");
    expect(values.CORS_ALLOWED_ORIGINS).toBe("https://sagep.homolog.test:58443");
    expect(values.API_PORT).not.toBe("3000");
    expect(values.POSTGRES_PORT).not.toBe("5432");
  });

  it("bloqueia configuração que retorne aos recursos de produção", () => {
    const values = parseEnvironmentFile(buildHomologationEnvironment());
    expect(() => validateHomologationEnvironment({ ...values, SAGEP_CONTAINER_PREFIX: "sagep" })).toThrow(/divergente/);
    expect(() => validateHomologationEnvironment({ ...values, SAGEP_HTTPS_PORT: "443" })).toThrow(/divergente/);
  });

  it("mantém defaults de produção e permite nomes interpolados no Compose", async () => {
    const compose = await readFile("docker-compose.yml", "utf8");
    expect(compose).toContain("name: ${SAGEP_COMPOSE_PROJECT:-sagep-backend}");
    expect(compose).toContain("container_name: ${SAGEP_CONTAINER_PREFIX:-sagep}_api");
    expect(compose).toContain("${SAGEP_BIND_IP:-127.0.0.1}:${SAGEP_HTTPS_PORT:-443}:443");
    expect(compose).toContain("name: ${SAGEP_VOLUME_PREFIX:-sagep}_postgres_data");
  });
});
