type RequestSample = { method: string; route: string; statusCode: number; durationMs: number; occurredAt: string; requestId: string };
const MAX_SAMPLES = 5_000;
const startedAt = Date.now();

function metricRoute(pathname: string) {
  return pathname.split("/").map((part) => /^[0-9a-f]{20,}$/i.test(part) || /^\d{4}(?:NE|NS|OB|DR|DF)\d+$/i.test(part) ? ":id" : part).join("/") || "/";
}

class RequestMetricsService {
  private samples: RequestSample[] = [];

  observe(sample: Omit<RequestSample, "route" | "occurredAt"> & { path: string }) {
    this.samples.push({ method: sample.method, route: metricRoute(sample.path), statusCode: sample.statusCode, durationMs: sample.durationMs, requestId: sample.requestId, occurredAt: new Date().toISOString() });
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
  }

  snapshot(windowMs = 15 * 60_000) {
    const cutoff = Date.now() - windowMs;
    const recent = this.samples.filter((item) => Date.parse(item.occurredAt) >= cutoff);
    const ordered = recent.map((item) => item.durationMs).sort((a, b) => a - b);
    const countByStatus = { success: 0, clientError: 0, serverError: 0 };
    for (const item of recent) item.statusCode >= 500 ? countByStatus.serverError++ : item.statusCode >= 400 ? countByStatus.clientError++ : countByStatus.success++;
    return { startedAt: new Date(startedAt).toISOString(), windowMinutes: Math.round(windowMs / 60_000), totalRequests: recent.length, countByStatus, averageDurationMs: recent.length ? Math.round(recent.reduce((sum, item) => sum + item.durationMs, 0) / recent.length * 10) / 10 : 0, p95DurationMs: ordered.length ? Math.round(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * .95) - 1)] * 10) / 10 : 0, recentServerErrors: recent.filter((item) => item.statusCode >= 500).slice(-20).reverse() };
  }

  openMetrics() {
    const grouped = new Map<string, { count: number; duration: number }>();
    for (const item of this.samples) { const key = `${item.method}|${item.route}|${item.statusCode}`; const current = grouped.get(key) ?? { count: 0, duration: 0 }; current.count += 1; current.duration += item.durationMs / 1000; grouped.set(key, current); }
    const lines = ["# HELP sagep_http_requests_total Total de requisições HTTP processadas.", "# TYPE sagep_http_requests_total counter", "# HELP sagep_http_request_duration_seconds_sum Soma da duração das requisições HTTP.", "# TYPE sagep_http_request_duration_seconds_sum counter", `sagep_process_uptime_seconds ${Math.floor(process.uptime())}`];
    for (const [key, value] of grouped) { const [method, route, status] = key.split("|"); const labels = `method="${method}",route="${route}",status="${status}"`; lines.push(`sagep_http_requests_total{${labels}} ${value.count}`, `sagep_http_request_duration_seconds_sum{${labels}} ${value.duration.toFixed(6)}`); }
    return `${lines.join("\n")}\n`;
  }
}

export const requestMetricsService = new RequestMetricsService();
