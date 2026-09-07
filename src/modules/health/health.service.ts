import { performance } from "node:perf_hooks";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import type {
  HealthComponent,
  HealthHistoryPoint,
  HealthStatus,
  HealthWindow,
  SystemHealthDetails,
  SystemHealthSnapshot,
} from "./health.types.js";

const MAX_MEMORY_HISTORY_POINTS = 10_080;
const MAX_RESPONSE_HISTORY_POINTS = 420;
const SAMPLE_INTERVAL_MS = 60_000;
const RETENTION_MS = 8 * 24 * 60 * 60 * 1_000;
const CACHE_TTL_MS = 5_000;
const startedAt = new Date();
const windowDurationMs: Record<HealthWindow, number> = {
  "3h": 3 * 60 * 60 * 1_000,
  "6h": 6 * 60 * 60 * 1_000,
  "12h": 12 * 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
};

type PersistedHealthPoint = HealthHistoryPoint & {
  pgadminLatencyMs: number | null;
  heapUsedMb: number;
  residentSetMb: number;
  uptimeSeconds: number;
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function statusFromLatency(latencyMs: number, warningAtMs: number): HealthStatus {
  return latencyMs >= warningAtMs ? "degraded" : "operational";
}

function average(values: number[]) {
  return values.length ? round(values.reduce((total, value) => total + value, 0) / values.length) : null;
}

function percentile95(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return round(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.95) - 1)]);
}

function maximum(values: number[]) {
  return values.length ? round(Math.max(...values)) : null;
}

function worstStatus(points: HealthHistoryPoint[]) {
  if (points.some((point) => point.status === "unavailable")) return "unavailable" as const;
  if (points.some((point) => point.status === "degraded")) return "degraded" as const;
  return "operational" as const;
}

function downsampleHistory(points: HealthHistoryPoint[]) {
  if (points.length <= MAX_RESPONSE_HISTORY_POINTS) return points;
  const bucketSize = Math.ceil(points.length / MAX_RESPONSE_HISTORY_POINTS);
  const result: HealthHistoryPoint[] = [];

  for (let index = 0; index < points.length; index += bucketSize) {
    const bucket = points.slice(index, index + bucketSize);
    const databaseValues = bucket.flatMap((point) => point.databaseLatencyMs === null ? [] : [point.databaseLatencyMs]);
    result.push({
      timestamp: bucket.at(-1)!.timestamp,
      status: worstStatus(bucket),
      apiLatencyMs: maximum(bucket.map((point) => point.apiLatencyMs)) ?? 0,
      databaseLatencyMs: maximum(databaseValues),
    });
  }

  return result;
}

async function probeEventLoop() {
  const start = performance.now();
  await new Promise<void>((resolve) => setImmediate(resolve));
  return round(performance.now() - start);
}

async function probeDatabase(): Promise<HealthComponent> {
  const start = performance.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = round(performance.now() - start);
    return {
      id: "database",
      name: "PostgreSQL",
      description: "Persistência e consultas do SAGEP",
      status: statusFromLatency(latencyMs, 250),
      latencyMs,
      critical: true,
      message: latencyMs >= 250 ? "Banco respondendo com lentidão" : "Conexão e consulta validadas",
    };
  } catch {
    return {
      id: "database",
      name: "PostgreSQL",
      description: "Persistência e consultas do SAGEP",
      status: "unavailable",
      latencyMs: null,
      critical: true,
      message: "Não foi possível concluir a consulta de diagnóstico",
    };
  }
}

async function probePgAdmin(): Promise<HealthComponent> {
  if (!env.HEALTH_PGADMIN_URL) {
    return {
      id: "pgadmin",
      name: "pgAdmin",
      description: "Console administrativo do PostgreSQL",
      status: "not_monitored",
      latencyMs: null,
      critical: false,
      message: "Sonda interna não configurada",
    };
  }

  const start = performance.now();
  try {
    const response = await fetch(env.HEALTH_PGADMIN_URL, {
      signal: AbortSignal.timeout(env.HEALTH_PROBE_TIMEOUT_MS),
      headers: { Accept: "text/plain" },
    });
    const latencyMs = round(performance.now() - start);
    const available = response.ok;

    return {
      id: "pgadmin",
      name: "pgAdmin",
      description: "Console administrativo do PostgreSQL",
      status: available ? statusFromLatency(latencyMs, 750) : "unavailable",
      latencyMs,
      critical: false,
      message: available ? "Serviço administrativo acessível" : "Sonda HTTP retornou indisponibilidade",
    };
  } catch {
    return {
      id: "pgadmin",
      name: "pgAdmin",
      description: "Console administrativo do PostgreSQL",
      status: "unavailable",
      latencyMs: null,
      critical: false,
      message: "Serviço administrativo não respondeu à sonda interna",
    };
  }
}

function overallStatus(components: HealthComponent[]): SystemHealthSnapshot["status"] {
  if (components.some((component) => component.critical && component.status === "unavailable")) {
    return "unavailable";
  }
  if (components.some((component) => component.status === "unavailable" || component.status === "degraded")) {
    return "degraded";
  }
  return "operational";
}

class SystemHealthService {
  private history: PersistedHealthPoint[] = [];
  private pendingSamples: PersistedHealthPoint[] = [];
  private pendingSnapshots = new Map<HealthWindow, Promise<SystemHealthSnapshot>>();
  private cachedSnapshots = new Map<HealthWindow, { snapshot: SystemHealthSnapshot; cachedAt: number }>();
  private lastCleanupAt = 0;

  async getSnapshot(options: { force?: boolean; window?: HealthWindow } = {}) {
    const window = options.window ?? "3h";
    const cached = this.cachedSnapshots.get(window);
    if (!options.force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.snapshot;
    }
    const pending = this.pendingSnapshots.get(window);
    if (pending) return pending;

    const request = this.collectSnapshot(window).finally(() => {
      this.pendingSnapshots.delete(window);
    });
    this.pendingSnapshots.set(window, request);
    return request;
  }

  async getDetails(options: { force?: boolean; window?: HealthWindow } = {}): Promise<SystemHealthDetails> {
    const snapshot = await this.getSnapshot(options);
    const memory = process.memoryUsage();

    return {
      ...snapshot,
      diagnostics: {
        runtime: {
          nodeVersion: process.version,
          environment: env.NODE_ENV,
          platform: process.platform,
          architecture: process.arch,
          processId: process.pid,
        },
        memory: {
          residentSetMb: round(memory.rss / 1024 / 1024),
          heapUsedMb: round(memory.heapUsed / 1024 / 1024),
          heapTotalMb: round(memory.heapTotal / 1024 / 1024),
        },
        infrastructure: {
          monitoringMode: "service-probes",
          dockerSocketExposed: false,
          units: snapshot.components.map((component) => ({
            name: component.id === "api" ? "sagep_api" : component.id === "database" ? "sagep_postgres" : "sagep_pgadmin",
            kind: "container-service" as const,
            healthSource: component.id === "api" ? "process" as const : component.id === "database" ? "database-query" as const : "http-probe" as const,
            status: component.status,
          })),
        },
      },
    };
  }

  private async flushPendingSamples() {
    if (!this.pendingSamples.length) return;
    const pending = [...this.pendingSamples];
    try {
      await prisma.systemHealthSample.createMany({
        data: pending.map((point) => ({
          checkedAt: new Date(point.timestamp),
          status: point.status,
          apiLatencyMs: point.apiLatencyMs,
          databaseLatencyMs: point.databaseLatencyMs,
          pgadminLatencyMs: point.pgadminLatencyMs,
          heapUsedMb: point.heapUsedMb,
          residentSetMb: point.residentSetMb,
          uptimeSeconds: point.uptimeSeconds,
        })),
        skipDuplicates: true,
      });
      const persisted = new Set(pending.map((point) => point.timestamp));
      this.pendingSamples = this.pendingSamples.filter((point) => !persisted.has(point.timestamp));

      if (Date.now() - this.lastCleanupAt >= 60 * 60 * 1_000) {
        await prisma.systemHealthSample.deleteMany({
          where: { checkedAt: { lt: new Date(Date.now() - RETENTION_MS) } },
        });
        this.lastCleanupAt = Date.now();
      }
    } catch {
      // O histórico em memória preserva as amostras enquanto o banco estiver indisponível.
    }
  }

  private async loadHistory(window: HealthWindow) {
    const from = new Date(Date.now() - windowDurationMs[window]);
    let persisted: HealthHistoryPoint[] = [];
    try {
      const rows = await prisma.systemHealthSample.findMany({
        where: { checkedAt: { gte: from } },
        orderBy: { checkedAt: "asc" },
        select: { checkedAt: true, status: true, apiLatencyMs: true, databaseLatencyMs: true },
      });
      persisted = rows.map((row) => ({
        timestamp: row.checkedAt.toISOString(),
        status: row.status === "unavailable" ? "unavailable" : row.status === "degraded" ? "degraded" : "operational",
        apiLatencyMs: row.apiLatencyMs,
        databaseLatencyMs: row.databaseLatencyMs,
      }));
    } catch {
      // A própria indisponibilidade do banco não pode derrubar o endpoint de saúde.
    }

    const merged = new Map<string, HealthHistoryPoint>();
    for (const point of persisted) merged.set(point.timestamp, point);
    for (const point of this.history) {
      if (Date.parse(point.timestamp) >= from.getTime()) merged.set(point.timestamp, point);
    }
    return [...merged.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  private async collectSnapshot(window: HealthWindow): Promise<SystemHealthSnapshot> {
    const [apiLatencyMs, database, pgadmin] = await Promise.all([
      probeEventLoop(),
      probeDatabase(),
      probePgAdmin(),
    ]);
    const api: HealthComponent = {
      id: "api",
      name: "API SAGEP",
      description: "Regras de negócio e integração do sistema",
      status: statusFromLatency(apiLatencyMs, 100),
      latencyMs: apiLatencyMs,
      critical: true,
      message: apiLatencyMs >= 100 ? "Processamento sob atenção" : "Processo respondendo normalmente",
    };
    const components = [api, database, pgadmin];
    const status = overallStatus(components);
    const point: HealthHistoryPoint = {
      timestamp: new Date().toISOString(),
      status,
      apiLatencyMs,
      databaseLatencyMs: database.latencyMs,
    };

    const previous = this.history.at(-1);
    if (!previous || Date.parse(point.timestamp) - Date.parse(previous.timestamp) >= SAMPLE_INTERVAL_MS) {
      const memory = process.memoryUsage();
      const persistedPoint: PersistedHealthPoint = {
        ...point,
        pgadminLatencyMs: pgadmin.latencyMs,
        heapUsedMb: round(memory.heapUsed / 1024 / 1024),
        residentSetMb: round(memory.rss / 1024 / 1024),
        uptimeSeconds: Math.floor(process.uptime()),
      };
      this.history = [...this.history, persistedPoint].slice(-MAX_MEMORY_HISTORY_POINTS);
      this.pendingSamples.push(persistedPoint);
    }
    await this.flushPendingSamples();

    const rawHistory = await this.loadHistory(window);
    const healthySamples = rawHistory.filter((item) => item.status === "operational").length;
    const apiLatencies = rawHistory.map((item) => item.apiLatencyMs);
    const databaseLatencies = rawHistory.flatMap((item) => item.databaseLatencyMs === null ? [] : [item.databaseLatencyMs]);
    const incidentCount = rawHistory.filter((item, index) =>
      item.status !== "operational" && (index === 0 || rawHistory[index - 1].status === "operational")
    ).length;
    const monitored = components.filter((component) => component.status !== "not_monitored");
    const snapshot: SystemHealthSnapshot = {
      status,
      checkedAt: point.timestamp,
      uptimeSeconds: Math.floor(process.uptime()),
      availabilityPercent: rawHistory.length ? round((healthySamples / rawHistory.length) * 100, 2) : 100,
      observationWindowStartedAt: rawHistory[0]?.timestamp ?? startedAt.toISOString(),
      historyWindow: window,
      sampleCount: rawHistory.length,
      performance: {
        incidentCount,
        apiAverageMs: average(apiLatencies),
        apiP95Ms: percentile95(apiLatencies),
        apiMaximumMs: maximum(apiLatencies),
        databaseAverageMs: average(databaseLatencies),
        databaseP95Ms: percentile95(databaseLatencies),
        databaseMaximumMs: maximum(databaseLatencies),
      },
      components,
      summary: {
        operational: monitored.filter((component) => component.status === "operational").length,
        degraded: monitored.filter((component) => component.status === "degraded").length,
        unavailable: monitored.filter((component) => component.status === "unavailable").length,
        notMonitored: components.filter((component) => component.status === "not_monitored").length,
      },
      history: downsampleHistory(rawHistory),
    };

    this.cachedSnapshots.set(window, { snapshot, cachedAt: Date.now() });
    return snapshot;
  }
}

export const systemHealthService = new SystemHealthService();
