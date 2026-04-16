import { Request, Response } from "express";
import {
  createMilitaryOrganizationSchema,
  listMilitaryOrganizationsQuerySchema,
  militaryOrganizationCodeParamSchema,
  militaryOrganizationIdParamSchema,
  updateMilitaryOrganizationSchema,
} from "./military-organizations.schemas.js";
import { MilitaryOrganizationsService } from "./military-organizations.service.js";

const service = new MilitaryOrganizationsService();

export class MilitaryOrganizationsController {
  async create(req: Request, res: Response) {
    const data = createMilitaryOrganizationSchema.parse(req.body);
    const om = await service.create(data);
    return res.status(201).json(om);
  }

  async list(req: Request, res: Response) {
    const filters = listMilitaryOrganizationsQuerySchema.parse(req.query);
    const oms = await service.list(filters);
    return res.status(200).json(oms);
  }

  async findById(req: Request, res: Response) {
    const { id } = militaryOrganizationIdParamSchema.parse(req.params);
    const om = await service.findById(id);
    return res.status(200).json(om);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = militaryOrganizationCodeParamSchema.parse(req.params);
    const om = await service.findByCode(code);
    return res.status(200).json(om);
  }

  async update(req: Request, res: Response) {
    const { id } = militaryOrganizationIdParamSchema.parse(req.params);
    const data = updateMilitaryOrganizationSchema.parse(req.body);
    const om = await service.update(id, data);
    return res.status(200).json(om);
  }

  async updateByCode(req: Request, res: Response) {
    const { code } = militaryOrganizationCodeParamSchema.parse(req.params);
    const data = updateMilitaryOrganizationSchema.parse(req.body);
    const om = await service.updateByCode(code, data);
    return res.status(200).json(om);
  }

  async remove(req: Request, res: Response) {
    const { id } = militaryOrganizationIdParamSchema.parse(req.params);
    const result = await service.remove(id);
    return res.status(200).json(result);
  }

  async removeByCode(req: Request, res: Response) {
    const { code } = militaryOrganizationCodeParamSchema.parse(req.params);
    const result = await service.removeByCode(code);
    return res.status(200).json(result);
  }
}