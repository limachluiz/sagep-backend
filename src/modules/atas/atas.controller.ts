import { Request, Response } from "express";
import {
  ataCodeParamSchema,
  ataCoverageGroupParamSchema,
  ataIdParamSchema,
  createAtaCoverageGroupSchema,
  createAtaSchema,
  listAtasQuerySchema,
  updateAtaCoverageGroupSchema,
  updateAtaSchema,
} from "./atas.schemas.js";
import { AtasService } from "./atas.service.js";
import { buildListResponse } from "../../shared/pagination.js";
import { comprasGovBalanceService } from "../compras-gov/compras-gov-balance.service.js";

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
    if (filters.format === "legacy") {
      return res.status(200).json(atas);
    }

    return res.status(200).json(
      buildListResponse({
        items: atas,
        pagination: filters,
        filters,
        path: req.originalUrl,
      }),
    );
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

  async externalBalance(req: Request, res: Response) {
    const { id } = ataIdParamSchema.parse(req.params);
    const comparison = await comprasGovBalanceService.compareAta(id);
    return res.status(200).json(comparison);
  }

  async syncExternalBalance(req: Request, res: Response) {
    const { id } = ataIdParamSchema.parse(req.params);
    const result = await comprasGovBalanceService.syncAta(id);
    return res.status(200).json(result);
  }

  async createCoverageGroup(req: Request, res: Response) {
    const { id } = ataIdParamSchema.parse(req.params);
    const data = createAtaCoverageGroupSchema.parse(req.body);
    const coverageGroup = await atasService.createCoverageGroup(id, data);
    return res.status(201).json(coverageGroup);
  }

  async updateCoverageGroup(req: Request, res: Response) {
    const { id, groupId } = ataCoverageGroupParamSchema.parse(req.params);
    const data = updateAtaCoverageGroupSchema.parse(req.body);
    const coverageGroup = await atasService.updateCoverageGroup(id, groupId, data);
    return res.status(200).json(coverageGroup);
  }

  async removeCoverageGroup(req: Request, res: Response) {
    const { id, groupId } = ataCoverageGroupParamSchema.parse(req.params);
    const result = await atasService.removeCoverageGroup(id, groupId);
    return res.status(200).json(result);
  }

  async remove(req: Request, res: Response) {
    const { id } = ataIdParamSchema.parse(req.params);
    const result = await atasService.remove(id);
    return res.status(200).json(result);
  }
}
