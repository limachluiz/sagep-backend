import * as cheerio from "cheerio";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";

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

type PublicCommitment = {
  number: string;
  unit: string;
  supplier: string;
  commitmentDate: string;
  includedQuantity: string;
  reinforcementQuantity: string;
  annulledQuantity: string;
  committedQuantity: string;
  value: string;
  transparencyUrl: string;
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
  commitments: PublicCommitment[];
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

type BalanceActor = { id: string; name?: string | null; email?: string | null };

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

function findOptionalTable(tables: ReturnType<typeof readTables>, required: string[]) {
  const matches = tables.filter((table) => required.every((header) => table.headers.includes(header)));
  if (matches.length > 1) {
    throw new AppError("O Contratos.gov.br apresentou mais de uma tabela de saldo compatível.", 502, "EXTERNAL_BALANCE_SCHEMA_CHANGED");
  }
  return matches[0]?.rows ?? [];
}

function scalar($: cheerio.CheerioAPI, section: string, label: string) {
  const text = clean($(section).text());
  const match = text.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(-?\\d+(?:[.,]\\d+)?)`, "i"));
  if (!match?.[1]) {
    throw new AppError(`O Contratos.gov.br não informou “${label}”.`, 502, "EXTERNAL_BALANCE_SCHEMA_CHANGED");
  }
  return parsePublicDecimal(match[1]);
}

function optionalScalar($: cheerio.CheerioAPI, section: string, label: string) {
  const text = clean($(section).text());
  const match = text.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(-?\\d+(?:[.,]\\d+)?)`, "i"));
  return match?.[1] ? parsePublicDecimal(match[1]) : null;
}

function sumPublicDecimals(values: string[]) {
  return values.reduce((total, value) => total.add(value), new Prisma.Decimal(0)).toString();
}

function transparencyCommitmentUrl(unit: string, number: string) {
  const managementCode = "00001";
  return `https://portaldatransparencia.gov.br/despesas/documento/empenho/${unit}${managementCode}${number}`;
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
  const unitRows = findOptionalTable(tables, ["Unidade", "Tipo", "Quantidade registrada", "Quantidade empenhada", "Saldo para empenho"]);
  const commitmentRows = findOptionalTable(tables, ["Número de empenho", "Unidade", "Fornecedor", "Data do empenho", "Quantidade incluída", "Reforço", "Anulação", "Quantidade empenhada", "Valor"]);
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
  const commitments = commitmentRows.map((row) => {
    const unit = unitCode(row["Unidade"] ?? "");
    const number = clean(row["Número de empenho"] ?? "");
    if (!/^\d{4}NE\d{6}$/.test(number) || !/^\d{6}$/.test(unit)) {
      throw new AppError("O Contratos.gov.br retornou uma Nota de Empenho inválida.", 502, "EXTERNAL_BALANCE_INVALID");
    }
    return {
      number,
      unit,
      supplier: row["Fornecedor"] ?? "",
      commitmentDate: row["Data do empenho"] ?? "",
      includedQuantity: parsePublicDecimal(row["Quantidade incluída"] ?? ""),
      reinforcementQuantity: parsePublicDecimal(row.Reforço ?? ""),
      annulledQuantity: parsePublicDecimal(row.Anulação ?? ""),
      committedQuantity: parsePublicDecimal(row["Quantidade empenhada"] ?? ""),
      value: parsePublicDecimal(row.Valor ?? ""),
      transparencyUrl: transparencyCommitmentUrl(unit, number),
    };
  });
  const managerUnit = units.find((unit) => unit.unit === context.uasg);
  const managerAllocation = allocations.find((allocation) => allocation.unit === context.uasg);
  const publishedTotalRegisteredAuthorized = optionalScalar($, "#tab4", "Quantidade Registrada/Autorizada:")
    ?? sumPublicDecimals(allocations.map((allocation) => allocation.registered));
  const publishedTotalAvailableForCommitment = optionalScalar($, "#tab4", "Saldo para Empenho:")
    ?? sumPublicDecimals(allocations.map((allocation) => allocation.availableForRedistributionOrCommitment));
  const publishedAdhesionLimit = scalar($, "#tab3", "Qtd. limite para adesão:");
  const publishedAvailableForAdhesion = optionalScalar($, "#tab3", "Quantidade disponivel para adesão:")
    ?? publishedAdhesionLimit;

  return {
    ataItemId: context.ataItemId,
    itemNumber: context.itemNumber,
    referenceCode: context.referenceCode,
    description: context.description,
    unit: context.unit,
    managerRegisteredQuantity: managerUnit?.registered ?? managerAllocation?.registered ?? null,
    managerCommittedQuantity: managerUnit?.committed ?? null,
    managerAvailableQuantity: managerUnit?.availableForCommitment ?? managerAllocation?.availableForRedistributionOrCommitment ?? null,
    publishedTotalRegisteredAuthorized,
    publishedTotalAvailableForCommitment,
    publishedAdhesionLimit,
    publishedAvailableForAdhesion,
    allocations,
    units,
    commitments,
    detailUrl: `${SOURCE}/transparencia/arpshow/itens/${context.itemNumber}/${context.contratosAtaId}/show`,
  };
}

async function fetchText(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(env.CONTRATOS_GOV_REQUEST_TIMEOUT_MS),
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
  private async loadAta(ataId: string, itemId?: string) {
    const ata = await prisma.ata.findUnique({
      where: { id: ataId },
      select: {
        number: true, externalSource: true, externalUasg: true, externalPregaoNumber: true,
        externalPregaoYear: true, externalAtaNumber: true, externalPncpControlNumber: true,
        externalContratosAtaId: true,
        items: { where: { deletedAt: null, ...(itemId ? { id: itemId } : {}) }, orderBy: { ataItemCode: "asc" }, select: {
          id: true, referenceCode: true, description: true, unit: true, externalItemNumber: true,
        } },
      },
    });
    if (!ata) throw new AppError("Ata não encontrada", 404);
    if (ata.externalSource !== "COMPRAS_GOV" || !ata.externalUasg || !ata.externalPregaoNumber || !ata.externalPregaoYear) {
      throw new AppError("Esta ATA não possui os identificadores necessários do Compras.gov.br.", 422, "EXTERNAL_BALANCE_NOT_CONFIGURED");
    }
    if (itemId && !ata.items.length) throw new AppError("Item da ata não encontrado", 404);
    return ata;
  }

  private async resolvePublicAta(
    ataId: string,
    ata: Awaited<ReturnType<ContratosGovBalanceService["loadAta"]>>,
    item: { id: string; itemNumber: string; referenceCode: string; description: string; unit: string },
  ) {
    const ataNumber = ata.externalAtaNumber || ata.number;
    const validateCandidate = async (candidateId: string) => {
      const html = await fetchText(`${SOURCE}/transparencia/arpshow/itens/${item.itemNumber}/${candidateId}/show`);
      parseExternalBalanceItem(html, {
        ...item, ataItemId: item.id, ataNumber, uasg: ata.externalUasg!,
        pregaoNumber: ata.externalPregaoNumber!, pregaoYear: ata.externalPregaoYear!, contratosAtaId: candidateId,
      });
      return html;
    };

    if (/^\d+$/.test(ata.externalContratosAtaId ?? "")) {
      try {
        return { contratosAtaId: ata.externalContratosAtaId!, firstHtml: await validateCandidate(ata.externalContratosAtaId!) };
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "EXTERNAL_BALANCE_IDENTITY_MISMATCH") throw error;
      }
    }

    const candidateIds = await discoverAtaId(ata.externalUasg!, ataNumber);
    for (const candidateId of candidateIds) {
      try {
        const firstHtml = await validateCandidate(candidateId);
        await prisma.ata.update({ where: { id: ataId }, data: { externalContratosAtaId: candidateId } });
        return { contratosAtaId: candidateId, firstHtml };
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "EXTERNAL_BALANCE_IDENTITY_MISMATCH") throw error;
      }
    }
    throw new AppError("Nenhuma ATA pública corresponde ao pregão cadastrado no SAGEP.", 404, "EXTERNAL_BALANCE_NOT_FOUND");
  }

  private async queryAtaBalance(ataId: string, itemId?: string) {
    const cached = !itemId ? cache.get(ataId) : undefined;
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const ata = await this.loadAta(ataId, itemId);
    const ataNumber = ata.externalAtaNumber || ata.number;
    const mappedItems = ata.items
      .filter((item) => /^\d+$/.test(item.externalItemNumber ?? ""))
      .map((item) => ({ ...item, itemNumber: item.externalItemNumber!.padStart(5, "0") }));
    if (!mappedItems.length) throw new AppError("Nenhum item da ATA possui vínculo com o Compras.gov.br.", 422, "EXTERNAL_BALANCE_ITEMS_NOT_CONFIGURED");

    const { contratosAtaId, firstHtml } = await this.resolvePublicAta(ataId, ata, mappedItems[0]!);

    const firstItemId = mappedItems[0]!.id;
    const items = await mapWithConcurrency(mappedItems, 4, async (item) => {
      const html = item.id === firstItemId ? firstHtml : await fetchText(`${SOURCE}/transparencia/arpshow/itens/${item.itemNumber}/${contratosAtaId}/show`);
      return parseExternalBalanceItem(html, { ...item, ataNumber, uasg: ata.externalUasg!, pregaoNumber: ata.externalPregaoNumber!, pregaoYear: ata.externalPregaoYear!, contratosAtaId: contratosAtaId!, ataItemId: item.id });
    });
    const warnings = ata.items.length === mappedItems.length ? [] : [`${ata.items.length - mappedItems.length} item(ns) sem vínculo externo não foram consultados.`];
    const value: ExternalAtaBalance = {
      source: "CONTRATOS_GOV_TRANSPARENCIA", sourceLabel: "Contratos.gov.br",
      sourceUrl: `${SOURCE}/transparencia/arp-item`, checkedAt: new Date().toISOString(), sourceUpdatedAt: null,
      identity: { ataNumber, uasg: ata.externalUasg!, pregaoNumber: ata.externalPregaoNumber!, pregaoYear: ata.externalPregaoYear!, pncpControlNumber: ata.externalPncpControlNumber, contratosAtaId },
      items, warnings,
    };
    if (!itemId) cache.set(ataId, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  async getAtaBalance(ataId: string) {
    return this.queryAtaBalance(ataId);
  }

  async getItemBalance(itemId: string) {
    const item = await prisma.ataItem.findUnique({ where: { id: itemId }, select: { ataId: true, deletedAt: true } });
    if (!item || item.deletedAt) throw new AppError("Item da ata não encontrado", 404);
    return this.queryAtaBalance(item.ataId, itemId);
  }

  private snapshotData(item: ExternalAtaBalanceItem, checkedAt: Date) {
    return {
      source: "CONTRATOS_GOV_TRANSPARENCIA",
      externalItemNumber: item.itemNumber,
      managerRegisteredQuantity: item.managerRegisteredQuantity,
      managerCommittedQuantity: item.managerCommittedQuantity,
      managerAvailableQuantity: item.managerAvailableQuantity,
      publishedTotalRegisteredAuthorized: item.publishedTotalRegisteredAuthorized,
      publishedTotalAvailableForCommitment: item.publishedTotalAvailableForCommitment,
      publishedAdhesionLimit: item.publishedAdhesionLimit,
      publishedAvailableForAdhesion: item.publishedAvailableForAdhesion,
      sourceUrl: item.detailUrl,
      checkedAt,
      rawSnapshot: { allocations: item.allocations, units: item.units, commitments: item.commitments } as Prisma.InputJsonValue,
    };
  }

  private async importBalance(result: ExternalAtaBalance, actor: BalanceActor) {
    const checkedAt = new Date(result.checkedAt);
    const importedAt = new Date();
    await prisma.$transaction(result.items.map((item) => prisma.ataItemExternalBalanceSnapshot.upsert({
      where: { ataItemId: item.ataItemId },
      create: { ataItemId: item.ataItemId, ...this.snapshotData(item, checkedAt) },
      update: this.snapshotData(item, checkedAt),
    })));
    await Promise.all(result.items.map((item) => auditService.log({
      entityType: "ATA_ITEM",
      entityId: item.ataItemId,
      action: "SYNC",
      actor: { id: actor.id, name: actor.name ?? actor.email ?? null },
      summary: `Saldo oficial do item ${item.referenceCode} importado do Contratos.gov.br`,
      after: {
        managerRegisteredQuantity: item.managerRegisteredQuantity,
        managerCommittedQuantity: item.managerCommittedQuantity,
        managerAvailableQuantity: item.managerAvailableQuantity,
        checkedAt: result.checkedAt,
      },
      metadata: { sourceUrl: item.detailUrl, operationalBalanceChanged: false },
    })));
    return {
      ...result,
      import: { importedAt: importedAt.toISOString(), itemsImported: result.items.length, operationalBalanceChanged: false },
    };
  }

  async importAtaBalance(ataId: string, actor: BalanceActor) {
    return this.importBalance(await this.getAtaBalance(ataId), actor);
  }

  async importItemBalance(itemId: string, actor: BalanceActor) {
    return this.importBalance(await this.getItemBalance(itemId), actor);
  }
}

export const contratosGovBalanceService = new ContratosGovBalanceService();
