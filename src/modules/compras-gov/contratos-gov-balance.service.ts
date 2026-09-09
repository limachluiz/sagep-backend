import * as cheerio from "cheerio";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { systemSettingsService } from "../system-settings/system-settings.service.js";

const SOURCE = "https://contratos.sistema.gov.br";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

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
  retrieval: "LIVE" | "SNAPSHOT_FALLBACK";
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
export type PublicSession = { cookies: Map<string, string>; expiresAt: number };
let publicSession: PublicSession | null = null;
let publicSessionPromise: Promise<PublicSession> | null = null;

type BalanceActor = { id: string; name?: string | null; email?: string | null };
type OpeningBalanceSource = "LIVE" | "SAVED_SNAPSHOT";

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

function updateSessionCookies(session: PublicSession, response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headers.getSetCookie?.() ?? (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
  for (const setCookie of setCookies) {
    const pair = setCookie.split(";", 1)[0];
    const separator = pair?.indexOf("=") ?? -1;
    if (separator <= 0) continue;
    session.cookies.set(pair!.slice(0, separator).trim(), pair!.slice(separator + 1).trim());
  }
}

function sessionHeaders(session: PublicSession) {
  const cookie = [...session.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  const xsrf = session.cookies.get("XSRF-TOKEN");
  let xsrfHeader: string | undefined;
  if (xsrf) {
    try { xsrfHeader = decodeURIComponent(xsrf); }
    catch { xsrfHeader = xsrf; }
  }
  return {
    ...(cookie ? { Cookie: cookie } : {}),
    ...(xsrfHeader ? { "X-XSRF-TOKEN": xsrfHeader } : {}),
  };
}

async function requestWithSession(url: string, init: RequestInit, session: PublicSession) {
  let currentUrl = url;
  let currentInit = init;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(currentUrl, {
      ...currentInit,
      redirect: "manual",
      signal: AbortSignal.timeout(env.CONTRATOS_GOV_REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "text/html,application/json",
        "User-Agent": "SAGEP/1.0 public-balance",
        ...sessionHeaders(session),
        ...currentInit.headers,
      },
    });
    updateSessionCookies(session, response);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.origin !== SOURCE) throw new AppError("O Contratos.gov.br redirecionou para uma origem não reconhecida.", 502, "EXTERNAL_BALANCE_UNAVAILABLE");
    if ([301, 302, 303].includes(response.status) && currentInit.method?.toUpperCase() === "POST") {
      currentInit = { method: "GET" };
    }
    currentUrl = nextUrl.toString();
  }
  throw new AppError("O Contratos.gov.br excedeu o limite de redirecionamentos.", 502, "EXTERNAL_BALANCE_UNAVAILABLE");
}

export async function createPublicSession() {
  const session: PublicSession = { cookies: new Map(), expiresAt: Date.now() + 30 * 60 * 1000 };
  for (const path of ["/login", "/transparencia"]) {
    let response: Response;
    try { response = await requestWithSession(`${SOURCE}${path}`, { method: "GET" }, session); }
    catch { throw new AppError("Não foi possível iniciar a sessão pública do Contratos.gov.br.", 502, "EXTERNAL_BALANCE_UNAVAILABLE"); }
    if (!response.ok) throw new AppError(`Contratos.gov.br indisponível (HTTP ${response.status}).`, 502, "EXTERNAL_BALANCE_UNAVAILABLE");
    await response.arrayBuffer();
  }
  return session;
}

async function getPublicSession(forceRefresh = false) {
  if (!forceRefresh && publicSession && publicSession.expiresAt > Date.now()) return publicSession;
  if (!forceRefresh && publicSessionPromise) return publicSessionPromise;
  publicSessionPromise = createPublicSession();
  try { publicSession = await publicSessionPromise; return publicSession; }
  finally { publicSessionPromise = null; }
}

function looksLikeLoginPage(body: string) {
  return /id=["']transparencia["']/.test(body) && /acessogov\/autorizacao/.test(body);
}

export async function fetchText(url: string, init: RequestInit | undefined, session: PublicSession) {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await requestWithSession(url, init ?? {}, session);
    } catch (error) {
      if (attempt === 1) {
        if (error instanceof AppError) throw error;
        throw new AppError("Não foi possível conectar ao Contratos.gov.br.", 502, "EXTERNAL_BALANCE_UNAVAILABLE");
      }
      continue;
    }
    if (!RETRYABLE_STATUS.has(response.status) || attempt === 1) break;
    await response.arrayBuffer();
  }
  if (!response?.ok) throw new AppError(`Contratos.gov.br indisponível (HTTP ${response?.status ?? 502}).`, 502, "EXTERNAL_BALANCE_UNAVAILABLE");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new AppError("A resposta do Contratos.gov.br excedeu o limite de segurança.", 502, "EXTERNAL_BALANCE_TOO_LARGE");
  }
  if (looksLikeLoginPage(body)) {
    publicSession = null;
    throw new AppError("A sessão pública do Contratos.gov.br expirou.", 502, "EXTERNAL_BALANCE_SESSION_EXPIRED");
  }
  return body;
}

async function discoverAtaId(uasg: string, ataNumber: string, session: PublicSession) {
  const form = new URLSearchParams({ draw: "1", start: "0", length: "2000", "search[value]": uasg, "search[regex]": "false" });
  const raw = await fetchText(`${SOURCE}/transparencia/transparencia/arp-item`, {
    method: "POST",
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
  }, session);
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
  private async loadStoredBalance(ataId: string, itemId?: string): Promise<ExternalAtaBalance | null> {
    const ata = await prisma.ata.findUnique({
      where: { id: ataId },
      select: {
        number: true,
        externalUasg: true,
        externalPregaoNumber: true,
        externalPregaoYear: true,
        externalAtaNumber: true,
        externalPncpControlNumber: true,
        externalContratosAtaId: true,
        items: {
          where: { deletedAt: null, ...(itemId ? { id: itemId } : {}) },
          orderBy: { ataItemCode: "asc" },
          select: {
            id: true,
            referenceCode: true,
            description: true,
            unit: true,
            externalItemNumber: true,
            externalBalanceSnapshot: true,
          },
        },
      },
    });
    if (!ata?.externalUasg || !ata.externalPregaoNumber || !ata.externalPregaoYear) return null;
    const storedItems = ata.items.flatMap((item) => {
      const snapshot = item.externalBalanceSnapshot;
      if (!snapshot) return [];
      const raw = snapshot.rawSnapshot && typeof snapshot.rawSnapshot === "object" && !Array.isArray(snapshot.rawSnapshot)
        ? snapshot.rawSnapshot as Record<string, unknown>
        : {};
      return [{
        ataItemId: item.id,
        itemNumber: snapshot.externalItemNumber || item.externalItemNumber || item.referenceCode,
        referenceCode: item.referenceCode,
        description: item.description,
        unit: item.unit,
        managerRegisteredQuantity: snapshot.managerRegisteredQuantity?.toString() ?? null,
        managerCommittedQuantity: snapshot.managerCommittedQuantity?.toString() ?? null,
        managerAvailableQuantity: snapshot.managerAvailableQuantity?.toString() ?? null,
        publishedTotalRegisteredAuthorized: snapshot.publishedTotalRegisteredAuthorized.toString(),
        publishedTotalAvailableForCommitment: snapshot.publishedTotalAvailableForCommitment.toString(),
        publishedAdhesionLimit: snapshot.publishedAdhesionLimit.toString(),
        publishedAvailableForAdhesion: snapshot.publishedAvailableForAdhesion.toString(),
        allocations: Array.isArray(raw.allocations) ? raw.allocations as PublicAllocation[] : [],
        units: Array.isArray(raw.units) ? raw.units as PublicUnitBalance[] : [],
        commitments: Array.isArray(raw.commitments) ? raw.commitments as PublicCommitment[] : [],
        detailUrl: snapshot.sourceUrl,
        checkedAt: snapshot.checkedAt,
      }];
    });
    if (!storedItems.length) return null;
    const checkedAt = storedItems.reduce((latest, item) => item.checkedAt > latest ? item.checkedAt : latest, storedItems[0]!.checkedAt);
    const contratosAtaId = ata.externalContratosAtaId ?? "";
    return {
      source: "CONTRATOS_GOV_TRANSPARENCIA",
      sourceLabel: "Contratos.gov.br",
      sourceUrl: `${SOURCE}/transparencia/arp-item`,
      checkedAt: checkedAt.toISOString(),
      sourceUpdatedAt: null,
      retrieval: "SNAPSHOT_FALLBACK",
      identity: {
        ataNumber: ata.externalAtaNumber || ata.number,
        uasg: ata.externalUasg,
        pregaoNumber: ata.externalPregaoNumber,
        pregaoYear: ata.externalPregaoYear,
        pncpControlNumber: ata.externalPncpControlNumber,
        contratosAtaId,
      },
      items: storedItems.map(({ checkedAt: _checkedAt, ...item }) => item),
      warnings: [
        `O Contratos.gov.br está temporariamente indisponível. Exibindo o último snapshot salvo em ${checkedAt.toLocaleString("pt-BR", { timeZone: "America/Manaus" })}.`,
      ],
    };
  }

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
    session: PublicSession,
  ) {
    const ataNumber = ata.externalAtaNumber || ata.number;
    const validateCandidate = async (candidateId: string) => {
      const html = await fetchText(`${SOURCE}/transparencia/arpshow/itens/${item.itemNumber}/${candidateId}/show`, undefined, session);
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

    const candidateIds = await discoverAtaId(ata.externalUasg!, ataNumber, session);
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

  private async queryAtaBalance(ataId: string, itemId?: string, forceRefresh = false) {
    const cached = !itemId && !forceRefresh ? cache.get(ataId) : undefined;
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const [ata, session] = await Promise.all([this.loadAta(ataId, itemId), getPublicSession(forceRefresh)]);
    const ataNumber = ata.externalAtaNumber || ata.number;
    const mappedItems = ata.items
      .filter((item) => /^\d+$/.test(item.externalItemNumber ?? ""))
      .map((item) => ({ ...item, itemNumber: item.externalItemNumber!.padStart(5, "0") }));
    if (!mappedItems.length) throw new AppError("Nenhum item da ATA possui vínculo com o Compras.gov.br.", 422, "EXTERNAL_BALANCE_ITEMS_NOT_CONFIGURED");

    const { contratosAtaId, firstHtml } = await this.resolvePublicAta(ataId, ata, mappedItems[0]!, session);

    const firstItemId = mappedItems[0]!.id;
    const items = await mapWithConcurrency(mappedItems, 2, async (item) => {
      const html = item.id === firstItemId ? firstHtml : await fetchText(`${SOURCE}/transparencia/arpshow/itens/${item.itemNumber}/${contratosAtaId}/show`, undefined, session);
      return parseExternalBalanceItem(html, { ...item, ataNumber, uasg: ata.externalUasg!, pregaoNumber: ata.externalPregaoNumber!, pregaoYear: ata.externalPregaoYear!, contratosAtaId: contratosAtaId!, ataItemId: item.id });
    });
    const warnings = ata.items.length === mappedItems.length ? [] : [`${ata.items.length - mappedItems.length} item(ns) sem vínculo externo não foram consultados.`];
    const value: ExternalAtaBalance = {
      source: "CONTRATOS_GOV_TRANSPARENCIA", sourceLabel: "Contratos.gov.br",
      sourceUrl: `${SOURCE}/transparencia/arp-item`, checkedAt: new Date().toISOString(), sourceUpdatedAt: null, retrieval: "LIVE",
      identity: { ataNumber, uasg: ata.externalUasg!, pregaoNumber: ata.externalPregaoNumber!, pregaoYear: ata.externalPregaoYear!, pncpControlNumber: ata.externalPncpControlNumber, contratosAtaId },
      items, warnings,
    };
    if (!itemId) cache.set(ataId, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  async getAtaBalance(ataId: string) {
    try { return await this.queryAtaBalance(ataId); }
    catch (error) {
      if (!(error instanceof AppError) || error.statusCode < 500) throw error;
      const stored = await this.loadStoredBalance(ataId);
      if (stored) return stored;
      throw error;
    }
  }

  async getItemBalance(itemId: string) {
    const item = await prisma.ataItem.findUnique({ where: { id: itemId }, select: { ataId: true, deletedAt: true } });
    if (!item || item.deletedAt) throw new AppError("Item da ata não encontrado", 404);
    try { return await this.queryAtaBalance(item.ataId, itemId); }
    catch (error) {
      if (!(error instanceof AppError) || error.statusCode < 500) throw error;
      const stored = await this.loadStoredBalance(item.ataId, itemId);
      if (stored) return stored;
      throw error;
    }
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
    return this.importBalance(await this.queryAtaBalance(ataId, undefined, true), actor);
  }

  async importItemBalance(itemId: string, actor: BalanceActor) {
    const item = await prisma.ataItem.findUnique({ where: { id: itemId }, select: { ataId: true, deletedAt: true } });
    if (!item || item.deletedAt) throw new AppError("Item da ata não encontrado", 404);
    return this.importBalance(await this.queryAtaBalance(item.ataId, itemId, true), actor);
  }

  private async applyOpeningBalance(result: ExternalAtaBalance, actor: BalanceActor, reason: string) {
    const settings = await systemSettingsService.getEffective();
    if (!settings.implantationModeActive || !settings.implantationCutoffAt) {
      throw new AppError("Ative o modo de implantação antes de aplicar um saldo de abertura.", 409, "IMPLANTATION_MODE_REQUIRED");
    }

    const itemIds = result.items.map((item) => item.ataItemId);
    const [items, consumedMovements] = await Promise.all([
      prisma.ataItem.findMany({
        where: { id: { in: itemIds }, deletedAt: null },
        select: { id: true, referenceCode: true, initialQuantity: true },
      }),
      prisma.ataItemBalanceMovement.findMany({
        where: { ataItemId: { in: itemIds }, movementType: { in: ["CONSUME", "REVERSE_CONSUME"] } },
        select: { ataItemId: true },
        distinct: ["ataItemId"],
      }),
    ]);
    if (consumedMovements.length) {
      throw new AppError(
        "O saldo de abertura não pode ser reaplicado depois que o SAGEP registrou consumos nos itens selecionados.",
        409,
        "OPENING_BALANCE_HAS_OPERATIONAL_CONSUMPTION",
        { ataItemIds: consumedMovements.map((movement) => movement.ataItemId) },
      );
    }

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const checkedAt = new Date(result.checkedAt);
    const appliedAt = new Date();
    const applications = result.items.map((official) => {
      const item = itemsById.get(official.ataItemId);
      if (!item) throw new AppError("Item da ATA não encontrado para o saldo de abertura", 404);
      if (official.managerAvailableQuantity == null) {
        throw new AppError(
          `O item ${item.referenceCode} não possui saldo disponível da UASG na consulta oficial.`,
          409,
          "OPENING_BALANCE_OFFICIAL_VALUE_MISSING",
        );
      }
      const initial = new Prisma.Decimal(item.initialQuantity);
      const available = new Prisma.Decimal(official.managerAvailableQuantity);
      const historicalConsumed = initial.sub(available).toDecimalPlaces(5);
      if (historicalConsumed.lessThan(0)) {
        throw new AppError(
          `O saldo oficial do item ${item.referenceCode} é superior à quantidade inicial cadastrada.`,
          409,
          "OPENING_BALANCE_IDENTITY_MISMATCH",
        );
      }
      return { item, official, historicalConsumed };
    });

    if (result.retrieval === "LIVE") await this.importBalance(result, actor);
    await prisma.$transaction(applications.map(({ item, historicalConsumed }) => prisma.ataItem.update({
      where: { id: item.id },
      data: {
        openingConsumedQuantity: historicalConsumed,
        openingBalanceAppliedAt: appliedAt,
        openingBalanceCheckedAt: checkedAt,
        openingBalanceReason: reason,
        openingBalanceAppliedById: actor.id,
      },
    })));
    await Promise.all(applications.map(({ item, official, historicalConsumed }) => auditService.log({
      entityType: "ATA_ITEM",
      entityId: item.id,
      action: "UPDATE",
      actor: { id: actor.id, name: actor.name ?? actor.email ?? null },
      summary: `Saldo de abertura aplicado ao item ${item.referenceCode}`,
      after: {
        initialQuantity: item.initialQuantity.toString(),
        openingConsumedQuantity: historicalConsumed.toString(),
        operationalAvailableQuantity: official.managerAvailableQuantity,
        checkedAt: result.checkedAt,
      },
      metadata: {
        reason,
        sourceUrl: official.detailUrl,
        implantationCutoffAt: settings.implantationCutoffAt,
        appliedFrom: result.retrieval === "LIVE" ? "LIVE_QUERY" : "SAVED_SNAPSHOT",
        snapshotCheckedAt: result.checkedAt,
      },
    })));

    return {
      ...result,
      openingBalance: {
        appliedAt: appliedAt.toISOString(),
        itemsApplied: applications.length,
        operationalBalanceChanged: true,
        appliedFrom: result.retrieval === "LIVE" ? "LIVE_QUERY" : "SAVED_SNAPSHOT",
      },
    };
  }

  async applyAtaOpeningBalance(ataId: string, actor: BalanceActor, reason: string, source: OpeningBalanceSource = "LIVE") {
    const result = source === "SAVED_SNAPSHOT"
      ? await this.loadStoredBalance(ataId)
      : await this.queryAtaBalance(ataId, undefined, true);
    if (!result) {
      throw new AppError(
        "Nenhum snapshot de saldo foi salvo para esta ATA.",
        409,
        "OPENING_BALANCE_SNAPSHOT_REQUIRED",
      );
    }
    return this.applyOpeningBalance(result, actor, reason);
  }

  async applyItemOpeningBalance(itemId: string, actor: BalanceActor, reason: string, source: OpeningBalanceSource = "LIVE") {
    const item = await prisma.ataItem.findUnique({ where: { id: itemId }, select: { ataId: true, deletedAt: true } });
    if (!item || item.deletedAt) throw new AppError("Item da ata não encontrado", 404);
    const result = source === "SAVED_SNAPSHOT"
      ? await this.loadStoredBalance(item.ataId, itemId)
      : await this.queryAtaBalance(item.ataId, itemId, true);
    if (!result) {
      throw new AppError(
        "Nenhum snapshot de saldo foi salvo para este item.",
        409,
        "OPENING_BALANCE_SNAPSHOT_REQUIRED",
      );
    }
    return this.applyOpeningBalance(result, actor, reason);
  }
}

export const contratosGovBalanceService = new ContratosGovBalanceService();
