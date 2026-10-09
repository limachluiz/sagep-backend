import { NextFunction, Request, Response } from "express";
import { requestMetricsService } from "../modules/health/request-metrics.service.js";

export function requestObservabilityMiddleware(req: Request, res: Response, next: NextFunction) {
  const startedAt = performance.now();
  res.on("finish", () => {
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    const requestId = String(res.locals.requestId ?? "unavailable");
    requestMetricsService.observe({ method: req.method, path: req.path, statusCode: res.statusCode, durationMs, requestId });
    const log = { timestamp: new Date().toISOString(), level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", module: "http", requestId, method: req.method, path: req.path, statusCode: res.statusCode, durationMs };
    const serialized = JSON.stringify(log);
    if (res.statusCode >= 500) console.error(serialized); else if (res.statusCode >= 400) console.warn(serialized); else console.info(serialized);
  });
  next();
}
