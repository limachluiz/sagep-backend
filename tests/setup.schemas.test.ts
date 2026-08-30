import { describe, expect, it } from "vitest";
import { initializeSetupSchema } from "../src/modules/setup/setup.schemas.js";

const valid = {
  setupToken: "a".repeat(32),
  administrator: {
    name: "Administrador da OM",
    email: "admin@4cta.eb.mil.br",
    password: "Senha-Segura-2026!",
  },
  organization: {
    name: "4º Centro de Telemática de Área",
    acronym: "4º CTA",
    cityName: "Manaus",
    stateUf: "AM",
    uasg: "160016",
    management: "00001",
    timeZone: "America/Manaus",
    commandName: "Comando Militar da Amazônia",
  },
  network: {
    hostName: "sagep.4cta.eb.mil.br",
    expectedIp: "10.72.10.20",
    gateway: "10.72.10.1",
    dnsServers: ["10.72.0.10"],
    ntpServers: [],
    allowedNetworks: ["10.72.0.0/16"],
    proxyUrl: null,
  },
};

describe("initializeSetupSchema", () => {
  it("aceita a configuração inicial segura da OM", () => {
    expect(initializeSetupSchema.parse(valid).administrator.email).toBe("admin@4cta.eb.mil.br");
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
