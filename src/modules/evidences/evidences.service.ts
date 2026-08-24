import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";
import { permissionsService } from "../permissions/permissions.service.js";

type CurrentUser = { id: string; email: string; role: string; permissions?: string[] };
type UploadInput = {
  projectId: string; taskId?: string; filename: string; title: string; description?: string;
  category: "IMAGE" | "VIDEO" | "KMZ_KML" | "TECHNICAL_DOCUMENT" | "CERTIFICATION" | "DIAGRAM" | "AS_BUILT" | "OTHER";
  phase: "BEFORE" | "DURING" | "AFTER" | "GENERAL"; includeInReport: boolean;
};

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm", ".pdf", ".kmz", ".kml", ".docx", ".xlsx", ".csv"]);
const mimeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf",
  ".kmz": "application/vnd.google-earth.kmz", ".kml": "application/vnd.google-earth.kml+xml",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".csv": "text/csv",
};

export class EvidencesService {
  private async projectAccess(projectId: string, user: CurrentUser, write = false) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, archivedAt: true, deletedAt: true, members: { select: { userId: true } } },
    });
    if (!project || project.deletedAt) throw new AppError("Projeto não encontrado", 404);
    const related = project.ownerId === user.id || project.members.some((member) => member.userId === user.id);
    const allowed = write
      ? permissionsService.hasPermission(user, "projects.edit_all") || (related && permissionsService.hasPermission(user, "projects.edit_own"))
      : permissionsService.hasPermission(user, "projects.view_all") || related;
    if (!allowed) throw new AppError("Você não possui acesso às evidências deste projeto", 403);
    if (write && project.archivedAt) throw new AppError("Projeto arquivado não aceita novas evidências", 409);
    return project;
  }

  async list(projectId: string, user: CurrentUser) {
    await this.projectAccess(projectId, user);
    return prisma.projectEvidence.findMany({
      where: { projectId }, orderBy: [{ includeInReport: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      include: { task: { select: { id: true, taskCode: true, title: true } }, uploadedBy: { select: { id: true, name: true, warName: true, rank: true } } },
    });
  }

  async upload(data: UploadInput, buffer: Buffer, user: CurrentUser) {
    await this.projectAccess(data.projectId, user, true);
    if (!buffer.length) throw new AppError("Arquivo vazio", 400);
    if (buffer.length > env.EVIDENCE_MAX_UPLOAD_MB * 1024 * 1024) throw new AppError(`O arquivo excede ${env.EVIDENCE_MAX_UPLOAD_MB} MB`, 413);
    const safeName = path.basename(data.filename).replace(/[\u0000-\u001f]/g, "");
    const extension = path.extname(safeName).toLowerCase();
    if (!allowedExtensions.has(extension)) throw new AppError("Formato de arquivo não permitido", 415);
    if (data.taskId) {
      const task = await prisma.task.findFirst({ where: { id: data.taskId, projectId: data.projectId, deletedAt: null }, select: { id: true } });
      if (!task) throw new AppError("A tarefa informada não pertence ao projeto", 400);
    }
    const storageKey = `${data.projectId}/${randomUUID()}${extension}`;
    const absolutePath = path.resolve(env.EVIDENCE_DIRECTORY, storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer, { flag: "wx" });
    try {
      const evidence = await prisma.projectEvidence.create({ data: {
        projectId: data.projectId, taskId: data.taskId, uploadedById: user.id, title: data.title,
        description: data.description, category: data.category, phase: data.phase, includeInReport: data.includeInReport,
        originalName: safeName, storageKey, mimeType: mimeByExtension[extension] ?? "application/octet-stream",
        sizeBytes: buffer.length, checksumSha256: createHash("sha256").update(buffer).digest("hex"),
      }});
      if (evidence.includeInReport) await prisma.project.update({ where: { id: data.projectId }, data: { deliveryReportGeneratedAt: null, deliveryReportSignedAt: null, deliveryReportSignedLink: null } });
      return evidence;
    } catch (error) { await rm(absolutePath, { force: true }); throw error; }
  }

  async update(id: string, data: Record<string, unknown>, user: CurrentUser) {
    const evidence = await prisma.projectEvidence.findUnique({ where: { id }, select: { projectId: true, includeInReport: true } });
    if (!evidence) throw new AppError("Evidência não encontrada", 404);
    await this.projectAccess(evidence.projectId, user, true);
    const updated = await prisma.projectEvidence.update({ where: { id }, data });
    if (evidence.includeInReport || updated.includeInReport) await prisma.project.update({ where: { id: evidence.projectId }, data: { deliveryReportGeneratedAt: null, deliveryReportSignedAt: null, deliveryReportSignedLink: null } });
    return updated;
  }

  async download(id: string, user: CurrentUser) {
    const evidence = await prisma.projectEvidence.findUnique({ where: { id } });
    if (!evidence) throw new AppError("Evidência não encontrada", 404);
    await this.projectAccess(evidence.projectId, user);
    const buffer = await readFile(path.resolve(env.EVIDENCE_DIRECTORY, evidence.storageKey)).catch(() => null);
    if (!buffer) throw new AppError("Arquivo da evidência não encontrado no armazenamento", 404);
    return { evidence, buffer };
  }

  async remove(id: string, user: CurrentUser) {
    const evidence = await prisma.projectEvidence.findUnique({ where: { id } });
    if (!evidence) throw new AppError("Evidência não encontrada", 404);
    await this.projectAccess(evidence.projectId, user, true);
    await prisma.projectEvidence.delete({ where: { id } });
    if (evidence.includeInReport) await prisma.project.update({ where: { id: evidence.projectId }, data: { deliveryReportGeneratedAt: null, deliveryReportSignedAt: null, deliveryReportSignedLink: null } });
    await rm(path.resolve(env.EVIDENCE_DIRECTORY, evidence.storageKey), { force: true });
  }
}
