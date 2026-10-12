import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { isValidNfeAccessKey } from "./nfe-xml.service.js";
import { nfeDistributionClient, type OfficialNfeResult } from "./nfe-distribution.client.js";

type User = { id: string; email: string; name?: string; role: string };
export const nfeOfficialLookupSchema = z.object({ projectId: z.string().min(1), commitmentNoteId: z.string().min(1), accessKey: z.string().regex(/^\d{44}$/).refine(isValidNfeAccessKey, "Chave de acesso inválida") }).strict();
export const nfeOfficialImportSchema = z.object({ consultationId: z.string().min(1), confirmed: z.literal(true), documentLink: z.string().url().optional(), notes: z.string().trim().max(2000).optional() }).strict();
const projectsService = new ProjectsService();
const MAX_AGE_MS = 15 * 60_000;

export function officialConference(result: OfficialNfeResult, note: { supplierCnpj: string | null; currentAmount: unknown }) {
  const divergences: string[] = [];
  if (result.summary && note.supplierCnpj?.replace(/\D/g, "") !== result.summary.supplierCnpj) divergences.push("CNPJ da NF-e difere do favorecido da NE ou o favorecido não foi informado.");
  if (result.summary && result.summary.grossAmount > Number(note.currentAmount) + 0.01) divergences.push("Valor da NF-e supera o valor atual da NE.");
  if (["CANCELLED", "DENIED"].includes(result.fiscalStatus)) divergences.push(result.fiscalStatus === "CANCELLED" ? "NF-e cancelada na informação retornada pela SEFAZ." : "Uso da NF-e denegado.");
  return { divergences, conferenceStatus: divergences.length ? "DIVERGENT" as const : result.documentKind === "FULL_XML" && result.summary?.hasXmlSignature ? "CONFERRED" as const : "PENDING" as const };
}

class NfeOfficialService {
  async configuration() { return nfeDistributionClient.configuration(); }
  private async note(projectId: string, id: string, user: User) {
    await projectsService.findById(projectId, user);
    const note = await prisma.commitmentNote.findUnique({ where: { id } });
    if (!note || note.projectId !== projectId) throw new AppError("A NE não pertence ao projeto", 409, "INVOICE_COMMITMENT_MISMATCH");
    return note;
  }
  private async preview(id: string, result: OfficialNfeResult, note: { supplierCnpj: string | null; currentAmount: unknown }) {
    const duplicate = await prisma.invoice.findUnique({ where: { accessKey: result.summary?.accessKey ?? "" }, select: { id: true, invoiceCode: true } });
    return { ...result, consultationId: id, ...officialConference(result, note), duplicate, importAllowed: Boolean(result.summary) && result.environment === "PRODUCTION" && !duplicate && !["CANCELLED", "DENIED"].includes(result.fiscalStatus) };
  }
  async consult(input: z.infer<typeof nfeOfficialLookupSchema>, user: User) {
    const note = await this.note(input.projectId, input.commitmentNoteId, user);
    const configuration = nfeDistributionClient.configuration();
    if (!configuration.configured) throw new AppError(configuration.message, 503, "NFE_NOT_CONFIGURED");
    const cached = await prisma.nfeOfficialConsultation.findFirst({ where: { ...input, environment: env.NFE_ENVIRONMENT, interestedCnpj: env.NFE_INTERESTED_CNPJ, queriedAt: { gte: new Date(Date.now() - MAX_AGE_MS) } }, orderBy: { queriedAt: "desc" } });
    if (cached) return { ...await this.preview(cached.id, cached.result as unknown as OfficialNfeResult, note), cached: true };
    const stateId = `${env.NFE_ENVIRONMENT}:${env.NFE_INTERESTED_CNPJ}`;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${stateId}))`;
      const state = await tx.nfeDistributionState.findUnique({ where: { id: stateId } });
      if (state?.blockedUntil && state.blockedUntil.getTime() > Date.now()) throw new AppError("Aguarde a janela obrigatória da SEFAZ antes de uma nova consulta", 429, "NFE_QUERY_COOLDOWN", { retryAt: state.blockedUntil.toISOString() });
      if (state?.busyUntil && state.busyUntil.getTime() > Date.now()) throw new AppError("Outra consulta fiscal está em andamento", 409, "NFE_QUERY_BUSY");
      await tx.nfeDistributionState.upsert({ where: { id: stateId }, create: { id: stateId, busyUntil: new Date(Date.now() + 90_000) }, update: { busyUntil: new Date(Date.now() + 90_000) } });
    });
    let result: OfficialNfeResult;
    try { result = await nfeDistributionClient.consult(input.accessKey); }
    catch (error) { await prisma.nfeDistributionState.update({ where: { id: stateId }, data: { busyUntil: null, blockedUntil: new Date(Date.now() + 30_000) } }); throw error; }
    const blockedUntil = ["137", "656"].includes(result.statusCode) ? new Date(Date.now() + 3_600_000) : null;
    const record = await prisma.$transaction(async (tx) => {
      await tx.nfeDistributionState.update({ where: { id: stateId }, data: { busyUntil: null, blockedUntil } });
      return tx.nfeOfficialConsultation.create({ data: { ...input, environment: env.NFE_ENVIRONMENT, interestedCnpj: env.NFE_INTERESTED_CNPJ, requestedById: user.id, result } });
    });
    await auditService.log({ entityType: "INVOICE", entityId: record.id, action: "CREATE", actor: { id: user.id, name: user.name ?? user.email }, summary: "Consulta ao serviço oficial de distribuição de NF-e", after: { projectId: input.projectId, source: "SEFAZ", statusCode: result.statusCode, documentKind: result.documentKind, queriedAt: result.queriedAt } });
    if (result.statusCode !== "138") throw new AppError(result.statusCode === "137" ? "Nenhum documento disponível para este interessado; aguarde uma hora ou importe o XML autorizado" : result.statusCode === "656" ? "A SEFAZ aplicou restrição de consumo; aguarde uma hora" : "A SEFAZ não disponibilizou a NF-e. Verifique autorização, certificado e prazo de consulta", result.statusCode === "656" ? 429 : 422, "NFE_NOT_AVAILABLE", { statusCode: result.statusCode, retryAt: blockedUntil?.toISOString() });
    return { ...await this.preview(record.id, result, note), cached: false };
  }
  async import(input: z.infer<typeof nfeOfficialImportSchema>, user: User) {
    const record = await prisma.nfeOfficialConsultation.findUnique({ where: { id: input.consultationId } });
    if (!record) throw new AppError("Consulta fiscal não encontrada", 404, "NFE_CONSULTATION_NOT_FOUND");
    const note = await this.note(record.projectId, record.commitmentNoteId, user);
    if (Date.now() - record.queriedAt.getTime() > MAX_AGE_MS) throw new AppError("A prévia expirou. Consulte a chave novamente antes de importar", 409, "NFE_PREVIEW_EXPIRED");
    const result = record.result as unknown as OfficialNfeResult;
    const preview = await this.preview(record.id, result, note);
    if (!preview.importAllowed || !result.summary) throw new AppError("A NF-e não está disponível para importação", 409, "NFE_IMPORT_NOT_ALLOWED");
    const summary = result.summary;
    const invoice = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${summary.accessKey}))`;
      const currentNote = await tx.commitmentNote.findUnique({ where: { id: record.commitmentNoteId } });
      if (!currentNote || currentNote.projectId !== record.projectId) throw new AppError("O vínculo da NE mudou. Consulte novamente", 409, "INVOICE_COMMITMENT_MISMATCH");
      const currentConference = officialConference(result, currentNote);
      const duplicate = await tx.invoice.findFirst({ where: { OR: [{ accessKey: summary.accessKey }, { number: summary.number, series: summary.series, supplierCnpj: summary.supplierCnpj }] } });
      if (duplicate) throw new AppError("Esta NF-e já está registrada", 409, "INVOICE_ALREADY_REGISTERED");
      return tx.invoice.create({ data: { projectId: record.projectId, commitmentNoteId: record.commitmentNoteId, number: summary.number, series: summary.series, accessKey: summary.accessKey, supplierCnpj: summary.supplierCnpj, issuedAt: new Date(summary.issuedAt), grossAmount: summary.grossAmount, issuerName: summary.issuerName, recipientCnpj: summary.recipientCnpj, itemCount: result.documentKind === "FULL_XML" ? summary.itemCount : null, xmlChecksumSha256: summary.xmlChecksumSha256 || null, source: "SEFAZ", conferenceStatus: currentConference.conferenceStatus, conferenceDetails: { source: "SEFAZ", consultationId: record.id, queriedAt: result.queriedAt, environment: result.environment, documentKind: result.documentKind, fiscalStatus: result.fiscalStatus, warnings: result.warnings, divergences: currentConference.divergences, cryptographicXmlValidation: "NOT_PERFORMED" }, documentLink: input.documentLink, notes: input.notes, registeredById: user.id } });
    });
    await auditService.log({ entityType: "INVOICE", entityId: invoice.id, action: "CREATE", actor: { id: user.id, name: user.name ?? user.email }, summary: "NF-e importada da SEFAZ após confirmação do fiscal, sem atesto automático", after: { source: "SEFAZ", consultationId: record.id, conferenceStatus: invoice.conferenceStatus } });
    return { ...preview, invoice: { ...invoice, grossAmount: Number(invoice.grossAmount) } };
  }
}
export const nfeOfficialService = new NfeOfficialService();
