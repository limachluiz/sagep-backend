import { describe, expect, it } from "vitest";
import {
  desiredChainRules,
  desiredJumpRules,
  parseAllowedNetworks,
  parseFirewallNamespace,
  parseProtectedPorts,
} from "../scripts/manage-firewall.mjs";

describe("firewall por CIDR", () => {
  it("normaliza somente CIDRs privados e bloqueia listas perigosas", () => {
    expect(parseAllowedNetworks("192.168.0.0/16, 10.78.0.0/16,10.78.0.0/16")).toEqual([
      "10.78.0.0/16",
      "192.168.0.0/16",
    ]);
    expect(() => parseAllowedNetworks("0.0.0.0/0")).toThrow(/inválido/);
    expect(() => parseAllowedNetworks("10.78.1.1/16")).toThrow(/canônico/);
    expect(() => parseAllowedNetworks("010.078.0.0/16")).toThrow(/inválido/);
    expect(() => parseAllowedNetworks("")).toThrow(/nenhuma rede/);
  });

  it("autoriza as redes declaradas e rejeita o restante", () => {
    expect(desiredChainRules("SAGEP-INGRESS-A", ["10.78.0.0/16"])).toEqual([
      ["-A", "SAGEP-INGRESS-A", "-s", "10.78.0.0/16", "-j", "RETURN"],
      ["-A", "SAGEP-INGRESS-A", "-p", "tcp", "-j", "REJECT", "--reject-with", "tcp-reset"],
    ]);
  });

  it("restringe somente 80/443 no IPv4 publicado pelo SAGEP", () => {
    const rules = desiredJumpRules("SAGEP-INGRESS-A", "10.78.10.20");
    expect(rules).toHaveLength(2);
    expect(rules.map((rule) => rule[rule.indexOf("--ctorigdstport") + 1])).toEqual(["80", "443"]);
    expect(rules.every((rule) => rule.includes("10.78.10.20") && rule.includes("ORIGINAL"))).toBe(true);
    expect(JSON.stringify(rules)).not.toContain("22");
  });

  it("isola namespace e portas alternativas da homologação", () => {
    expect(parseFirewallNamespace("sagep-hml")).toBe("SAGEP-HML");
    expect(parseProtectedPorts("58080", "58443")).toEqual([58080, 58443]);
    expect(desiredJumpRules("SAGEP-HML-A", "192.168.250.10", [58080, 58443])
      .map((rule) => rule[rule.indexOf("--ctorigdstport") + 1])).toEqual(["58080", "58443"]);
    expect(() => parseFirewallNamespace("nome inválido")).toThrow(/inválido/);
    expect(() => parseProtectedPorts("443", "443")).toThrow(/diferentes/);
  });
});
