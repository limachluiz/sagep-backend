import { Request, Response } from "express";
import { buildListResponse } from "../../shared/pagination.js";
import { listPregoesQuerySchema, pregaoIdParamSchema, updatePregaoSchema } from "./pregoes.schemas.js";
import { PregoesService } from "./pregoes.service.js";

const service = new PregoesService();

export class PregoesController {
  async list(req: Request, res: Response) {
    const filters = listPregoesQuerySchema.parse(req.query);
    const items = await service.list(filters);
    if (filters.format === "legacy") return res.status(200).json(items);
    return res.status(200).json(buildListResponse({ items, pagination: filters, filters, path: req.originalUrl }));
  }

  async findById(req: Request, res: Response) {
    const { id } = pregaoIdParamSchema.parse(req.params);
    return res.status(200).json(await service.findById(id));
  }

  async update(req: Request, res: Response) {
    const { id } = pregaoIdParamSchema.parse(req.params);
    const data = updatePregaoSchema.parse(req.body);
    return res.status(200).json(await service.update(id, data));
  }

  async sync(req: Request, res: Response) {
    const { id } = pregaoIdParamSchema.parse(req.params);
    return res.status(200).json(await service.sync(id));
  }
}
