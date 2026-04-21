import { Request, Response } from "express";
import {
  createServiceOrderSchema,
  listServiceOrdersQuerySchema,
  serviceOrderCodeParamSchema,
  serviceOrderIdParamSchema,
  updateServiceOrderSchema,
} from "./service-orders.schemas.js";
import { ServiceOrdersService } from "./service-orders.service.js";

const serviceOrdersService = new ServiceOrdersService();

export class ServiceOrdersController {
  async create(req: Request, res: Response) {
    const data = createServiceOrderSchema.parse(req.body);
    const serviceOrder = await serviceOrdersService.create(data, req.user!);
    return res.status(201).json(serviceOrder);
  }

  async list(req: Request, res: Response) {
    const filters = listServiceOrdersQuerySchema.parse(req.query);
    const serviceOrders = await serviceOrdersService.list(filters, req.user!);
    return res.status(200).json(serviceOrders);
  }

  async findById(req: Request, res: Response) {
    const { id } = serviceOrderIdParamSchema.parse(req.params);
    const serviceOrder = await serviceOrdersService.findById(id, req.user!);
    return res.status(200).json(serviceOrder);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = serviceOrderCodeParamSchema.parse(req.params);
    const serviceOrder = await serviceOrdersService.findByCode(code, req.user!);
    return res.status(200).json(serviceOrder);
  }

  async update(req: Request, res: Response) {
    const { id } = serviceOrderIdParamSchema.parse(req.params);
    const data = updateServiceOrderSchema.parse(req.body);
    const serviceOrder = await serviceOrdersService.update(id, data, req.user!);
    return res.status(200).json(serviceOrder);
  }

  async remove(req: Request, res: Response) {
    const { id } = serviceOrderIdParamSchema.parse(req.params);
    const result = await serviceOrdersService.remove(id, req.user!);
    return res.status(200).json(result);
  }
}