import { Request, Response } from "express";
import {
  archivedDiexQuerySchema,
  createDiexSchema,
  diexCodeParamSchema,
  diexIdParamSchema,
  listDiexQuerySchema,
  updateDiexSchema,
} from "./diex.schemas.js";
import { DiexService } from "./diex.service.js";
import { DiexDocumentService } from "./diex-document.service.js";
import { buildListResponse } from "../../shared/pagination.js";

const diexService = new DiexService();
const diexDocumentService = new DiexDocumentService();

export class DiexController {
  async create(req: Request, res: Response) {
    const data = createDiexSchema.parse(req.body);
    const diex = await diexService.create(data, req.user!);
    return res.status(201).json(diex);
  }

  async list(req: Request, res: Response) {
    const filters = listDiexQuerySchema.parse(req.query);
    const diex = await diexService.list(filters, req.user!);
    if (filters.format === "legacy") {
      return res.status(200).json(diex);
    }

    return res.status(200).json(
      buildListResponse({
        items: diex,
        pagination: filters,
        filters,
        path: req.originalUrl,
      }),
    );
  }

  async findById(req: Request, res: Response) {
    const { id } = diexIdParamSchema.parse(req.params);
    const query = archivedDiexQuerySchema.parse(req.query);
    const diex = await diexService.findById(id, req.user!, query);
    return res.status(200).json(diex);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = diexCodeParamSchema.parse(req.params);
    const query = archivedDiexQuerySchema.parse(req.query);
    const diex = await diexService.findByCode(code, req.user!, query);
    return res.status(200).json(diex);
  }

  async update(req: Request, res: Response) {
    const { id } = diexIdParamSchema.parse(req.params);
    const data = updateDiexSchema.parse(req.body);
    const diex = await diexService.update(id, data, req.user!);
    return res.status(200).json(diex);
  }

  async documentHtml(req: Request, res: Response) {
    const { id } = diexIdParamSchema.parse(req.params);
    const html = await diexDocumentService.generateDiexHtml(id, req.user!);
    return res.status(200).contentType("text/html; charset=utf-8").send(html);
  }

  async documentPdf(req: Request, res: Response) {
    const { id } = diexIdParamSchema.parse(req.params);
    const pdf = await diexDocumentService.generateDiexPdf(id, req.user!);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="diex-${id}.pdf"`
    );

    return res.status(200).send(pdf);
  }

  async remove(req: Request, res: Response) {
    const { id } = diexIdParamSchema.parse(req.params);
    const result = await diexService.remove(id, req.user!);
    return res.status(200).json(result);
  }

  async restore(req: Request, res: Response) {
    const { id } = diexIdParamSchema.parse(req.params);
    const result = await diexService.restore(id, req.user!);
    return res.status(200).json(result);
  }
}
