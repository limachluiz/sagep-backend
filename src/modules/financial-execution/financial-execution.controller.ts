import { Request, Response } from "express";
import {
  commitmentNoteIdSchema,
  createInvoiceSchema,
  listCommitmentNotesSchema,
  previewCommitmentNoteSchema,
  registerCommitmentNoteSchema,
} from "./financial-execution.schemas.js";
import { financialExecutionService } from "./financial-execution.service.js";

export class FinancialExecutionController {
  async preview(req: Request, res: Response) {
    return res.status(200).json(await financialExecutionService.preview(previewCommitmentNoteSchema.parse(req.body), req.user!));
  }

  async register(req: Request, res: Response) {
    return res.status(201).json(await financialExecutionService.register(registerCommitmentNoteSchema.parse(req.body), req.user!));
  }

  async list(req: Request, res: Response) {
    return res.status(200).json(await financialExecutionService.list(listCommitmentNotesSchema.parse(req.query), req.user!));
  }

  async summary(req: Request, res: Response) {
    return res.status(200).json(await financialExecutionService.summaryForUser(req.user!));
  }

  async details(req: Request, res: Response) {
    const { id } = commitmentNoteIdSchema.parse(req.params);
    return res.status(200).json(await financialExecutionService.details(id, req.user!));
  }

  async syncOne(req: Request, res: Response) {
    const { id } = commitmentNoteIdSchema.parse(req.params);
    return res.status(200).json(await financialExecutionService.syncOne(id, req.user!));
  }

  async syncAll(req: Request, res: Response) {
    return res.status(200).json(await financialExecutionService.syncAll(req.user!));
  }

  async createInvoice(req: Request, res: Response) {
    return res.status(201).json(await financialExecutionService.createInvoice(createInvoiceSchema.parse(req.body), req.user!));
  }
}
