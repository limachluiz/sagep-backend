import { describe, expect, it } from "vitest";
import { initializeSetupSchema } from "../src/modules/setup/setup.schemas.js";

const valid = {
  setupToken: "a".repeat(32),
  administrator: {
    name: "Administrador de Teste",
    email: "admin@example.com",
    password: "Senha-Segura-2026!",
  },
  organization: {
    name: "Organização de Teste",
    acronym: "OM TESTE",
    cityName: "Cidade Exemplo",
    stateUf: "AM",
    uasg: "000000",
    management: "00001",
    timeZone: "America/Sao_Paulo",
    commandName: "Comando de Teste",
  },
  network: {
    hostName: "sagep.example.test",
    expectedIp: "192.168.50.20",
    gateway: "192.168.50.1",
    dnsServers: ["192.168.50.10"],
    ntpServers: [],
    allowedNetworks: ["192.168.0.0/16"],
    proxyUrl: null,
  },
};

describe("initializeSetupSchema", () => {
  it("aceita a configuração inicial segura da OM", () => {
    expect(initializeSetupSchema.parse(valid).administrator.email).toBe("admin@example.com");
  });

  it("rejeita senha inicial fraca", () => {
    expect(() => initializeSetupSchema.parse({
      ...valid,
      administrator: { ...valid.administrator, password: "senhafraca123" },
    })).toThrow();
  });

  it("rejeita chave de instalação curta", () => {
    expect(() => initializeSetupSchema.parse({ ...valid, setupToken: "curta" })).toThrow();
  });
});
