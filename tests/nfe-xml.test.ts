import { describe, expect, it } from "vitest";
import { isValidNfeAccessKey, parseNfeXmlBase64 } from "../src/modules/financial-execution/nfe-xml.service.js";

const accessKey = "43240401707980000120550030001216501201441562";

describe("nfe xml", () => {
  it("validates the official 44 digit check digit", () => {
    expect(isValidNfeAccessKey(accessKey)).toBe(true);
    expect(isValidNfeAccessKey(`${accessKey.slice(0, 43)}0`)).toBe(false);
  });

  it("extracts a sanitized summary without retaining the xml", () => {
    const xml = `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${accessKey}"><ide><nNF>121650</nNF><serie>3</serie><dhEmi>2026-10-08T10:00:00-04:00</dhEmi></ide><emit><CNPJ>01707980000120</CNPJ><xNome>FORNECEDOR TESTE</xNome></emit><dest><CNPJ>12345678000199</CNPJ></dest><det nItem="1"><prod><cProd>1</cProd></prod></det><total><ICMSTot><vNF>123.45</vNF></ICMSTot></total></infNFe><Signature><SignedInfo /></Signature></NFe><protNFe><infProt><cStat>100</cStat><nProt>143260000000001</nProt></infProt></protNFe></nfeProc>`;
    const result = parseNfeXmlBase64(Buffer.from(xml).toString("base64"));
    expect(result).toMatchObject({ accessKey, number: "121650", series: "3", supplierCnpj: "01707980000120", grossAmount: 123.45, itemCount: 1, authorizationStatus: "100", hasXmlSignature: true });
    expect(result.xmlChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
