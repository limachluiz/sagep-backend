import { Request, Response } from "express";
import { env } from "../../config/env.js";
import { backupIdParamSchema, restoreBackupSchema, selectiveExportSchema } from "./backups.schemas.js";
import { backupsService } from "./backups.service.js";

export class BackupsController {
  async list(_req: Request, res: Response) {
    return res.status(200).json(await backupsService.overview());
  }

  async create(req: Request, res: Response) {
    return res.status(201).json(await backupsService.create("MANUAL", req.user!));
  }

  async importArchive(req: Request, res: Response) {
    const originalFilename = typeof req.headers["x-backup-filename"] === "string"
      ? decodeURIComponent(req.headers["x-backup-filename"])
      : undefined;
    return res.status(201).json(await backupsService.importArchive(req, originalFilename, req.user!));
  }

  async download(req: Request, res: Response) {
    const { id } = backupIdParamSchema.parse(req.params);
    const { manifest, filePath } = await backupsService.download(id);
    res.setHeader("Content-Type", "application/octet-stream");
    return res.download(filePath, manifest.filename);
  }

  async remove(req: Request, res: Response) {
    const { id } = backupIdParamSchema.parse(req.params);
    return res.status(200).json(await backupsService.remove(id, req.user!));
  }

  async restore(req: Request, res: Response) {
    const { id } = backupIdParamSchema.parse(req.params);
    restoreBackupSchema.parse(req.body);
    return res.status(200).json(await backupsService.restore(id, req.user!));
  }

  async selectiveExport(req: Request, res: Response) {
    const { modules } = selectiveExportSchema.parse(req.body);
    const exported = await backupsService.createSelectiveExport(modules);
    res.setHeader("Content-Type", "application/sql");
    res.on("finish", () => void exported.cleanup());
    res.on("close", () => void exported.cleanup());
    return res.download(exported.filePath, exported.filename);
  }

  uploadLimit() {
    return `${env.BACKUP_MAX_UPLOAD_MB}mb`;
  }
}
