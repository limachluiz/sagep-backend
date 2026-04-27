import { Request, Response } from "express";
import {
  archivedServiceOrdersQuerySchema,
  createServiceOrderSchema,
  listServiceOrdersQuerySchema,
  serviceOrderCodeParamSchema,
  serviceOrderIdParamSchema,
  updateServiceOrderSchema,
} from "./service-orders.schemas.js";
import { ServiceOrdersService } from "./service-orders.service.js";
import { ServiceOrderDocumentService } from "./service-order-document.service.js";

const serviceOrdersService = new ServiceOrdersService();
const serviceOrderDocumentService = new ServiceOrderDocumentService();
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
    const query = archivedServiceOrdersQuerySchema.parse(req.query);
    const serviceOrder = await serviceOrdersService.findById(id, req.user!, query);
    return res.status(200).json(serviceOrder);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = serviceOrderCodeParamSchema.parse(req.params);
    const query = archivedServiceOrdersQuerySchema.parse(req.query);
    const serviceOrder = await serviceOrdersService.findByCode(code, req.user!, query);
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

  async restore(req: Request, res: Response) {
    const { id } = serviceOrderIdParamSchema.parse(req.params);
    const result = await serviceOrdersService.restore(id, req.user!);
    return res.status(200).json(result);
  }
    async documentHtml(req: Request, res: Response) {
    const { id } = serviceOrderIdParamSchema.parse(req.params);
    const html = await serviceOrderDocumentService.generateServiceOrderHtml(id, req.user!);
    return res.status(200).contentType("text/html; charset=utf-8").send(html);
  }

  async documentPdf(req: Request, res: Response) {
    const { id } = serviceOrderIdParamSchema.parse(req.params);
    const pdf = await serviceOrderDocumentService.generateServiceOrderPdf(id, req.user!);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="ordem-servico-${id}.pdf"`
    );

    return res.status(200).send(pdf);
  }
}
