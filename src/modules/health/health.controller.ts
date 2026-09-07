import { Request, Response } from "express";
import { systemHealthService } from "./health.service.js";
import type { HealthWindow } from "./health.types.js";

function forceRequested(req: Request) {
  return req.query.refresh === "true";
}

const healthWindows = new Set<HealthWindow>(["3h", "6h", "12h", "24h", "7d"]);

function requestedWindow(req: Request): HealthWindow {
  const value = typeof req.query.window === "string" ? req.query.window : "3h";
  return healthWindows.has(value as HealthWindow) ? value as HealthWindow : "3h";
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
    const snapshot = await systemHealthService.getSnapshot({ force: forceRequested(req), window: requestedWindow(req) });
    return res.status(200).json(snapshot);
  },

  async details(req: Request, res: Response) {
    const snapshot = await systemHealthService.getDetails({ force: forceRequested(req), window: requestedWindow(req) });
    return res.status(200).json(snapshot);
  },
};
