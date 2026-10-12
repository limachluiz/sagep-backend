import { request } from "node:https";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { load } from "cheerio";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";
import { isValidNfeAccessKey, parseNfeXmlBase64, type NfeXmlSummary } from "./nfe-xml.service.js";

const ENDPOINTS = {
  PRODUCTION: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  HOMOLOGATION: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};
const MAX_RESPONSE = 2 * 1024 * 1024;
const MAX_XML = 8 * 1024 * 1024;
const UF_CODES = new Set(["11", "12", "13", "14", "15", "16", "17", "21", "22", "23", "24", "25", "26", "27", "28", "29", "31", "32", "33", "35", "41", "42", "43", "50", "51", "52", "53"]);
export type OfficialNfeResult = {
  source: "SEFAZ"; environment: "PRODUCTION" | "HOMOLOGATION"; queriedAt: string;
  statusCode: string; documentKind: "FULL_XML" | "SUMMARY" | "NONE";
  fiscalStatus: "AUTHORIZED_AT_ISSUE" | "AUTHORIZED_IN_SUMMARY" | "CANCELLED" | "DENIED" | "UNKNOWN";
  summary: (Omit<NfeXmlSummary, "issuedAt"> & { issuedAt: string }) | null;
  warnings: string[];
};

function xmlDocument(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new AppError("Resposta fiscal com estrutura não permitida", 502, "NFE_RESPONSE_INVALID");
  // Namespace prefixes do not change the XML local names used by the official schemas.
  return load(xml.replace(/(<\/?)[A-Za-z_][\w.-]*:/g, "$1"), { xmlMode: true });
}

export function buildDistributionEnvelope(accessKey: string, cnpj: string, uf: string, environment: "PRODUCTION" | "HOMOLOGATION") {
  if (!/^\d{44}$/.test(accessKey) || !isValidNfeAccessKey(accessKey) || accessKey.slice(20, 22) !== "55") throw new AppError("Informe uma chave válida de NF-e modelo 55", 422, "INVALID_NFE_ACCESS_KEY");
  if (!/^\d{14}$/.test(cnpj) || !UF_CODES.has(uf)) throw new AppError("Configure CNPJ numérico e código IBGE da UF para a consulta fiscal", 503, "NFE_CONFIGURATION_INVALID");
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg><distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${environment === "PRODUCTION" ? "1" : "2"}</tpAmb><cUFAutor>${uf}</cUFAutor><CNPJ>${cnpj}</CNPJ><consChNFe><chNFe>${accessKey}</chNFe></consChNFe></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}

export function parseDistributionResponse(xml: string, accessKey: string, environment: "PRODUCTION" | "HOMOLOGATION"): OfficialNfeResult {
  if (Buffer.byteLength(xml) > MAX_RESPONSE) throw new AppError("Resposta fiscal excede o limite permitido", 502, "NFE_RESPONSE_INVALID");
  const $ = xmlDocument(xml);
  const result = $("retDistDFeInt").first();
  const statusCode = result.children("cStat").text().trim();
  if (!/^\d{3}$/.test(statusCode) || result.children("tpAmb").text().trim() !== (environment === "PRODUCTION" ? "1" : "2")) throw new AppError("Retorno incompatível do serviço fiscal", 502, "NFE_RESPONSE_INVALID");
  const output: OfficialNfeResult = { source: "SEFAZ", environment, queriedAt: new Date().toISOString(), statusCode, documentKind: "NONE", fiscalStatus: "UNKNOWN", summary: null, warnings: [] };
  if (statusCode !== "138") return output;
  const documents = result.find("docZip");
  if (documents.length > 50) throw new AppError("Lote fiscal excede o limite permitido", 502, "NFE_RESPONSE_INVALID");
  let unpackedBytes = 0;
  documents.each((_index, element) => {
    const encoded = $(element).text().trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new AppError("Documento fiscal comprimido inválido", 502, "NFE_RESPONSE_INVALID");
    let buffer: Buffer;
    try { buffer = gunzipSync(Buffer.from(encoded, "base64"), { maxOutputLength: MAX_XML - unpackedBytes }); } catch { throw new AppError("Documento fiscal inválido ou acima do limite", 502, "NFE_RESPONSE_INVALID"); }
    unpackedBytes += buffer.length;
    const document = xmlDocument(buffer.toString("utf8"));
    if (document("nfeProc").length) {
      const summary = parseNfeXmlBase64(Buffer.from(document.xml(), "utf8").toString("base64"));
      if (summary.accessKey !== accessKey) throw new AppError("O serviço retornou outra chave fiscal", 502, "NFE_RESPONSE_KEY_MISMATCH");
      output.documentKind = "FULL_XML";
      output.summary = { ...summary, issuedAt: summary.issuedAt.toISOString() };
      if (output.fiscalStatus !== "CANCELLED") output.fiscalStatus = ["100", "150"].includes(summary.authorizationStatus ?? "") ? "AUTHORIZED_AT_ISSUE" : "UNKNOWN";
    } else if (document("resNFe").length) {
      const node = document("resNFe").first();
      if (node.find("chNFe").text().trim() !== accessKey) throw new AppError("O serviço retornou outra chave fiscal", 502, "NFE_RESPONSE_KEY_MISMATCH");
      const fiscalState = node.find("cSitNFe").text().trim();
      if (output.fiscalStatus !== "CANCELLED") output.fiscalStatus = fiscalState === "1" ? "AUTHORIZED_IN_SUMMARY" : fiscalState === "2" ? "DENIED" : fiscalState === "3" ? "CANCELLED" : "UNKNOWN";
      if (!output.summary) {
        const issuedAt = new Date(node.find("dhEmi").text());
        const grossAmount = Number(node.find("vNF").text());
        const supplierCnpj = node.find("CNPJ").first().text().trim();
        if (!Number.isFinite(grossAmount) || grossAmount <= 0 || Number.isNaN(issuedAt.getTime()) || !/^\d{14}$/.test(supplierCnpj)) throw new AppError("Resumo fiscal incompleto", 502, "NFE_RESPONSE_INVALID");
        output.documentKind = "SUMMARY";
        output.summary = { number: String(Number(accessKey.slice(25, 34))), series: String(Number(accessKey.slice(22, 25))), accessKey, supplierCnpj, issuerName: node.find("xNome").text().trim() || null, recipientCnpj: null, issuedAt: issuedAt.toISOString(), grossAmount, itemCount: 0, authorizationStatus: null, authorizationProtocol: node.find("nProt").text().trim() || null, hasXmlSignature: false, xmlChecksumSha256: "" };
      }
    } else if (document("infEvento").length) {
      const event = document("infEvento").first();
      if (event.find("chNFe").text().trim() === accessKey && event.find("tpEvento").text().trim() === "110111" && ["135", "136", "155"].includes(document("retEvento infEvento cStat").text().trim())) output.fiscalStatus = "CANCELLED";
    }
  });
  if (output.documentKind === "SUMMARY") output.warnings.push("A SEFAZ disponibilizou somente o resumo: itens, destinatário e assinatura XML não foram conferidos.");
  if (output.fiscalStatus === "AUTHORIZED_AT_ISSUE") output.warnings.push("O protocolo confirma a autorização na emissão. Este retorno não comprova ausência de cancelamentos posteriores.");
  if (!output.summary) output.warnings.push("Nenhum documento ou resumo da chave foi disponibilizado; use o XML autorizado.");
  return output;
}

export class NfeDistributionClient {
  configuration() {
    const configured = Boolean(env.NFE_INTERESTED_CNPJ && env.NFE_PFX_PATH && env.NFE_PFX_PASSWORD_FILE);
    return { configured, environment: env.NFE_ENVIRONMENT, requiresInstitutionalCertificate: true, message: configured ? "Consulta oficial configurada; disponibilidade depende da autorização da SEFAZ." : "Configure o certificado A1 institucional, sua senha por arquivo, CNPJ e UF no servidor." };
  }
  async consult(accessKey: string): Promise<OfficialNfeResult> {
    const body = buildDistributionEnvelope(accessKey, env.NFE_INTERESTED_CNPJ, env.NFE_UF_CODE, env.NFE_ENVIRONMENT);
    if (!this.configuration().configured) throw new AppError("Consulta oficial de NF-e não configurada", 503, "NFE_NOT_CONFIGURED");
    let pfx: Buffer, passphrase: string;
    try { pfx = await readFile(env.NFE_PFX_PATH); passphrase = (await readFile(env.NFE_PFX_PASSWORD_FILE, "utf8")).replace(/[\r\n]+$/, ""); } catch { throw new AppError("Certificado fiscal ou arquivo de senha indisponível", 503, "NFE_CERTIFICATE_UNAVAILABLE"); }
    if (pfx.length > 1024 * 1024 || !passphrase || passphrase.length > 1024) throw new AppError("Configuração do certificado fiscal inválida", 503, "NFE_CERTIFICATE_UNAVAILABLE");
    const xml = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => req.destroy(new Error("timeout")), env.NFE_TIMEOUT_MS);
      const fail = () => { clearTimeout(timer); reject(new AppError("Não foi possível consultar a SEFAZ. Verifique certificado, autorização e conectividade.", 502, "NFE_SERVICE_UNAVAILABLE")); };
      let req: ReturnType<typeof request>;
      try { req = request(ENDPOINTS[env.NFE_ENVIRONMENT], { method: "POST", pfx, passphrase, rejectUnauthorized: true, headers: { "Content-Type": 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"', "Content-Length": Buffer.byteLength(body) } }, (response) => {
        if (response.statusCode !== 200) { response.resume(); req.destroy(); fail(); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        response.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > MAX_RESPONSE) req.destroy(new Error("limit")); else chunks.push(chunk); });
        response.on("error", fail);
        response.on("end", () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString("utf8")); });
      }); req.on("error", fail); req.end(body); } catch { fail(); }
    });
    return parseDistributionResponse(xml, accessKey, env.NFE_ENVIRONMENT);
  }
}
export const nfeDistributionClient = new NfeDistributionClient();
