import { describe, expect, it } from "vitest";
import { isCanonicalPrivateIpv4Cidr, isPrivateIpv4, normalizePrivateIpv4Cidrs } from "../src/shared/network.js";

describe("validação de redes privadas", () => {
  it("aceita IPv4 privados e rejeita endereços públicos ou amplos", () => {
    expect(isPrivateIpv4("192.168.50.20")).toBe(true);
    expect(isPrivateIpv4("172.31.255.254")).toBe(true);
    expect(isPrivateIpv4("192.168.1.5")).toBe(true);
    expect(isPrivateIpv4("127.0.0.1")).toBe(false);
    expect(isPrivateIpv4("200.160.1.1")).toBe(false);
    expect(isPrivateIpv4("010.078.010.020")).toBe(false);
  });

  it("exige rede CIDR privada e canônica", () => {
    expect(isCanonicalPrivateIpv4Cidr("192.168.0.0/16")).toBe(true);
    expect(isCanonicalPrivateIpv4Cidr("172.20.4.0/24")).toBe(true);
    expect(isCanonicalPrivateIpv4Cidr("192.168.10.32/27")).toBe(true);
    expect(isCanonicalPrivateIpv4Cidr("192.168.1.4/16")).toBe(false);
    expect(isCanonicalPrivateIpv4Cidr("0.0.0.0/0")).toBe(false);
    expect(isCanonicalPrivateIpv4Cidr("8.8.8.0/24")).toBe(false);
  });

  it("remove duplicações e estabiliza a ordem", () => {
    expect(normalizePrivateIpv4Cidrs([" 192.168.0.0/16", "10.0.0.0/8", "10.0.0.0/8"])).toEqual([
      "10.0.0.0/8",
      "192.168.0.0/16",
    ]);
  });
});
