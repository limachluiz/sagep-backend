import { EstimateDocumentService } from "./estimate-document.service.js";
import { Request, Response } from "express";
import {
  archivedEstimateQuerySchema,
  createEstimateSchema,
  estimateCodeParamSchema,
  estimateIdParamSchema,
  listEstimatesQuerySchema,
  updateEstimateSchema,
  updateEstimateStatusSchema,
} from "./estimates.schemas.js";
import { EstimatesService } from "./estimates.service.js";
import { buildListResponse } from "../../shared/pagination.js";
import { restoreOptionsSchema } from "../../shared/restore.schemas.js";

const estimatesService = new EstimatesService();
const estimateDocumentService = new EstimateDocumentService();

export class EstimatesController {
  async create(req: Request, res: Response) {
    const data = createEstimateSchema.parse(req.body);
    const estimate = await estimatesService.create(data, req.user!);
    return res.status(201).json(estimate);
  }

  async list(req: Request, res: Response) {
    const filters = listEstimatesQuerySchema.parse(req.query);
    const estimates = await estimatesService.list(filters, req.user!);
    if (filters.format === "legacy") {
      return res.status(200).json(estimates);
    }

    return res.status(200).json(
      buildListResponse({
        items: estimates,
        pagination: filters,
        filters,
        path: req.originalUrl,
      }),
    );
  }

  async findById(req: Request, res: Response) {
    const { id } = estimateIdParamSchema.parse(req.params);
    const query = archivedEstimateQuerySchema.parse(req.query);
    const estimate = await estimatesService.findById(id, req.user!, query);
    return res.status(200).json(estimate);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = estimateCodeParamSchema.parse(req.params);
    const query = archivedEstimateQuerySchema.parse(req.query);
    const estimate = await estimatesService.findByCode(code, req.user!, query);
    return res.status(200).json(estimate);
  }

  async update(req: Request, res: Response) {
    const { id } = estimateIdParamSchema.parse(req.params);
    const data = updateEstimateSchema.parse(req.body);
    const estimate = await estimatesService.update(id, data, req.user!);
    return res.status(200).json(estimate);
  }

  async updateStatus(req: Request, res: Response) {
    const { id } = estimateIdParamSchema.parse(req.params);
    const data = updateEstimateStatusSchema.parse(req.body);
    const estimate = await estimatesService.updateStatus(id, data, req.user!);
    return res.status(200).json(estimate);
  }

  async remove(req: Request, res: Response) {
    const { id } = estimateIdParamSchema.parse(req.params);
    const result = await estimatesService.remove(id, req.user!);
    return res.status(200).json(result);
  }

  async restore(req: Request, res: Response) {
    const { id } = estimateIdParamSchema.parse(req.params);
    const options = restoreOptionsSchema.parse(req.body ?? {});
    const result = await estimatesService.restore(id, req.user!, options);
    return res.status(200).json(result);
  }

  async documentHtml(req: Request, res: Response) {
    const { id } = estimateIdParamSchema.parse(req.params);

    const html = await estimateDocumentService.generateEstimateHtml(id, req.user!);

    return res.status(200).contentType("text/html; charset=utf-8").send(html);
  }

  async documentPdf(req: Request, res: Response) {
    const { id } = estimateIdParamSchema.parse(req.params);

    const pdf = await estimateDocumentService.generateEstimatePdf(id, req.user!);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="estimativa-${id}.pdf"`
    );

    return res.status(200).send(pdf);
  }
}
