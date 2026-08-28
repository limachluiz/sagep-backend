import { Request, Response } from "express";
import { buildListResponse } from "../../shared/pagination.js";
import { createPregaoSchema, listPregoesQuerySchema, pregaoIdParamSchema, updatePregaoSchema } from "./pregoes.schemas.js";
import { PregoesService } from "./pregoes.service.js";

const service = new PregoesService();

export class PregoesController {
  async create(req: Request, res: Response) {
    return res.status(201).json(await service.create(createPregaoSchema.parse(req.body)));
  }
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

  async remove(req: Request, res: Response) {
    const { id } = pregaoIdParamSchema.parse(req.params);
    return res.status(200).json(await service.remove(id));
  }

  async sync(req: Request, res: Response) {
    const { id } = pregaoIdParamSchema.parse(req.params);
    return res.status(200).json(await service.sync(id));
  }

  async checkUpdates(req: Request, res: Response) {
    const { id } = pregaoIdParamSchema.parse(req.params);
    return res.status(200).json(await service.checkUpdates(id));
  }
}