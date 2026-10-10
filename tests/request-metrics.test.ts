import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { httpRouteTemplate, RequestMetricsService } from "../src/modules/health/request-metrics.service.js";
import { requestObservabilityMiddleware } from "../src/middlewares/request-observability.middleware.js";

afterEach(() => vi.restoreAllMocks());

describe("HTTP metrics and safe request logs", () => {
  it("keeps counters monotonic after the diagnostic buffer rolls over", () => {
    const service = new RequestMetricsService();
    for (let i = 0; i < 5_001; i++) service.observe({ method: "GET", route: "/api/projects/:id", statusCode: 200, durationMs: 100, requestId: "request" });
    expect(service.snapshot().totalRequests).toBe(5_000);
    expect(service.openMetrics()).toContain('sagep_http_requests_total{method="GET",route="/api/projects/:id",status="200"} 5001');
    expect(service.openMetrics()).toContain('le="0.1"} 5001');
    expect(service.openMetrics()).toContain('le="0.05"} 0');
    expect(service.openMetrics()).toContain('sagep_http_request_duration_seconds_sum{method="GET",route="/api/projects/:id",status="200"} 500.100000');
  });

  it("bounds series when many new routes are observed", () => {
    const service = new RequestMetricsService();
    for (let i = 0; i < 1_500; i++) service.observe({ method: "GET", route: `/route-${i}`, statusCode: 200, durationMs: 0, requestId: "request" });
    const counters = service.openMetrics().split("\n").filter((line) => line.startsWith("sagep_http_requests_total{"));
    expect(counters).toHaveLength(1_001);
    expect(counters).toContain('sagep_http_requests_total{method="GET",route="/:other",status="200"} 500');
  });

  it("escapes Prometheus labels and treats unmatched paths as a single route", () => {
    expect(httpRouteTemplate("/unknown/secret?token=hidden", undefined)).toBe("/:unmatched");
    expect(httpRouteTemplate("/api/users/private-identifier/documents?token=hidden", "/:cpf/documents")).toBe("/api/users/:cpf/documents");
    const service = new RequestMetricsService();
    service.observe({ method: "CUSTOM", route: '/a"\\\n', statusCode: 500, durationMs: 1, requestId: "request" });
    expect(service.openMetrics()).toContain('method="OTHER",route="/a\\"\\\\\\n"');
  });

  it("logs route templates without CPF, URLs, query tokens or bodies", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const app = express();
    app.use(requestObservabilityMiddleware);
    const router = express.Router();
    router.get("/:cpf/documents", (_req, res) => res.sendStatus(200));
    app.use("/api/users", router);
    await request(app).get("/api/users/private-identifier/documents?token=hidden");
    expect(log).toHaveBeenCalledOnce();
    const entry = JSON.parse(log.mock.calls[0][0]);
    expect(entry.path).toBe("/api/users/:cpf/documents");
    expect(JSON.stringify(entry)).not.toMatch(/private-identifier|hidden|token/);
  });
});
