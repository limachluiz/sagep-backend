type RequestSample = { method: string; route: string; statusCode: number; durationMs: number; occurredAt: string; requestId: string };
type MetricSeries = { method: string; route: string; statusCode: number; count: number; duration: number; buckets: number[] };
const MAX_SAMPLES = 5_000;
const MAX_SERIES = 1_000;
const DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function escapeLabel(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

/** Only route templates belong in logs or metric labels; never URL parameter values. */
export function httpRouteTemplate(originalUrl: string, routePath: unknown) {
  if (typeof routePath !== "string") return "/:unmatched";
  const segments = originalUrl.split("?")[0].split("/").filter(Boolean);
  const routeSegments = routePath.split("/").filter(Boolean);
  // Routers are mounted on static prefixes. Route parameters replace the suffix.
  return `/${[...segments.slice(0, Math.max(0, segments.length - routeSegments.length)), ...routeSegments].join("/")}`;
}

export class RequestMetricsService {
  private samples: RequestSample[] = [];
  private series = new Map<string, MetricSeries>();
  private startedAt = new Date().toISOString();

  observe(sample: Omit<RequestSample, "occurredAt">) {
    const method = METHODS.has(sample.method) ? sample.method : "OTHER";
    const statusCode = Number.isInteger(sample.statusCode) && sample.statusCode >= 100 && sample.statusCode <= 599 ? sample.statusCode : 500;
    const durationMs = Number.isFinite(sample.durationMs) ? Math.max(0, sample.durationMs) : 0;
    this.samples.push({ ...sample, method, statusCode, durationMs, occurredAt: new Date().toISOString() });
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);

    let route = sample.route;
    let key = JSON.stringify([method, route, statusCode]);
    if (!this.series.has(key) && this.series.size >= MAX_SERIES) {
      route = "/:other";
      key = JSON.stringify([method, route, statusCode]);
    }
    const current = this.series.get(key) ?? { method, route, statusCode, count: 0, duration: 0, buckets: DURATION_BUCKETS.map(() => 0) };
    const seconds = durationMs / 1000;
    current.count++;
    current.duration += seconds;
    DURATION_BUCKETS.forEach((bound, index) => { if (seconds <= bound) current.buckets[index]++; });
    this.series.set(key, current);
  }

  snapshot(windowMs = 15 * 60_000) {
    const cutoff = Date.now() - windowMs;
    const recent = this.samples.filter((item) => Date.parse(item.occurredAt) >= cutoff);
    const ordered = recent.map((item) => item.durationMs).sort((a, b) => a - b);
    const countByStatus = { success: 0, clientError: 0, serverError: 0 };
    for (const item of recent) item.statusCode >= 500 ? countByStatus.serverError++ : item.statusCode >= 400 ? countByStatus.clientError++ : countByStatus.success++;
    return { startedAt: this.startedAt, windowMinutes: Math.round(windowMs / 60_000), totalRequests: recent.length, countByStatus, averageDurationMs: recent.length ? Math.round(recent.reduce((sum, item) => sum + item.durationMs, 0) / recent.length * 10) / 10 : 0, p95DurationMs: ordered.length ? Math.round(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * .95) - 1)] * 10) / 10 : 0, recentServerErrors: recent.filter((item) => item.statusCode >= 500).slice(-20).reverse() };
  }

  openMetrics() {
    const lines = [
      "# HELP sagep_http_requests_total Total de requisições HTTP desde o início do processo.",
      "# TYPE sagep_http_requests_total counter",
      "# HELP sagep_http_request_duration_seconds Duração das requisições HTTP em segundos.",
      "# TYPE sagep_http_request_duration_seconds histogram",
      "# HELP sagep_process_uptime_seconds Tempo de atividade do processo.",
      "# TYPE sagep_process_uptime_seconds gauge",
      `sagep_process_uptime_seconds ${Math.floor(process.uptime())}`,
    ];
    for (const value of this.series.values()) {
      const labels = `method="${escapeLabel(value.method)}",route="${escapeLabel(value.route)}",status="${value.statusCode}"`;
      lines.push(`sagep_http_requests_total{${labels}} ${value.count}`);
      DURATION_BUCKETS.forEach((bound, index) => lines.push(`sagep_http_request_duration_seconds_bucket{${labels},le="${bound}"} ${value.buckets[index]}`));
      lines.push(`sagep_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${value.count}`, `sagep_http_request_duration_seconds_count{${labels}} ${value.count}`, `sagep_http_request_duration_seconds_sum{${labels}} ${value.duration.toFixed(6)}`);
    }
    return `${lines.join("\n")}\n`;
  }
}

export const requestMetricsService = new RequestMetricsService();
