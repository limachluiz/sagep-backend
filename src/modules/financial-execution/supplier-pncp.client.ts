import { AppError } from "../../shared/app-error.js";

type Result = { niFornecedor?: string; nomeRazaoSocialFornecedor?: string; tipoPessoa?: string; dataCancelamento?: string | null; situacaoCompraItemResultadoId?: number };
const cache = new Map<string, { expires: number; value: Promise<Result[]> }>();
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function uniqueSupplier(results: Result[], name: string) {
  const matches = new Set(results.filter(r => r.tipoPessoa === "PJ" && !r.dataCancelamento && r.situacaoCompraItemResultadoId === 1 && normalize(r.nomeRazaoSocialFornecedor ?? "") === normalize(name))
    .map(r => String(r.niFornecedor ?? "").replace(/\D/g, "")).filter(c => /^\d{14}$/.test(c)));
  if (matches.size > 1) throw new AppError("PNCP retornou CNPJs diferentes para o mesmo nome; confira o fornecedor", 422);
  return matches.size === 1 ? [...matches][0]! : null;
}

async function itemResults(url: string, signal: AbortSignal): Promise<Result[]> {
  const now = Date.now();
  const existing = cache.get(url);
  if (existing && existing.expires > now) return existing.value;
  // Bounded, short-lived cache. Errors are not retained.
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  const entry = { expires: now + 5 * 60_000, value: Promise.resolve([] as Result[]) };
  entry.value = (async () => {
    const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error", signal });
    if (!response.ok) throw new AppError(`PNCP respondeu HTTP ${response.status} ao consultar fornecedor`, 502);
    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.some(r => !r || typeof r !== "object")) throw new AppError("Resposta de fornecedores PNCP inválida", 502);
    return data as Result[];
  })().catch(error => { if (cache.get(url) === entry) cache.delete(url); throw error; });
  cache.set(url, entry);
  return entry.value;
}

export async function resolvePncpSupplier(base: string, control: string, items: string[], name: string) {
  const match = control.match(/^(\d{14})-1-(\d+)\/(\d{4})(?:-\d+)?$/);
  const numbers = [...new Set(items.filter(n => /^\d+$/.test(n) && Number(n) > 0).map(Number))];
  if (!match || !numbers.length) throw new AppError("Faltam controle PNCP ou números oficiais dos itens da ATA", 422);
  if (numbers.length > 100) throw new AppError("ATA excede o limite de 100 itens para recuperação automática nesta consulta", 422);
  // The legacy default points to the portal alias; use the public API on the same official host.
  const root = base.replace(/\/$/, "").replace(/^https:\/\/pncp.gov.br\/api\/pncp$/, "https://pncp.gov.br/pncp-api");
  const prefix = `${root}/v1/orgaos/${match[1]}/compras/${match[3]}/${Number(match[2])}/itens`;
  const signal = AbortSignal.timeout(20_000);
  let cnpj: string | null = null;
  let sourceUrl = prefix;
  try {
    // One official item can identify the supplier. Stop once its complete result
    // confirms a unique active CNPJ, rather than downloading the whole ATA.
    for (const number of numbers) {
      signal.throwIfAborted();
      const url = `${prefix}/${number}/resultados`;
      cnpj = uniqueSupplier(await itemResults(url, signal), name);
      if (cnpj) { sourceUrl = url; break; }
    }
  } catch (error) {
    if (signal.aborted) throw new AppError("PNCP excedeu 20 segundos; tente novamente. Resultados já consultados ficam em cache temporário", 504);
    throw error;
  }
  if (!cnpj) throw new AppError("Fornecedor não localizado nos resultados oficiais dos itens desta ATA", 422);
  return { cnpj, source: "PNCP — resultados dos itens", sourceUrl, checkedAt: new Date().toISOString() };
}
