import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import tar from "tar-stream";

import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";

type Actor = { id?: string | null; name?: string | null; email?: string | null };
type Entry = { path: string; size: number; checksumSha256: string };
type StoredAnalysis = {
  id: string; archivePath: string; checksumSha256: string; createdAt: string; expiresAt: string;
  entries: Entry[]; missing: string[]; orphaned: string[]; conflicts: string[];
};

const ANALYSIS_TTL_MS = 60 * 60 * 1000;

export function safeEvidencePath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

async function checksum(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function scanEvidenceArchive(filePath: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let expandedBytes = 0;
  const maxExpanded = env.BACKUP_MAX_UPLOAD_MB * 1024 * 1024 * 5;
  const extract = tar.extract();
  extract.on("entry", (header, stream, next) => {
    if ((header.name === "." || header.name === "./") && header.type === "directory") { stream.resume(); stream.on("end", next); return; }
    const relative = safeEvidencePath(header.name);
    if (!relative) { stream.resume(); stream.on("end", () => next(new AppError("O pacote contém caminho inseguro", 400, "EVIDENCE_PATH_TRAVERSAL"))); return; }
    if (header.type !== "file" && header.type !== "directory") {
      stream.resume(); stream.on("end", () => next(new AppError("Links e arquivos especiais não são aceitos", 400, "EVIDENCE_UNSAFE_ENTRY"))); return;
    }
    if (header.type === "file") {
      if (seen.has(relative)) { stream.resume(); stream.on("end", () => next(new AppError("O pacote contém caminhos duplicados", 400, "EVIDENCE_DUPLICATE_ENTRY"))); return; }
      seen.add(relative);
      expandedBytes += header.size ?? 0;
      if (entries.length >= 50_000 || expandedBytes > maxExpanded) {
        stream.resume(); stream.on("end", () => next(new AppError("O pacote de evidências excede os limites seguros", 413, "EVIDENCE_ARCHIVE_TOO_LARGE"))); return;
      }
      const hash = createHash("sha256");
      stream.on("data", (chunk) => hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer)));
      stream.on("end", () => { entries.push({ path: relative, size: header.size ?? 0, checksumSha256: hash.digest("hex") }); next(); });
      stream.resume();
      return;
    }
    stream.on("end", next);
    stream.resume();
  });
  await pipeline(createReadStream(filePath), createGunzip(), extract).catch((error) => {
    if (error instanceof AppError) throw error;
    throw new AppError("Arquivo .tar.gz inválido ou corrompido", 400, "INVALID_EVIDENCE_ARCHIVE");
  });
  return entries;
}

async function extractArchive(filePath: string, target: string) {
  const extract = tar.extract();
  extract.on("entry", (header, stream, next) => {
    if ((header.name === "." || header.name === "./") && header.type === "directory") { stream.resume(); stream.on("end", next); return; }
    const relative = safeEvidencePath(header.name);
    if (!relative || (header.type !== "file" && header.type !== "directory")) {
      stream.resume(); stream.on("end", () => next(new AppError("O pacote mudou após a análise", 409, "EVIDENCE_ARCHIVE_CHANGED"))); return;
    }
    const destination = path.join(target, relative);
    void (async () => {
      if (header.type === "directory") {
        await mkdir(destination, { recursive: true, mode: 0o700 }); stream.resume(); return;
      }
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await pipeline(stream, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    })().then(() => next(), (error) => extract.destroy(error as Error));
  });
  await pipeline(createReadStream(filePath), createGunzip(), extract);
}

class EvidenceRestoreService {
  private analysisPath(id: string) { return path.join(env.BACKUP_DIRECTORY, `evidence-${id}.json`); }
  private archivePath(id: string) { return path.join(env.BACKUP_DIRECTORY, `evidence-${id}.tar.gz`); }

  async analyze(input: NodeJS.ReadableStream, originalFilename: string | undefined) {
    if (!originalFilename?.toLowerCase().endsWith(".tar.gz")) throw new AppError("Selecione um arquivo .tar.gz", 400, "INVALID_EVIDENCE_FILENAME");
    await mkdir(env.BACKUP_DIRECTORY, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    const archivePath = this.archivePath(id);
    let received = 0;
    const max = env.BACKUP_MAX_UPLOAD_MB * 1024 * 1024;
    const limiter = new (await import("node:stream")).Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length;
      callback(received > max ? new AppError("Arquivo excede o limite de upload", 413, "EVIDENCE_UPLOAD_TOO_LARGE") : null, chunk);
    } });
    try { await pipeline(input, limiter, createWriteStream(archivePath, { flags: "wx", mode: 0o600 })); }
    catch (error) { await rm(archivePath, { force: true }); throw error; }
    const entries = await scanEvidenceArchive(archivePath).catch(async (error) => { await rm(archivePath, { force: true }); throw error; });
    const expected = new Set((await prisma.projectEvidence.findMany({ select: { storageKey: true } })).map((item) => safeEvidencePath(item.storageKey)).filter(Boolean) as string[]);
    const archived = new Set(entries.map((entry) => entry.path));
    const missing = [...expected].filter((key) => !archived.has(key)).sort();
    const orphaned = [...archived].filter((key) => !expected.has(key)).sort();
    const conflicts: string[] = [];
    for (const entry of entries) {
      try {
        const destination = path.join(env.EVIDENCE_DIRECTORY, entry.path);
        if ((await stat(destination)).isFile() && await checksum(destination) !== entry.checksumSha256) conflicts.push(entry.path);
      } catch { /* new file */ }
    }
    const createdAt = new Date();
    const analysis: StoredAnalysis = { id, archivePath, checksumSha256: await checksum(archivePath), createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + ANALYSIS_TTL_MS).toISOString(), entries, missing, orphaned, conflicts };
    await writeFile(this.analysisPath(id), JSON.stringify(analysis), { mode: 0o600 });
    return { id, checksumSha256: analysis.checksumSha256, createdAt: analysis.createdAt, expiresAt: analysis.expiresAt, fileCount: entries.length, totalBytes: entries.reduce((sum, item) => sum + item.size, 0), missing, orphaned, conflicts, restorable: missing.length === 0 };
  }

  async restore(id: string, actor: Actor) {
    let analysis: StoredAnalysis;
    try { analysis = JSON.parse(await readFile(this.analysisPath(id), "utf8")) as StoredAnalysis; }
    catch { throw new AppError("Análise não encontrada ou expirada", 404, "EVIDENCE_ANALYSIS_NOT_FOUND"); }
    if (Date.parse(analysis.expiresAt) < Date.now()) throw new AppError("A análise expirou; envie o pacote novamente", 410, "EVIDENCE_ANALYSIS_EXPIRED");
    if (analysis.missing.length) throw new AppError("A restauração foi bloqueada porque o pacote não cobre todas as evidências cadastradas", 409, "EVIDENCE_ARCHIVE_INCOMPLETE", { missing: analysis.missing });
    if (await checksum(analysis.archivePath) !== analysis.checksumSha256) throw new AppError("O pacote mudou após a análise", 409, "EVIDENCE_ARCHIVE_CHANGED");
    const current = path.resolve(env.EVIDENCE_DIRECTORY);
    const parent = path.dirname(current);
    const staging = path.join(parent, `.evidence-restore-${id}`);
    const rollback = path.join(parent, `.evidence-rollback-${id}`);
    await rm(staging, { recursive: true, force: true }); await mkdir(staging, { recursive: true, mode: 0o700 });
    await extractArchive(analysis.archivePath, staging);
    const rescanned = await scanEvidenceArchive(analysis.archivePath);
    if (JSON.stringify(rescanned) !== JSON.stringify(analysis.entries)) throw new AppError("O conteúdo do pacote mudou após a análise", 409, "EVIDENCE_ARCHIVE_CHANGED");
    let movedCurrent = false;
    try {
      try { const info = await lstat(current); if (info.isSymbolicLink()) throw new AppError("Diretório de evidências inseguro", 409, "EVIDENCE_DIRECTORY_UNSAFE"); await rename(current, rollback); movedCurrent = true; } catch (error) { if (error instanceof AppError) throw error; }
      await rename(staging, current);
      await rm(rollback, { recursive: true, force: true });
    } catch (error) {
      await rm(current, { recursive: true, force: true });
      if (movedCurrent) await rename(rollback, current);
      throw error;
    }
    await Promise.all([rm(analysis.archivePath, { force: true }), rm(this.analysisPath(id), { force: true })]);
    await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: id, action: "RESTORE", actor: { id: actor.id, name: actor.name ?? actor.email }, summary: `${analysis.entries.length} evidências físicas restauradas`, metadata: { checksumSha256: analysis.checksumSha256, orphaned: analysis.orphaned.length, conflicts: analysis.conflicts.length } });
    return { message: "Evidências restauradas com sucesso", restoredAt: new Date().toISOString(), fileCount: analysis.entries.length, checksumSha256: analysis.checksumSha256 };
  }
}

export const evidenceRestoreService = new EvidenceRestoreService();
