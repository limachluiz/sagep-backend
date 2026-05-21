import { Request, Response } from "express";
import { listAuditLogsQuerySchema } from "./audit.schemas.js";
import { auditService } from "./audit.service.js";

export class AuditController {
  async list(req: Request, res: Response) {
    const filters = listAuditLogsQuerySchema.parse(req.query);
    const result = await auditService.list(filters, req.originalUrl);

    return res.status(200).json(result);
  }
}
