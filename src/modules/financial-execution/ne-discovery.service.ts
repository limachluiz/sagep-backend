import { resolvePncpSupplier } from "./supplier-pncp.client.js";
import { ComprasGovService } from "../compras-gov/compras-gov.service.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { systemSettingsService } from "../system-settings/system-settings.service.js";
import { fetchPortalJson } from "./portal-transparencia.client.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Data inválida");
export const discoveryPageSchema = z.object({
  pregaoIds: z.array(z.string().min(1)).min(1).max(50),
  ataIds: z.array(z.string().min(1)).min(1).max(200).optional(),
  cnpj: z.string().regex(/^\d{14}$/),
  ug: z.string().regex(/^\d{6}$/),
  startDate: date, endDate: date,
  year: z.number().int().min(2000).max(2100),
  page: z.number().int().min(1).max(10000),
}).refine(v => v.startDate <= v.endDate, "Intervalo inválido")
  .refine(v => v.year >= Number(v.startDate.slice(0, 4)) && v.year <= Number(v.endDate.slice(0, 4)), "Ano fora do intervalo");

export function filterDiscoveryRows(rows: Record<string, unknown>[], start: string, end: string) {
  const items: Record<string, unknown>[] = [];
  let missingDates = 0;
  for (const row of rows) {
    const raw = String(row.data ?? "");
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const date = match ? `${match[3]}-${match[2]}-${match[1]}` : raw.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      missingDates++; items.push({ ...row, dateUnverified: true });
    } else if (date >= start && date <= end) items.push(row);
  }
  return { items, missingDates };
}

export async function discoveryOptions() {
  const [settings, pregoes] = await Promise.all([
    systemSettingsService.getEffective(),
    prisma.pregao.findMany({ orderBy: [{ year: "desc" }, { number: "asc" }], select: {
      id: true, number: true, year: true, uasg: true, type: true,
      atas: { select: { id: true, number: true, vendorName: true, vendorCnpj: true, validFrom: true, validUntil: true } },
    } }),
  ]);
  return { defaultUg: settings.uasg, pregoes };
}

export async function discoveryPage(input: z.infer<typeof discoveryPageSchema>) {
  const atas = await prisma.ata.findMany({ where: { pregaoId: { in: input.pregaoIds }, ...(input.ataIds && { id: { in: input.ataIds } }) }, select: { vendorCnpj: true } });
  if (!atas.some(a => a.vendorCnpj?.replace(/\D/g, "") === input.cnpj)) throw new AppError("Fornecedor não pertence aos pregões selecionados", 400, "DISCOVERY_SUPPLIER_INVALID");
  const token = await systemSettingsService.getPortalApiToken();
  if (!token) throw new AppError("Configure o token do Portal da Transparência nas integrações", 503, "PORTAL_TRANSPARENCIA_NOT_CONFIGURED");
  const settings = await systemSettingsService.getEffective();
  const url = new URL(`${settings.portalTransparenciaBaseUrl.replace(/\/$/, "")}/despesas/documentos-por-favorecido`);
  Object.entries({ codigoPessoa: input.cnpj, ug: input.ug, ano: input.year, fase: 1, pagina: input.page, ordenacaoResultado: 3 }).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const payload = await fetchPortalJson(url.toString(), token, "Portal não confirmou a página (resposta ausente ou HTTP 404); a consulta permanece incompleta", { allowEmptyArray: true });
  if (!Array.isArray(payload) || payload.some(v => !v || typeof v !== "object" || Array.isArray(v))) throw new AppError("Formato inesperado na busca de NEs", 502, "DISCOVERY_INVALID_RESPONSE");
  return { ...filterDiscoveryRows(payload, input.startDate, input.endDate), exhausted: payload.length === 0,
    fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), source: "Portal da Transparência", fetchedAt: new Date().toISOString() };
}

export async function discoveryDocuments(code: string) {
  if (!/^\d{11}\d{4}NE\d{6}$/.test(code)) throw new AppError("Código de NE inválido", 400, "INVALID_NE");
  const token = await systemSettingsService.getPortalApiToken();
  if (!token) throw new AppError("Token não configurado", 503, "PORTAL_TRANSPARENCIA_NOT_CONFIGURED");
  const settings = await systemSettingsService.getEffective();
  const base = settings.portalTransparenciaBaseUrl.replace(/\/$/, "");
  const document = await fetchPortalJson(`${base}/despesas/documentos/${code}`, token, "Documento não localizado");
  const related = await fetchPortalJson(`${base}/despesas/documentos-relacionados?codigoDocumento=${code}&fase=1`, token, "Documentos relacionados indisponíveis", { allowEmptyArray: true });
  return { document, related, fetchedAt: new Date().toISOString() };
}

export function supplierCnpjFromSnapshots(snapshots: unknown[], vendorName: string): string | null {
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const candidates = new Set<string>();
  for (const raw of snapshots) {
    if (!raw || typeof raw !== "object") continue;
    const commitments = (raw as { commitments?: unknown }).commitments;
    if (!Array.isArray(commitments)) continue;
    for (const commitment of commitments) {
      if (typeof commitment?.supplier !== "string") continue;
      const supplier = commitment.supplier as string;
      const match = supplier.match(/^(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\s*[-–:]\s*(.+)$/);
      if (match && normalize(match[2]!) === normalize(vendorName)) candidates.add(match[1]!.replace(/\D/g, ""));
    }
  }
  return candidates.size === 1 ? [...candidates][0]! : null;
}

export async function resolveAtaCnpj(id: string) {
  const ata = await prisma.ata.findUnique({ where: { id } });
  if (!ata) throw new AppError("ATA não encontrada", 404);
  if (ata.vendorCnpj && /^\d{14}$/.test(ata.vendorCnpj.replace(/\D/g, ""))) return { cnpj: ata.vendorCnpj, updated: false };
  const snapshots = await prisma.ataItemExternalBalanceSnapshot.findMany({ where: { ataItem: { ataId: id }, source: "CONTRATOS_GOV_TRANSPARENCIA" }, select: { rawSnapshot: true } });
  const savedCnpj = supplierCnpjFromSnapshots(snapshots.map(s => s.rawSnapshot), ata.vendorName);
  if (savedCnpj) {
    const result = await prisma.ata.updateMany({ where: { id, vendorCnpj: ata.vendorCnpj }, data: { vendorCnpj: savedCnpj } });
    return { cnpj: savedCnpj, updated: result.count === 1, source: "Consulta oficial de saldo salva" };
  }
  if (ata.externalPncpControlNumber) {
    const [settings, items] = await Promise.all([
      systemSettingsService.getEffective(),
      prisma.ataItem.findMany({ where: { ataId: id }, select: { externalItemNumber: true } }),
    ]);
    const result = await resolvePncpSupplier(settings.pncpBaseUrl, ata.externalPncpControlNumber,
      items.flatMap(item => item.externalItemNumber ? [item.externalItemNumber] : []), ata.vendorName);
    const saved = await prisma.ata.updateMany({ where: { id, vendorCnpj: ata.vendorCnpj }, data: { vendorCnpj: result.cnpj } });
    if (!saved.count) throw new AppError("Cadastro alterado durante a consulta; atualize a tela para conferir o CNPJ", 409);
    return { ...result, updated: true };
  }
  if (!ata.externalUasg || !ata.externalPregaoNumber || !ata.externalPregaoYear || !ata.externalAtaNumber) {
    throw new AppError("ATA sem identificação de origem suficiente para consultar o CNPJ automaticamente", 422);
  }
  const cnpj = await new ComprasGovService().resolveAtaSupplier({ uasg: ata.externalUasg, numeroPregao: ata.externalPregaoNumber, anoPregao: ata.externalPregaoYear, numeroAta: ata.externalAtaNumber }, ata.vendorName);
  // Preserve a concurrent manual correction and never change quantities or prices.
  const result = await prisma.ata.updateMany({ where: { id, vendorCnpj: ata.vendorCnpj }, data: { vendorCnpj: cnpj } });
  return { cnpj, updated: result.count === 1, source: "Compras.gov.br" };
}
