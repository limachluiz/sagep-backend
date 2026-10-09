import { createHash } from "node:crypto";
import { load } from "cheerio";
import { AppError } from "../../shared/app-error.js";

export type NfeXmlSummary = {
  number: string;
  series: string | null;
  accessKey: string;
  supplierCnpj: string;
  issuerName: string | null;
  recipientCnpj: string | null;
  issuedAt: Date;
  grossAmount: number;
  itemCount: number;
  authorizationStatus: string | null;
  authorizationProtocol: string | null;
  hasXmlSignature: boolean;
  xmlChecksumSha256: string;
};

const MAX_XML_BYTES = 8 * 1024 * 1024;

function digits(value: string) { return value.replace(/\D/g, ""); }
function required(value: string, field: string) { if (!value.trim()) throw new AppError(`O XML da NF-e não contém ${field}`, 422, "INVALID_NFE_XML"); return value.trim(); }

export function isValidNfeAccessKey(value: string) {
  const key = digits(value);
  if (!/^\d{44}$/.test(key)) return false;
  let weight = 2;
  let sum = 0;
  for (let index = 42; index >= 0; index -= 1) { sum += Number(key[index]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const remainder = sum % 11;
  const expected = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return Number(key[43]) === expected;
}

export function parseNfeXmlBase64(xmlBase64: string): NfeXmlSummary {
  const normalized = xmlBase64.replace(/^data:(?:text|application)\/xml;base64,/, "");
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length || buffer.length > MAX_XML_BYTES) throw new AppError("Informe um XML de NF-e válido de até 8 MB", 422, "INVALID_NFE_XML");
  const xml = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (!/<(?:\w+:)?(?:nfeProc|NFe)\b/.test(xml)) throw new AppError("O arquivo não possui a estrutura oficial de uma NF-e", 422, "INVALID_NFE_XML");
  const $ = load(xml, { xmlMode: true });
  const infNfe = $("infNFe").first();
  if (!infNfe.length) throw new AppError("O XML não contém o grupo infNFe", 422, "INVALID_NFE_XML");
  const accessKey = digits(infNfe.attr("Id")?.replace(/^NFe/i, "") ?? "");
  if (!isValidNfeAccessKey(accessKey)) throw new AppError("A chave de acesso do XML é inválida", 422, "INVALID_NFE_ACCESS_KEY");
  const issuedAtValue = infNfe.find("ide > dhEmi").first().text() || infNfe.find("ide > dEmi").first().text();
  const issuedAt = new Date(required(issuedAtValue, "data de emissão"));
  if (Number.isNaN(issuedAt.getTime())) throw new AppError("A data de emissão da NF-e é inválida", 422, "INVALID_NFE_XML");
  const grossAmount = Number(required(infNfe.find("total > ICMSTot > vNF").first().text(), "valor total").replace(",", "."));
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) throw new AppError("O valor total da NF-e é inválido", 422, "INVALID_NFE_XML");
  const supplierCnpj = digits(required(infNfe.find("emit > CNPJ").first().text(), "CNPJ do emitente"));
  if (supplierCnpj.length !== 14) throw new AppError("O CNPJ do emitente no XML é inválido", 422, "INVALID_NFE_XML");
  return {
    number: required(infNfe.find("ide > nNF").first().text(), "número"),
    series: infNfe.find("ide > serie").first().text().trim() || null,
    accessKey,
    supplierCnpj,
    issuerName: infNfe.find("emit > xNome").first().text().trim() || null,
    recipientCnpj: digits(infNfe.find("dest > CNPJ").first().text()) || null,
    issuedAt,
    grossAmount,
    itemCount: infNfe.find("det").length,
    authorizationStatus: $("protNFe > infProt > cStat").first().text().trim() || null,
    authorizationProtocol: $("protNFe > infProt > nProt").first().text().trim() || null,
    hasXmlSignature: $("Signature").length > 0,
    xmlChecksumSha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
