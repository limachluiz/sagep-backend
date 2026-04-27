import { Request, Response } from "express";
import { DashboardService } from "./dashboard.service.js";
import {
  dashboardExecutiveQuerySchema,
  dashboardOperationalQuerySchema,
  dashboardOverviewQuerySchema,
} from "./dashboard.schemas.js";

const dashboardService = new DashboardService();

export class DashboardController {
  async overview(req: Request, res: Response) {
    const filters = dashboardOverviewQuerySchema.parse(req.query);
    const data = await dashboardService.overview(filters);
    return res.status(200).json(data);
  }

  async operational(req: Request, res: Response) {
    const filters = dashboardOperationalQuerySchema.parse(req.query);
    const data = await dashboardService.operational(filters, req.user!);
    return res.status(200).json(data);
  }

  async executive(req: Request, res: Response) {
    const filters = dashboardExecutiveQuerySchema.parse(req.query);
    const data = await dashboardService.executive(filters);
    return res.status(200).json(data);
  }
}
