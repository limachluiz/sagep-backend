import { ProjectsService } from "../projects/projects.service.js";
import { validatePdfSignatures } from "./pdf-signature-validation.service.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";

type CurrentUser = { id: string; name?: string; email: string; role: string };
type GeneratedDocumentInput = { entityType: string; entityId: string; documentType: string; filename: string; buffer: Buffer; actor: CurrentUser; reason?: string };
const MAX_SIGNED_DOCUMENT_BYTES = 25 * 1024 * 1024;
const DOCUMENTS_FOLDER = "document-versions";

function checksum(buffer: Buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function safeFilename(value: string) { return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || "documento.pdf"; }
function publicVersion<T extends { storageKey: string }>(item: T) { const { storageKey: _storageKey, ...version } = item; return version; }

class DocumentVersionsService {
  private async authorize(entityType: string, entityId: string, actor: CurrentUser) {
    let projectId: string | undefined;
    if (entityType === "PROJECT") projectId = entityId;
    else if (entityType === "ESTIMATE") projectId = (await prisma.estimate.findUnique({ where: { id: entityId }, select: { projectId: true } }))?.projectId;
    else if (entityType === "DIEX_REQUEST") projectId = (await prisma.diexRequest.findUnique({ where: { id: entityId }, select: { projectId: true } }))?.projectId;
    else if (entityType === "SERVICE_ORDER") projectId = (await prisma.serviceOrder.findUnique({ where: { id: entityId }, select: { projectId: true } }))?.projectId;
    if (!projectId) throw new AppError("Documento não disponível neste contexto", 404, "DOCUMENT_VERSION_NOT_FOUND");
    await new ProjectsService().findById(projectId, actor);
  }

  private baseDirectory() { return path.resolve(env.EVIDENCE_DIRECTORY, DOCUMENTS_FOLDER); }

  private async store(buffer: Buffer, filename: string) {
    await mkdir(this.baseDirectory(), { recursive: true, mode: 0o700 });
    const storageKey = `${DOCUMENTS_FOLDER}/${randomUUID()}-${safeFilename(filename)}`;
    await writeFile(path.resolve(env.EVIDENCE_DIRECTORY, storageKey), buffer, { mode: 0o600, flag: "wx" });
    return storageKey;
  }

  async recordGenerated(input: GeneratedDocumentInput) {
    const checksumSha256 = checksum(input.buffer);
    const latest = await prisma.documentVersion.findFirst({ where: { entityType: input.entityType, entityId: input.entityId, documentType: input.documentType, originalVersionId: null }, orderBy: { version: "desc" } });
    if (latest?.checksumSha256 === checksumSha256 && !latest.invalidatedAt) return latest;
    const storageKey = await this.store(input.buffer, input.filename);
    const created = await prisma.documentVersion.create({ data: { entityType: input.entityType, entityId: input.entityId, documentType: input.documentType, version: (latest?.version ?? 0) + 1, filename: safeFilename(input.filename), storageKey, checksumSha256, sizeBytes: input.buffer.byteLength, generatedById: input.actor.id, reason: input.reason } });
    await auditService.log({ entityType: "DOCUMENT_VERSION", entityId: created.id, action: "CREATE", actor: { id: input.actor.id, name: input.actor.name ?? input.actor.email }, summary: `${input.documentType} v${created.version} preservado com integridade SHA-256`, after: { entityType: input.entityType, entityId: input.entityId, version: created.version, checksumSha256 } });
    return created;
  }

  async list(filters: { entityType: string; entityId: string; documentType?: string }, actor: CurrentUser) {
    await this.authorize(filters.entityType, filters.entityId, actor);
    const items = await prisma.documentVersion.findMany({ where: { entityType: filters.entityType, entityId: filters.entityId, ...(filters.documentType && { documentType: filters.documentType }) }, include: { generatedBy: { select: { id: true, name: true, email: true } } }, orderBy: [{ documentType: "asc" }, { version: "desc" }] });
    return items.map(publicVersion);
  }

  async download(id: string, actor: CurrentUser) {
    const version = await prisma.documentVersion.findUnique({ where: { id } });
    if (!version) throw new AppError("Versão documental não encontrada", 404, "DOCUMENT_VERSION_NOT_FOUND");
    await this.authorize(version.entityType, version.entityId, actor);
    const buffer = await readFile(path.resolve(env.EVIDENCE_DIRECTORY, version.storageKey)).catch(() => null);
    if (!buffer || checksum(buffer) !== version.checksumSha256) throw new AppError("A integridade do documento não pôde ser confirmada", 409, "DOCUMENT_VERSION_INTEGRITY_FAILED");
    return { version, buffer };
  }

  async registerSigned(originalId: string, input: { fileBase64: string; filename: string; signerName: string; signerDocument?: string; signatureProvider: string; signedAt?: Date; reason?: string }, actor: CurrentUser) {
    const original = await prisma.documentVersion.findUnique({ where: { id: originalId } });
    if (!original) throw new AppError("Versão original não encontrada", 404, "DOCUMENT_VERSION_NOT_FOUND");
    await this.authorize(original.entityType, original.entityId, actor);
    if (original.originalVersionId || original.invalidatedAt) throw new AppError("Selecione uma versão original ativa", 409, "DOCUMENT_VERSION_INVALIDATED");
    const buffer = Buffer.from(input.fileBase64.replace(/^data:application\/pdf;base64,/, ""), "base64");
    if (!buffer.length || buffer.length > MAX_SIGNED_DOCUMENT_BYTES || buffer.subarray(0, 5).toString() !== "%PDF-") throw new AppError("Informe um PDF assinado válido de até 25 MB", 422, "INVALID_SIGNED_DOCUMENT");
    const embeddedSignatureDetected = /\/Type\s*\/Sig\b|\/ByteRange\s*\[/.test(buffer.toString("latin1"));
    if (!embeddedSignatureDetected) throw new AppError("O PDF não contém uma assinatura digital detectável", 422, "PDF_SIGNATURE_NOT_DETECTED");
    const storageKey = await this.store(buffer, input.filename);
    const documentType = `${original.documentType}_SIGNED`;
    const latest = await prisma.documentVersion.findFirst({ where: { entityType: original.entityType, entityId: original.entityId, documentType }, orderBy: { version: "desc" } });
    const created = await prisma.documentVersion.create({ data: { entityType: original.entityType, entityId: original.entityId, documentType, version: (latest?.version ?? 0) + 1, filename: safeFilename(input.filename), storageKey, checksumSha256: checksum(buffer), sizeBytes: buffer.length, reason: input.reason, generatedById: actor.id, originalVersionId: original.id, signatureStatus: "PENDING_VALIDATION", signatureProvider: input.signatureProvider, signerName: input.signerName, signerDocument: input.signerDocument, signedAt: input.signedAt ?? new Date(), validationDetails: { embeddedSignatureDetected: true, cryptographicValidation: "NOT_PERFORMED" } } });
    await auditService.log({ entityType: "DOCUMENT_VERSION", entityId: created.id, action: "CREATE", actor: { id: actor.id, name: actor.name ?? actor.email }, summary: "Versão assinada registrada; validação criptográfica externa pendente", after: { originalVersionId: original.id, checksumSha256: created.checksumSha256, signatureProvider: input.signatureProvider } });
    return publicVersion(created);
  }

  async recordValidation(id: string, input: { status: "VALID" | "INVALID"; validator: string; validatedAt: Date; details: string }, actor: CurrentUser) {
    const current = await prisma.documentVersion.findUnique({ where: { id } });
    if (!current?.originalVersionId) throw new AppError("A versão informada não é um documento assinado", 409, "SIGNED_DOCUMENT_REQUIRED");
    const updated = await prisma.documentVersion.update({ where: { id }, data: { signatureStatus: input.status, validationDetails: { validator: input.validator, validatedAt: input.validatedAt.toISOString(), details: input.details, custody: "EXTERNAL_VALIDATION_WITHOUT_PRIVATE_KEY" } } });
    await auditService.log({ entityType: "DOCUMENT_VERSION", entityId: id, action: "UPDATE", actor: { id: actor.id, name: actor.name ?? actor.email }, summary: `Validação externa registrada como ${input.status}`, before: { signatureStatus: current.signatureStatus }, after: { signatureStatus: updated.signatureStatus, validator: input.validator } });
    return publicVersion(updated);
  }

  async validateAutomatically(id: string, actor: CurrentUser) {
    const { version, buffer } = await this.download(id, actor);
    if (!version.originalVersionId) throw new AppError("Selecione uma versão assinada do documento", 409, "SIGNED_DOCUMENT_REQUIRED");
    if (version.invalidatedAt) throw new AppError("Esta versão documental foi invalidada", 409, "DOCUMENT_VERSION_INVALIDATED");
    const result = await validatePdfSignatures(buffer);
    if (result.checksumSha256 !== version.checksumSha256) throw new AppError("Resultado de validação incompatível com o documento", 409, "DOCUMENT_VERSION_INTEGRITY_FAILED");
    // A revoked/modified signature is invalid. Missing trust/revocation data stays pending.
    const signatureStatus = result.status === "VALID" ? "VALID" : result.status === "INVALID" || result.status === "NOT_SIGNED" ? "INVALID" : "PENDING_VALIDATION";
    const updated = await prisma.documentVersion.update({ where: { id }, data: { signatureStatus, validationDetails: result } });
    await auditService.log({ entityType: "DOCUMENT_VERSION", entityId: id, action: "UPDATE", actor: { id: actor.id, name: actor.name ?? actor.email }, summary: `Validação criptográfica local: ${result.status}`, after: { signatureStatus, checksumSha256: result.checksumSha256, validator: result.validator, validatedAt: result.validatedAt } });
    return publicVersion(updated);
  }

  async invalidate(id: string, reason: string, actor: CurrentUser) {
    const current = await prisma.documentVersion.findUnique({ where: { id } });
    if (!current) throw new AppError("Versão documental não encontrada", 404, "DOCUMENT_VERSION_NOT_FOUND");
    if (current.invalidatedAt) throw new AppError("Esta versão já foi invalidada", 409, "DOCUMENT_VERSION_ALREADY_INVALIDATED");
    const updated = await prisma.documentVersion.update({ where: { id }, data: { invalidatedAt: new Date(), invalidationReason: reason } });
    await auditService.log({ entityType: "DOCUMENT_VERSION", entityId: id, action: "UPDATE", actor: { id: actor.id, name: actor.name ?? actor.email }, summary: `Versão documental invalidada: ${reason}` });
    return publicVersion(updated);
  }
}

export const documentVersionsService = new DocumentVersionsService();
