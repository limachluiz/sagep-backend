import { Request, Response } from "express";
import {
  ataIdParamSchema,
  ataItemCodeParamSchema,
  ataItemIdParamSchema,
  createAtaItemSchema,
  listAtaItemsQuerySchema,
  updateAtaItemSchema,
} from "./ata-items.schemas.js";
import { AtaItemsService } from "./ata-items.service.js";

const ataItemsService = new AtaItemsService();

export class AtaItemsController {
  async create(req: Request, res: Response) {
    const { id } = ataIdParamSchema.parse(req.params);
    const data = createAtaItemSchema.parse(req.body);

    const item = await ataItemsService.create(id, data);

    return res.status(201).json(item);
  }

  async listByAta(req: Request, res: Response) {
    const { id } = ataIdParamSchema.parse(req.params);
    const filters = listAtaItemsQuerySchema.parse(req.query);

    const items = await ataItemsService.listByAta(id, filters);

    return res.status(200).json(items);
  }

  async list(req: Request, res: Response) {
    const filters = listAtaItemsQuerySchema.parse(req.query);

    const items = await ataItemsService.list(filters);

    return res.status(200).json(items);
  }

  async findById(req: Request, res: Response) {
    const { id } = ataItemIdParamSchema.parse(req.params);

    const item = await ataItemsService.findById(id);

    return res.status(200).json(item);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = ataItemCodeParamSchema.parse(req.params);

    const item = await ataItemsService.findByCode(code);

    return res.status(200).json(item);
  }

  async update(req: Request, res: Response) {
    const { id } = ataItemIdParamSchema.parse(req.params);
    const data = updateAtaItemSchema.parse(req.body);

    const item = await ataItemsService.update(id, data);

    return res.status(200).json(item);
  }

  async remove(req: Request, res: Response) {
    const { id } = ataItemIdParamSchema.parse(req.params);

    const result = await ataItemsService.remove(id);

    return res.status(200).json(result);
  }
}