import { Request, Response } from "express";
import { notificationKeyParamSchema, operationalAlertsQuerySchema } from "./operational-alerts.schemas.js";
import { OperationalAlertsService } from "./operational-alerts.service.js";

const operationalAlertsService = new OperationalAlertsService();

export class OperationalAlertsController {
  async list(req: Request, res: Response) {
    const filters = operationalAlertsQuerySchema.parse(req.query);
    const alerts = await operationalAlertsService.list(filters, req.user!);
    return res.status(200).json(alerts);
  }

  async dismissAll(req: Request, res: Response) {
    const filters = operationalAlertsQuerySchema.parse(req.query);
    return res.status(200).json(await operationalAlertsService.dismissAll(filters, req.user!));
  }

  async dismissOne(req: Request, res: Response) {
    const { notificationKey } = notificationKeyParamSchema.parse(req.params);
    return res.status(200).json(await operationalAlertsService.dismissOne(notificationKey, req.user!));
  }
}
