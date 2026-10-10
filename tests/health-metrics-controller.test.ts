import { describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/health/health.service.js", () => ({
  systemHealthService: {
    getSnapshot: vi.fn(async () => ({ components: [
      { id: "database", status: "unavailable", latencyMs: null, message: "private infrastructure details" },
      { id: "backups", status: "degraded", latencyMs: null },
      { id: "api", status: "operational", latencyMs: 12 },
      { id: "certificate", status: "not_monitored", latencyMs: null },
    ] })),
  },
}));
import { healthController } from "../src/modules/health/health.controller.js";

describe("protected infrastructure metrics", () => {
  it("exposes machine-readable component states and latency without diagnostic messages", async () => {
    const response = { status: vi.fn(), type: vi.fn(), send: vi.fn() };
    response.status.mockReturnValue(response);
    response.type.mockReturnValue(response);
    await healthController.metrics({} as any, response as any);
    const metrics = response.send.mock.calls[0][0];
    expect(metrics).toContain('sagep_health_component_status{component="database"} 2');
    expect(metrics).toContain('sagep_health_component_status{component="backups"} 1');
    expect(metrics).toContain('sagep_health_component_status{component="certificate"} -1');
    expect(metrics).toContain('sagep_health_component_latency_seconds{component="api"} 0.012');
    expect(metrics).not.toContain("private infrastructure details");
    expect(metrics).not.toContain('sagep_health_component_latency_seconds{component="database"}');
    expect(response.type).toHaveBeenCalledWith("text/plain; version=0.0.4; charset=utf-8");
  });
});
