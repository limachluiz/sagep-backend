import { Request, Response } from "express";
import { DashboardService } from "./dashboard.service.js";

const dashboardService = new DashboardService();

export class DashboardController {
  async overview(_req: Request, res: Response) {
    const data = await dashboardService.overview();
    return res.status(200).json(data);
  }
}