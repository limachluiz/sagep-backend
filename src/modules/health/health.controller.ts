import { Request, Response } from "express";
import { systemHealthService } from "./health.service.js";
import type { HealthWindow } from "./health.types.js";
import { requestMetricsService } from "./request-metrics.service.js";

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

  async metrics(_req: Request, res: Response) {
    const snapshot = await systemHealthService.getSnapshot();
    const lines = [
      requestMetricsService.openMetrics().trimEnd(),
      "# HELP sagep_health_component_status Estado do componente: 0 normal, 1 degradado, 2 indisponível, -1 não monitorado.",
      "# TYPE sagep_health_component_status gauge",
      "# HELP sagep_health_component_latency_seconds Latência de diagnóstico do componente.",
      "# TYPE sagep_health_component_latency_seconds gauge",
    ];
    const statuses = { operational: 0, degraded: 1, unavailable: 2, not_monitored: -1 };
    for (const component of snapshot.components) {
      lines.push(`sagep_health_component_status{component="${component.id}"} ${statuses[component.status]}`);
      if (component.latencyMs !== null) lines.push(`sagep_health_component_latency_seconds{component="${component.id}"} ${component.latencyMs / 1000}`);
    }
    return res.status(200).type("text/plain; version=0.0.4; charset=utf-8").send(`${lines.join("\n")}\n`);
  },
};
