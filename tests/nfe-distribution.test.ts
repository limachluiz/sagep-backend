import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildDistributionEnvelope, parseDistributionResponse } from "../src/modules/financial-execution/nfe-distribution.client.js";

const supplier = "1".repeat(14);
const base = `132610${supplier}55001000000001112345678`;
let sum = 0, weight = 2;
for (let i = 42; i >= 0; i--) { sum += Number(base[i]) * weight; weight = weight === 9 ? 2 : weight + 1; }
const key = `${base}${sum % 11 < 2 ? 0 : 11 - sum % 11}`;
const document = (body: string, status = "138", kind = "resNFe") => `<soap:Envelope><soap:Body><retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>1</tpAmb><cStat>${status}</cStat><loteDistDFeInt><docZip schema="${kind}_v1.01.xsd">${gzipSync(body).toString("base64")}</docZip></loteDistDFeInt></retDistDFeInt></soap:Body></soap:Envelope>`;
const summary = (accessKey = key, fiscalState = "1") => `<resNFe><chNFe>${accessKey}</chNFe><CNPJ>${supplier}</CNPJ><xNome>Fornecedor de teste</xNome><dhEmi>2026-10-01T10:00:00-04:00</dhEmi><vNF>100.00</vNF><nProt>fixture</nProt><cSitNFe>${fiscalState}</cSitNFe></resNFe>`;

describe("official NF-e distribution", () => {
  it("builds consChNFe with validated identifiers and the correct environment", () => {
    expect(key).toHaveLength(44);
    expect(buildDistributionEnvelope(key, supplier, "13", "HOMOLOGATION")).toContain("<tpAmb>2</tpAmb>");
    expect(() => buildDistributionEnvelope('"<xml>', supplier, "13", "PRODUCTION")).toThrow();
    expect(() => buildDistributionEnvelope(key, supplier, "00", "PRODUCTION")).toThrow();
  });
  it("distinguishes a summary from a complete invoice and does not invent item or signature checks", () => {
    const result = parseDistributionResponse(document(summary()), key, "PRODUCTION");
    expect(result).toMatchObject({ documentKind: "SUMMARY", fiscalStatus: "AUTHORIZED_IN_SUMMARY", summary: { grossAmount: 100, hasXmlSignature: false, itemCount: 0, recipientCnpj: null } });
    expect(result.warnings).toHaveLength(1);
  });
  it("reports cancellation and denial without treating the invoice as authorised", () => {
    expect(parseDistributionResponse(document(summary(key, "3")), key, "PRODUCTION").fiscalStatus).toBe("CANCELLED");
    expect(parseDistributionResponse(document(summary(key, "2")), key, "PRODUCTION").fiscalStatus).toBe("DENIED");
  });
  it("rejects a response for a different key or environment", () => {
    expect(() => parseDistributionResponse(document(summary("9".repeat(44))), key, "PRODUCTION")).toThrow();
    expect(() => parseDistributionResponse(document(summary()), key, "HOMOLOGATION")).toThrow();
  });
  it("returns the official error code without disclosing a server message", () => {
    const result = parseDistributionResponse('<retDistDFeInt><tpAmb>1</tpAmb><cStat>656</cStat><xMotivo>private server detail</xMotivo></retDistDFeInt>', key, "PRODUCTION");
    expect(result).toMatchObject({ statusCode: "656", documentKind: "NONE", summary: null });
    expect(JSON.stringify(result)).not.toContain("private server detail");
  });
  it("rejects malicious XML and compressed data", () => {
    expect(() => parseDistributionResponse('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><retDistDFeInt/>', key, "PRODUCTION")).toThrow();
    expect(() => parseDistributionResponse(document("a".repeat(8 * 1024 * 1024 + 1)), key, "PRODUCTION")).toThrow();
  });
});
