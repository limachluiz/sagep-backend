import { Request, Response } from "express";
import { DashboardService } from "./dashboard.service.js";

const dashboardService = new DashboardService();

export class DashboardController {
  async overview(_req: Request, res: Response) {
    const result = await dashboardService.getOverview();
    return res.status(200).json(result);
  }
}