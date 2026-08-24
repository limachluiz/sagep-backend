import { describe, expect, it } from "vitest";
import { evaluateEnvironment, isPrivateIpv4 } from "../scripts/check-deployment-preflight.mjs";

describe("pré-validação local da implantação", () => {
  it("aceita somente endereços IPv4 privados", () => {
    expect(isPrivateIpv4("10.78.10.20")).toBe(true);
    expect(isPrivateIpv4("172.20.1.5")).toBe(true);
    expect(isPrivateIpv4("192.168.1.5")).toBe(true);
    expect(isPrivateIpv4("0.0.0.0")).toBe(false);
    expect(isPrivateIpv4("200.160.1.1")).toBe(false);
  });

  it("aprova um ambiente HTTPS coerente sem expor segredos", () => {
    const checks = evaluateEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://sagep:senha-forte@postgres:5432/sagep",
      POSTGRES_PASSWORD: "senha-forte-do-banco",
      JWT_ACCESS_SECRET: "a".repeat(64),
      JWT_REFRESH_SECRET: "b".repeat(64),
      AUTH_COOKIE_SECURE: "true",
      TRUST_PROXY_HOPS: "1",
      SAGEP_HOSTNAME: "sagep.4cta.eb.mil.br",
      SAGEP_HTTPS_PORT: "443",
      SAGEP_BIND_IP: "10.78.10.20",
      SAGEP_ALLOWED_NETWORKS: "10.78.0.0/16",
      CORS_ALLOWED_ORIGINS: "https://sagep.4cta.eb.mil.br",
      ALLOW_PUBLIC_REGISTRATION: "false",
    });
    expect(checks.every((check) => check.status === "PASS")).toBe(true);
    expect(JSON.stringify(checks)).not.toContain("senha-forte");
  });

  it("inclui a porta HTTPS publicada ao validar a origem CORS", () => {
    const checks = evaluateEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://sagep:senha-forte@postgres:5432/sagep",
      POSTGRES_PASSWORD: "senha-forte-do-banco",
      JWT_ACCESS_SECRET: "a".repeat(64),
      JWT_REFRESH_SECRET: "b".repeat(64),
      AUTH_COOKIE_SECURE: "true",
      TRUST_PROXY_HOPS: "1",
      SAGEP_HOSTNAME: "sagep.homolog.test",
      SAGEP_HTTPS_PORT: "58443",
      SAGEP_BIND_IP: "192.168.250.10",
      SAGEP_ALLOWED_NETWORKS: "192.168.250.0/24",
      CORS_ALLOWED_ORIGINS: "https://sagep.homolog.test:58443",
      ALLOW_PUBLIC_REGISTRATION: "false",
    });

    expect(checks.every((check) => check.status === "PASS")).toBe(true);
  });

  it("bloqueia valores de exemplo e publicação ampla", () => {
    const checks = evaluateEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: "<exemplo>",
      POSTGRES_PASSWORD: "changeme",
      JWT_SECRET: "curto",
      JWT_REFRESH_SECRET: "curto",
      AUTH_COOKIE_SECURE: "false",
      TRUST_PROXY_HOPS: "0",
      SAGEP_HOSTNAME: "sagep",
      SAGEP_BIND_IP: "0.0.0.0",
      SAGEP_ALLOWED_NETWORKS: "0.0.0.0/0",
      CORS_ALLOWED_ORIGINS: "*",
      ALLOW_PUBLIC_REGISTRATION: "true",
    });
    expect(checks.filter((check) => check.status === "FAIL").length).toBeGreaterThanOrEqual(8);
  });
});
