import { Request, Response } from "express";
import {
  ataCodeParamSchema,
  ataIdParamSchema,
  createAtaSchema,
  listAtasQuerySchema,
  updateAtaSchema,
} from "./atas.schemas.js";
import { AtasService } from "./atas.service.js";

const atasService = new AtasService();

export class AtasController {
  async create(req: Request, res: Response) {
    const data = createAtaSchema.parse(req.body);
    const ata = await atasService.create(data);
    return res.status(201).json(ata);
  }

  async list(req: Request, res: Response) {
    const filters = listAtasQuerySchema.parse(req.query);
    const atas = await atasService.list(filters);
    return res.status(200).json(atas);
  }

  async findById(req: Request, res: Response) {
    const { id } = ataIdParamSchema.parse(req.params);
    const ata = await atasService.findById(id);
    return res.status(200).json(ata);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = ataCodeParamSchema.parse(req.params);
    const ata = await atasService.findByCode(code);
    return res.status(200).json(ata);
  }

  async update(req: Request, res: Response) {
    const { id } = ataIdParamSchema.parse(req.params);
    const data = updateAtaSchema.parse(req.body);
    const ata = await atasService.update(id, data);
    return res.status(200).json(ata);
  }

  async remove(req: Request, res: Response) {
    const { id } = ataIdParamSchema.parse(req.params);
    const result = await atasService.remove(id);
    return res.status(200).json(result);
  }
}