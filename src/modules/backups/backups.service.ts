import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import type { SelectiveExportModule } from "./backups.schemas.js";

type BackupKind = "MANUAL" | "AUTOMATIC" | "IMPORTED" | "SAFETY";

type BackupActor = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type BackupManifest = {
  id: string;
  kind: BackupKind;
  filename: string;
  originalFilename: string | null;
  createdAt: string;
  createdBy: string | null;
  sizeBytes: number;
  checksumSha256: string;
  databaseName: string;
  format: "POSTGRES_CUSTOM";
  verified: boolean;
};

const exportTables: Record<SelectiveExportModule, string[]> = {
  PROJECTS: [
    "Project", "ProjectMember", "Task", "TaskActivity", "Estimate", "EstimateItem",
    "DiexRequest", "DiexRequestItem", "CommitmentNote", "FinancialDocument", "Invoice", "ServiceOrder", "ServiceOrderItem",
    "ServiceOrderScheduleItem", "ServiceOrderDeliveredDocument",
  ],
  ATAS: ["Ata", "AtaCoverageGroup", "AtaCoverageLocality", "AtaItem", "AtaItemBalanceMovement"],
  USERS: ["User", "Permission", "RolePermission", "UserPermissionOverride"],
  SETTINGS: ["SystemConfiguration", "IntegrationConnectionCheck", "MilitaryOrganization"],
  AUDIT: ["AuditLog", "NotificationDismissal"],
};

function commandError(command: string, stderr: string) {
  const detail = stderr.trim().slice(-2000);
  return new AppError(
    `Falha ao executar ${command}${detail ? `: ${detail}` : ""}`,
    500,
    "BACKUP_COMMAND_FAILED",
  );
}

async function runCommand(command: string, args: string[], commandEnv: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      env: commandEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${String(chunk)}`.slice(-2_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-2_000_000); });
    child.on("error", (error) => reject(new AppError(
      `${command} não está disponível no servidor: ${error.message}`,
      503,
      "BACKUP_TOOL_UNAVAILABLE",
    )));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(commandError(command, stderr));
    });
  });
}

export class BackupsService {
  private operationRunning = false;
  private restoring = false;

  isRestoring() {
    return this.restoring;
  }

  private databaseConnection() {
    const url = new URL(env.DATABASE_URL);
    return {
      host: url.hostname,
      port: url.port || "5432",
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    };
  }

  private commandEnv() {
    const connection = this.databaseConnection();
    return { ...process.env, PGPASSWORD: connection.password };
  }

  private connectionArgs() {
    const connection = this.databaseConnection();
    return ["--host", connection.host, "--port", connection.port, "--username", connection.user, "--dbname", connection.database];
  }

  private archivePath(id: string) {
    return path.join(env.BACKUP_DIRECTORY, `${id}.dump`);
  }

  private manifestPath(id: string) {
    return path.join(env.BACKUP_DIRECTORY, `${id}.json`);
  }

  private async ensureDirectory() {
    await mkdir(env.BACKUP_DIRECTORY, { recursive: true, mode: 0o700 });
  }

  private async checksum(filePath: string) {
    const hash = createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", resolve);
    });
    return hash.digest("hex");
  }

  private async validateArchive(filePath: string) {
    const file = await open(filePath, "r");
    const header = Buffer.alloc(5);
    try {
      await file.read(header, 0, 5, 0);
    } finally {
      await file.close();
    }
    if (header.toString("ascii") !== "PGDMP") {
      throw new AppError("O arquivo não é um backup PostgreSQL no formato custom", 400, "INVALID_BACKUP_FORMAT");
    }

    const { stdout } = await runCommand("pg_restore", ["--list", filePath], this.commandEnv());
    const requiredObjects = ["_prisma_migrations", "User", "Project"];
    const missing = requiredObjects.filter((name) => !stdout.includes(name));
    if (missing.length > 0) {
      throw new AppError(
        `O arquivo não parece pertencer ao SAGEP. Estruturas ausentes: ${missing.join(", ")}`,
        400,
        "INVALID_SAGEP_BACKUP",
      );
    }
  }

  private displayFilename(kind: BackupKind, createdAt: Date) {
    const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
    return `sagep-${kind.toLowerCase()}-${timestamp}.dump`;
  }

  private async writeManifest(manifest: BackupManifest) {
    await writeFile(this.manifestPath(manifest.id), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  }

  private async readManifest(id: string) {
    try {
      const content = await readFile(this.manifestPath(id), "utf8");
      return JSON.parse(content) as BackupManifest;
    } catch {
      throw new AppError("Backup não encontrado", 404, "BACKUP_NOT_FOUND");
    }
  }

  private async resolveBackup(id: string) {
    const manifest = await this.readManifest(id);
    const filePath = this.archivePath(id);
    try {
      await stat(filePath);
    } catch {
      throw new AppError("Arquivo físico do backup não foi encontrado", 404, "BACKUP_FILE_NOT_FOUND");
    }
    return { manifest, filePath };
  }

  private async withOperationLock<T>(operation: () => Promise<T>) {
    if (this.operationRunning) {
      throw new AppError("Já existe uma operação de backup ou restauração em andamento", 409, "BACKUP_OPERATION_RUNNING");
    }
    this.operationRunning = true;
    try {
      return await operation();
    } finally {
      this.operationRunning = false;
    }
  }

  async create(kind: BackupKind = "MANUAL", actor?: BackupActor) {
    return this.withOperationLock(async () => this.createUnlocked(kind, actor));
  }

  private async createUnlocked(kind: BackupKind, actor?: BackupActor) {
    await this.ensureDirectory();
    const id = randomUUID();
    const createdAt = new Date();
    const finalPath = this.archivePath(id);
    const partialPath = `${finalPath}.partial`;

    try {
      await runCommand("pg_dump", [
        ...this.connectionArgs(),
        "--format=custom",
        "--compress=6",
        "--no-owner",
        "--no-privileges",
        "--file",
        partialPath,
      ], this.commandEnv());
      await this.validateArchive(partialPath);
      await rename(partialPath, finalPath);
    } catch (error) {
      await rm(partialPath, { force: true });
      throw error;
    }

    const fileStat = await stat(finalPath);
    const manifest: BackupManifest = {
      id,
      kind,
      filename: this.displayFilename(kind, createdAt),
      originalFilename: null,
      createdAt: createdAt.toISOString(),
      createdBy: actor?.name ?? actor?.email ?? null,
      sizeBytes: fileStat.size,
      checksumSha256: await this.checksum(finalPath),
      databaseName: this.databaseConnection().database,
      format: "POSTGRES_CUSTOM",
      verified: true,
    };
    await this.writeManifest(manifest);
    if (kind !== "SAFETY") await this.applyRetention();

    if (kind === "MANUAL" && actor) {
      await auditService.log({
        entityType: "SYSTEM_SETTINGS",
        entityId: id,
        action: "CREATE",
        actor: { id: actor.id, name: manifest.createdBy },
        summary: "Backup manual do banco de dados criado",
        metadata: { filename: manifest.filename, sizeBytes: manifest.sizeBytes, checksumSha256: manifest.checksumSha256 },
      });
    }

    return manifest;
  }

  async importArchive(stream: Readable, originalFilename: string | undefined, actor: BackupActor) {
    return this.withOperationLock(async () => {
      await this.ensureDirectory();
      const id = randomUUID();
      const createdAt = new Date();
      const finalPath = this.archivePath(id);
      const partialPath = `${finalPath}.partial`;
      const maxBytes = env.BACKUP_MAX_UPLOAD_MB * 1024 ** 2;
      let receivedBytes = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          receivedBytes += chunk.length;
          if (receivedBytes > maxBytes) {
            callback(new AppError(`O arquivo excede o limite de ${env.BACKUP_MAX_UPLOAD_MB} MB`, 413, "BACKUP_FILE_TOO_LARGE"));
            return;
          }
          callback(null, chunk);
        },
      });
      try {
        await pipeline(stream, limiter, createWriteStream(partialPath, { mode: 0o600 }));
        if (receivedBytes === 0) throw new AppError("Arquivo de backup não informado", 400, "BACKUP_FILE_REQUIRED");
        await this.validateArchive(partialPath);
        await rename(partialPath, finalPath);
      } catch (error) {
        await rm(partialPath, { force: true });
        throw error;
      }

      const safeOriginalName = originalFilename?.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || null;
      const manifest: BackupManifest = {
        id,
        kind: "IMPORTED",
        filename: this.displayFilename("IMPORTED", createdAt),
        originalFilename: safeOriginalName,
        createdAt: createdAt.toISOString(),
        createdBy: actor.name ?? actor.email ?? null,
        sizeBytes: receivedBytes,
        checksumSha256: await this.checksum(finalPath),
        databaseName: this.databaseConnection().database,
        format: "POSTGRES_CUSTOM",
        verified: true,
      };
      await this.writeManifest(manifest);
      await this.applyRetention();
      await auditService.log({
        entityType: "SYSTEM_SETTINGS",
        entityId: id,
        action: "CREATE",
        actor: { id: actor.id, name: manifest.createdBy },
        summary: "Arquivo de backup importado e validado",
        metadata: { filename: manifest.filename, originalFilename: manifest.originalFilename, sizeBytes: manifest.sizeBytes },
      });
      return manifest;
    });
  }

  async list() {
    await this.ensureDirectory();
    const files = await readdir(env.BACKUP_DIRECTORY);
    const manifests = await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
      try {
        const manifest = JSON.parse(await readFile(path.join(env.BACKUP_DIRECTORY, file), "utf8")) as BackupManifest;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.id)) return null;
        await stat(this.archivePath(manifest.id));
        return manifest;
      } catch {
        return null;
      }
    }));
    return manifests.filter((item): item is BackupManifest => Boolean(item)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async overview() {
    const items = await this.list();
    return {
      items,
      summary: {
        total: items.length,
        totalSizeBytes: items.reduce((total, item) => total + item.sizeBytes, 0),
        latestAt: items[0]?.createdAt ?? null,
        automatic: items.filter((item) => item.kind === "AUTOMATIC").length,
        imported: items.filter((item) => item.kind === "IMPORTED").length,
      },
      policy: {
        retentionDays: env.BACKUP_RETENTION_DAYS,
        maxFiles: env.BACKUP_MAX_FILES,
        scheduleHours: env.BACKUP_SCHEDULE_HOURS,
        runOnStartup: env.BACKUP_RUN_ON_STARTUP,
        maxUploadMb: env.BACKUP_MAX_UPLOAD_MB,
      },
      operationRunning: this.operationRunning,
    };
  }

  async download(id: string) {
    return this.resolveBackup(id);
  }

  async remove(id: string, actor: BackupActor) {
    return this.withOperationLock(async () => {
      const { manifest, filePath } = await this.resolveBackup(id);
      await rm(filePath, { force: true });
      await rm(this.manifestPath(id), { force: true });
      await auditService.log({
        entityType: "SYSTEM_SETTINGS",
        entityId: id,
        action: "DELETE",
        actor: { id: actor.id, name: actor.name ?? actor.email },
        summary: "Backup do banco de dados excluído",
        metadata: { filename: manifest.filename, checksumSha256: manifest.checksumSha256 },
      });
      return { message: "Backup excluído com sucesso", id };
    });
  }

  async restore(id: string, actor: BackupActor) {
    return this.withOperationLock(async () => {
      const { manifest, filePath } = await this.resolveBackup(id);
      const currentChecksum = await this.checksum(filePath);
      if (currentChecksum !== manifest.checksumSha256) {
        throw new AppError("A integridade do arquivo de backup não pôde ser confirmada", 409, "BACKUP_CHECKSUM_MISMATCH");
      }
      await this.validateArchive(filePath);
      const safetyBackup = await this.createUnlocked("SAFETY", actor);
      const connection = this.databaseConnection();
      const commandEnv = this.commandEnv();

      this.restoring = true;
      await prisma.$disconnect();
      try {
        await runCommand("psql", [
          ...this.connectionArgs(),
          "--command",
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();",
        ], commandEnv);
        await runCommand("pg_restore", [
          ...this.connectionArgs(),
          "--clean",
          "--if-exists",
          "--no-owner",
          "--no-privileges",
          "--exit-on-error",
          filePath,
        ], commandEnv);
        await runCommand(process.execPath, [
          path.join(process.cwd(), "node_modules/prisma/build/index.js"),
          "migrate",
          "deploy",
        ], commandEnv);
      } catch (error) {
        throw new AppError(
          `A restauração falhou. O backup de segurança ${safetyBackup.filename} foi preservado. ${error instanceof Error ? error.message : ""}`.trim(),
          500,
          "BACKUP_RESTORE_FAILED",
        );
      } finally {
        this.restoring = false;
      }

      try {
        await auditService.log({
          entityType: "SYSTEM_SETTINGS",
          entityId: id,
          action: "RESTORE",
          actor: { name: actor.name ?? actor.email },
          summary: "Banco de dados restaurado a partir de backup",
          metadata: { filename: manifest.filename, checksumSha256: manifest.checksumSha256, safetyBackupId: safetyBackup.id },
        });
      } catch (error) {
        console.error("Banco restaurado, mas o registro de auditoria falhou", { backupId: id, error });
      }
      return {
        message: "Banco de dados restaurado com sucesso. Recomenda-se entrar novamente no sistema.",
        restoredBackup: manifest,
        safetyBackup,
        restoredAt: new Date().toISOString(),
      };
    });
  }

  async createSelectiveExport(modules: SelectiveExportModule[]) {
    return this.withOperationLock(async () => {
      await this.ensureDirectory();
      const uniqueTables = Array.from(new Set(modules.flatMap((module) => exportTables[module])));
      const id = randomUUID();
      const filePath = path.join(env.BACKUP_DIRECTORY, `${id}.sql`);
      const args = [
        ...this.connectionArgs(),
        "--format=plain",
        "--data-only",
        "--column-inserts",
        "--no-owner",
        "--no-privileges",
        "--file",
        filePath,
        ...uniqueTables.flatMap((table) => ["--table", `public.\"${table}\"`]),
      ];
      await runCommand("pg_dump", args, this.commandEnv());
      return {
        filePath,
        filename: `sagep-export-${modules.map((module) => module.toLowerCase()).join("-")}-${new Date().toISOString().slice(0, 10)}.sql`,
        cleanup: () => rm(filePath, { force: true }),
      };
    });
  }

  async applyRetention() {
    const items = await this.list();
    const cutoff = Date.now() - env.BACKUP_RETENTION_DAYS * 86_400_000;
    const automatic = items.filter((item) => item.kind === "AUTOMATIC");
    const expiredIds = new Set(automatic.filter((item, index) => index >= env.BACKUP_MAX_FILES || new Date(item.createdAt).getTime() < cutoff).map((item) => item.id));
    await Promise.all(Array.from(expiredIds).flatMap((id) => [
      rm(this.archivePath(id), { force: true }),
      rm(this.manifestPath(id), { force: true }),
    ]));
    return expiredIds.size;
  }
}

export const backupsService = new BackupsService();
