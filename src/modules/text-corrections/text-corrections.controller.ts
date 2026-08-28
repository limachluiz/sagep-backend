import { Request, Response } from "express";
import {
  applyTextCorrectionsSchema,
  saveTextCorrectionSchema,
  testTextCorrectionSchema,
  textCorrectionIdSchema,
} from "./text-corrections.schemas.js";
import { textCorrectionsService } from "./text-corrections.service.js";

export class TextCorrectionsController {
  async list(_req: Request, res: Response) { return res.status(200).json(await textCorrectionsService.list()); }
  async create(req: Request, res: Response) { return res.status(201).json(await textCorrectionsService.create(saveTextCorrectionSchema.parse(req.body), req.user!)); }
  async update(req: Request, res: Response) { const { id } = textCorrectionIdSchema.parse(req.params); return res.status(200).json(await textCorrectionsService.update(id, saveTextCorrectionSchema.parse(req.body), req.user!)); }
  async remove(req: Request, res: Response) { const { id } = textCorrectionIdSchema.parse(req.params); return res.status(200).json(await textCorrectionsService.remove(id, req.user!)); }
  async test(req: Request, res: Response) { const data = testTextCorrectionSchema.parse(req.body); const preview = data.damagedText && data.correctedText ? { damagedText: data.damagedText, correctedText: data.correctedText } : undefined; return res.status(200).json(await textCorrectionsService.test(data.text, preview)); }
  async apply(req: Request, res: Response) { return res.status(200).json(await textCorrectionsService.apply(applyTextCorrectionsSchema.parse(req.body), req.user!)); }
}
