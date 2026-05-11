import { Request, Response } from "express";
import {
  comprasGovAtaImportSchema,
  comprasGovAtaPreviewQuerySchema,
} from "./compras-gov.schemas.js";
import { ComprasGovService } from "./compras-gov.service.js";

const comprasGovService = new ComprasGovService();

export class ComprasGovController {
  async previewAta(req: Request, res: Response) {
    const filters = comprasGovAtaPreviewQuerySchema.parse(req.query);
    const preview = await comprasGovService.preview(filters);

    return res.status(200).json(preview);
  }

  async importAta(req: Request, res: Response) {
    const data = comprasGovAtaImportSchema.parse(req.body);
    const result = await comprasGovService.importAta(data);

    return res.status(data.dryRun ? 200 : 201).json(result);
  }
}
