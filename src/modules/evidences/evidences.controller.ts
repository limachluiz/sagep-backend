import type { Request, Response } from "express";
import { z } from "zod";
import { evidenceUploadHeadersSchema, updateEvidenceSchema } from "./evidences.schemas.js";
import { EvidencesService } from "./evidences.service.js";

const service = new EvidencesService();
const decode = (value: unknown) => decodeURIComponent(String(value ?? ""));

export class EvidencesController {
  async list(req: Request, res: Response) { return res.json(await service.list(z.string().parse(req.query.projectId), req.user!)); }
  async upload(req: Request, res: Response) {
    const data = evidenceUploadHeadersSchema.parse({
      projectId: req.header("X-Project-Id"), taskId: req.header("X-Task-Id") || undefined,
      filename: decode(req.header("X-File-Name") || req.header("X-Backup-Filename")), title: decode(req.header("X-Evidence-Title")),
      description: req.header("X-Evidence-Description") ? decode(req.header("X-Evidence-Description")) : undefined,
      category: req.header("X-Evidence-Category"), phase: req.header("X-Evidence-Phase") || "GENERAL",
      includeInReport: req.header("X-Include-In-Report") === "true",
    });
    return res.status(201).json(await service.upload(data, req.body as Buffer, req.user!));
  }
  async update(req: Request, res: Response) { return res.json(await service.update(z.string().parse(req.params.id), updateEvidenceSchema.parse(req.body), req.user!)); }
  async download(req: Request, res: Response) {
    const { evidence, buffer } = await service.download(z.string().parse(req.params.id), req.user!);
    res.setHeader("Content-Type", evidence.mimeType); res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(evidence.originalName)}`);
    return res.send(buffer);
  }
  async remove(req: Request, res: Response) { await service.remove(z.string().parse(req.params.id), req.user!); return res.status(204).send(); }
}
