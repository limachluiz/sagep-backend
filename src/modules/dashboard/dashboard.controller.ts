import { Request, Response } from "express";
import { DashboardService } from "./dashboard.service.js";
import { dashboardOverviewQuerySchema } from "./dashboard.schemas.js";

const dashboardService = new DashboardService();

export class DashboardController {
  async overview(req: Request, res: Response) {
    const filters = dashboardOverviewQuerySchema.parse(req.query);
    const data = await dashboardService.overview(filters);
    return res.status(200).json(data);
  }
}