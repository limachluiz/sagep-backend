import { Request, Response } from "express";
import { systemHealthService } from "./health.service.js";

function forceRequested(req: Request) {
  return req.query.refresh === "true";
}

export const healthController = {
  liveness(_req: Request, res: Response) {
    return res.status(200).json({
      message: "SAGEP backend online",
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  },

  async status(req: Request, res: Response) {
    const snapshot = await systemHealthService.getSnapshot({ force: forceRequested(req) });
    return res.status(200).json(snapshot);
  },

  async details(req: Request, res: Response) {
    const snapshot = await systemHealthService.getDetails({ force: forceRequested(req) });
    return res.status(200).json(snapshot);
  },
};
