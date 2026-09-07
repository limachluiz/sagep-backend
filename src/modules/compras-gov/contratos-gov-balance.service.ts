import * as cheerio from "cheerio";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

const SOURCE = "https://contratos.sistema.gov.br";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

type PublicUnitBalance = {
  unit: string;
  role: string;
  registered: string;
  committed: string;
  availableForCommitment: string;
};

type PublicAllocation = {
  unit: string;
  role: string;
  registered: string;
  availableForRedistributionOrCommitment: string;
};

export type ExternalAtaBalanceItem = {
  ataItemId: string;
  itemNumber: string;
  referenceCode: string;
  description: string;
  unit: string;
  managerRegisteredQuantity: string | null;
  managerCommittedQuantity: string | null;
  managerAvailableQuantity: string | null;
  publishedTotalRegisteredAuthorized: string;
  publishedTotalAvailableForCommitment: string;
  publishedAdhesionLimit: string;
  publishedAvailableForAdhesion: string;
  allocations: PublicAllocation[];
  units: PublicUnitBalance[];
  detailUrl: string;
};

export type ExternalAtaBalance = {
  source: "CONTRATOS_GOV_TRANSPARENCIA";
  sourceLabel: "Contratos.gov.br";
  sourceUrl: string;
  checkedAt: string;
  sourceUpdatedAt: null;
  identity: {
    ataNumber: string;
    uasg: string;
    pregaoNumber: string;
    pregaoYear: string;
    pncpControlNumber: string | null;
    contratosAtaId: string;
  };
  items: ExternalAtaBalanceItem[];
  warnings: string[];
};

type DiscoveryRow = {
  id?: number | string;
  numero?: string;
  numero_item_compra?: string;
  unidade_gerenciadora?: string;
};

const cache = new Map<string, { expiresAt: number; value: ExternalAtaBalance }>();

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unitCode(value: string) {
  return clean(value).split(/\s+-\s+/)[0] ?? "";
}

export function parsePublicDecimal(value: string) {
  let normalized = clean(value).replace(/^R\$\s*/, "");
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new AppError(`O Contratos.gov.br retornou um número inválido: ${value}`, 502, "EXTERNAL_BALANCE_INVALID");
  }
  return normalized;
}

function readTables($: cheerio.CheerioAPI) {
  return $("table").toArray().flatMap((table) => {
    if ($(table).find("table").length) return [];
    const headers = $(table).find(":scope > thead > tr > th").toArray().map((header) => clean($(header).text()));
    if (!headers.length) return [];
    const rows = $(table).find(":scope > tbody > tr").toArray().flatMap((row) => {
      const cells = $(row).children("td").toArray().map((cell) => clean($(cell).text()));
      if (!cells.length) return [];
      if (cells.length !== headers.length) {
        throw new AppError("A estrutura da tabela pública de saldo mudou.", 502, "EXTERNAL_BALANCE_SCHEMA_CHANGED");
      }
      return [Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))];
    });
    return [{ headers, rows }];
  });
}

function findTable(tables: ReturnType<typeof readTables>, required: string[]) {
  const matches = tables.filter((table) => required.every((header) => table.headers.includes(header)));
  if (matches.length !== 1) {
    throw new AppError("O Contratos.gov.br não apresentou uma tabela de saldo reconhecida.", 502, "EXTERNAL_BALANCE_SCHEMA_CHANGED");
  }
  return matches[0]!.rows;
}

function scalar($: cheerio.CheerioAPI, section: string, label: string) {
  const text = clean($(section).text());
  const match = text.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(-?\\d+(?:[.,]\\d+)?)`, "i"));
  if (!match?.[1]) {
    throw new AppError(`O Contratos.gov.br não informou “${label}”.`, 502, "EXTERNAL_BALANCE_SCHEMA_CHANGED");
  }
  return parsePublicDecimal(match[1]);
}

type ParseContext = {
  ataItemId: string;
  itemNumber: string;
  referenceCode: string;
  description: string;
  unit: string;
  ataNumber: string;
  uasg: string;
  pregaoNumber: string;
  pregaoYear: string;
  contratosAtaId: string;
};

export function parseExternalBalanceItem(html: string, context: ParseContext): ExternalAtaBalanceItem {
  const $ = cheerio.load(html);
  const pageText = clean($.root().text());
  const expected = [
    `Número da ata de registro de preços: ${context.ataNumber}`,
    `Unidade gerenciadora: ${context.uasg}`,
    `Número da compra/ Ano: ${context.pregaoNumber}/${context.pregaoYear}`,
    `Número do item: ${context.itemNumber}`,
  ];
  if (expected.some((identity) => !pageText.includes(identity))) {
    throw new AppError("A página pública encontrada não corresponde à ATA ou ao item solicitado.", 502, "EXTERNAL_BALANCE_IDENTITY_MISMATCH");
  }

  const tables = readTables($);
  const allocationRows = findTable(tables, ["Código", "Tipo da unidade", "Quantidade disponível para remanejamento/empenho"]);
  const unitRows = findTable(tables, ["Unidade", "Tipo", "Quantidade registrada", "Quantidade empenhada", "Saldo para empenho"]);
  const allocations = allocationRows.map((row) => ({
    unit: unitCode(row["Código"] ?? ""),
    role: row["Tipo da unidade"] ?? "",
    registered: parsePublicDecimal(row["Quantidade registrada"] ?? ""),
    availableForRedistributionOrCommitment: parsePublicDecimal(row["Quantidade disponível para remanejamento/empenho"] ?? ""),
  }));
  const units = unitRows.map((row) => ({
    unit: unitCode(row["Unidade"] ?? ""),
    role: row["Tipo"] ?? "",
    registered: parsePublicDecimal(row["Quantidade registrada"] ?? ""),
    committed: parsePublicDecimal(row["Quantidade empenhada"] ?? ""),
    availableForCommitment: parsePublicDecimal(row["Saldo para empenho"] ?? ""),
  }));
  const managerUnit = units.find((unit) => unit.unit === context.uasg);
  const managerAllocation = allocations.find((allocation) => allocation.unit === context.uasg);

  return {
    ataItemId: context.ataItemId,
    itemNumber: context.itemNumber,
    referenceCode: context.referenceCode,
    description: context.description,
    unit: context.unit,
    managerRegisteredQuantity: managerUnit?.registered ?? managerAllocation?.registered ?? null,
    managerCommittedQuantity: managerUnit?.committed ?? null,
    managerAvailableQuantity: managerUnit?.availableForCommitment ?? managerAllocation?.availableForRedistributionOrCommitment ?? null,
    publishedTotalRegisteredAuthorized: scalar($, "#tab4", "Quantidade Registrada/Autorizada:"),
    publishedTotalAvailableForCommitment: scalar($, "#tab4", "Saldo para Empenho:"),
    publishedAdhesionLimit: scalar($, "#tab3", "Qtd. limite para adesão:"),
    publishedAvailableForAdhesion: scalar($, "#tab3", "Quantidade disponivel para adesão:"),
    allocations,
    units,
    detailUrl: `${SOURCE}/transparencia/arpshow/itens/${context.itemNumber}/${context.contratosAtaId}/show`,
  };
}

async function fetchText(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(env.COMPRAS_GOV_REQUEST_TIMEOUT_MS),
      headers: { Accept: "text/html,application/json", "User-Agent": "SAGEP/1.0 public-balance", ...init?.headers },
    });
  } catch {
    throw new AppError("Não foi possível conectar ao Contratos.gov.br.", 502, "EXTERNAL_BALANCE_UNAVAILABLE");
  }
  if (!response.ok) throw new AppError(`Contratos.gov.br indisponível (HTTP ${response.status}).`, 502, "EXTERNAL_BALANCE_UNAVAILABLE");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new AppError("A resposta do Contratos.gov.br excedeu o limite de segurança.", 502, "EXTERNAL_BALANCE_TOO_LARGE");
  }
  return body;
}

async function discoverAtaId(uasg: string, ataNumber: string) {
  const form = new URLSearchParams({ draw: "1", start: "0", length: "2000", "search[value]": uasg, "search[regex]": "false" });
  const raw = await fetchText(`${SOURCE}/transparencia/transparencia/arp-item`, {
    method: "POST",
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
  });
  let parsed: { data?: DiscoveryRow[] };
  try { parsed = JSON.parse(raw) as { data?: DiscoveryRow[] }; }
  catch { throw new AppError("A busca pública de atas retornou um formato inválido.", 502, "EXTERNAL_BALANCE_SCHEMA_CHANGED"); }
  const candidates = (parsed.data ?? []).filter((row) =>
    row.numero === ataNumber && unitCode(row.unidade_gerenciadora ?? "") === uasg && /^\d+$/.test(String(row.id ?? "")),
  );
  const ids = [...new Set(candidates.map((row) => String(row.id)))];
  if (!ids.length) throw new AppError("A ATA não foi localizada na consulta pública do Contratos.gov.br.", 404, "EXTERNAL_BALANCE_NOT_FOUND");
  return ids;
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>) {
  const result: R[] = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await mapper(values[index]!);
    }
  }));
  return result;
}

export class ContratosGovBalanceService {
  async getAtaBalance(ataId: string) {
    const cached = cache.get(ataId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const ata = await prisma.ata.findUnique({
      where: { id: ataId },
      select: {
        number: true, externalSource: true, externalUasg: true, externalPregaoNumber: true,
        externalPregaoYear: true, externalAtaNumber: true, externalPncpControlNumber: true,
        items: { where: { deletedAt: null }, orderBy: { ataItemCode: "asc" }, select: {
          id: true, referenceCode: true, description: true, unit: true, externalItemNumber: true,
        } },
      },
    });
    if (!ata) throw new AppError("Ata não encontrada", 404);
    if (ata.externalSource !== "COMPRAS_GOV" || !ata.externalUasg || !ata.externalPregaoNumber || !ata.externalPregaoYear) {
      throw new AppError("Esta ATA não possui os identificadores necessários do Compras.gov.br.", 422, "EXTERNAL_BALANCE_NOT_CONFIGURED");
    }
    const ataNumber = ata.externalAtaNumber || ata.number;
    const mappedItems = ata.items
      .filter((item) => /^\d+$/.test(item.externalItemNumber ?? ""))
      .map((item) => ({ ...item, itemNumber: item.externalItemNumber!.padStart(5, "0") }));
    if (!mappedItems.length) throw new AppError("Nenhum item da ATA possui vínculo com o Compras.gov.br.", 422, "EXTERNAL_BALANCE_ITEMS_NOT_CONFIGURED");

    const candidateIds = await discoverAtaId(ata.externalUasg, ataNumber);
    let contratosAtaId: string | null = null;
    let firstHtml = "";
    for (const candidateId of candidateIds) {
      const item = mappedItems[0]!;
      const url = `${SOURCE}/transparencia/arpshow/itens/${item.itemNumber}/${candidateId}/show`;
      try {
        const html = await fetchText(url);
        parseExternalBalanceItem(html, { ...item, ataNumber, uasg: ata.externalUasg, pregaoNumber: ata.externalPregaoNumber, pregaoYear: ata.externalPregaoYear, contratosAtaId: candidateId, ataItemId: item.id });
        contratosAtaId = candidateId;
        firstHtml = html;
        break;
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "EXTERNAL_BALANCE_IDENTITY_MISMATCH") throw error;
      }
    }
    if (!contratosAtaId) throw new AppError("Nenhuma ATA pública corresponde ao pregão cadastrado no SAGEP.", 404, "EXTERNAL_BALANCE_NOT_FOUND");

    const firstItemId = mappedItems[0]!.id;
    const items = await mapWithConcurrency(mappedItems, 4, async (item) => {
      const html = item.id === firstItemId ? firstHtml : await fetchText(`${SOURCE}/transparencia/arpshow/itens/${item.itemNumber}/${contratosAtaId}/show`);
      return parseExternalBalanceItem(html, { ...item, ataNumber, uasg: ata.externalUasg!, pregaoNumber: ata.externalPregaoNumber!, pregaoYear: ata.externalPregaoYear!, contratosAtaId: contratosAtaId!, ataItemId: item.id });
    });
    const warnings = ata.items.length === mappedItems.length ? [] : [`${ata.items.length - mappedItems.length} item(ns) sem vínculo externo não foram consultados.`];
    const value: ExternalAtaBalance = {
      source: "CONTRATOS_GOV_TRANSPARENCIA", sourceLabel: "Contratos.gov.br",
      sourceUrl: `${SOURCE}/transparencia/arp-item`, checkedAt: new Date().toISOString(), sourceUpdatedAt: null,
      identity: { ataNumber, uasg: ata.externalUasg, pregaoNumber: ata.externalPregaoNumber, pregaoYear: ata.externalPregaoYear, pncpControlNumber: ata.externalPncpControlNumber, contratosAtaId },
      items, warnings,
    };
    cache.set(ataId, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }
}

export const contratosGovBalanceService = new ContratosGovBalanceService();
