import { performance } from "node:perf_hooks";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import type {
  HealthComponent,
  HealthHistoryPoint,
  HealthStatus,
  SystemHealthDetails,
  SystemHealthSnapshot,
} from "./health.types.js";

const MAX_HISTORY_POINTS = 120;
const CACHE_TTL_MS = 5_000;
const startedAt = new Date();

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function statusFromLatency(latencyMs: number, warningAtMs: number): HealthStatus {
  return latencyMs >= warningAtMs ? "degraded" : "operational";
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
  private history: HealthHistoryPoint[] = [];
  private pendingSnapshot: Promise<SystemHealthSnapshot> | null = null;
  private cachedSnapshot: SystemHealthSnapshot | null = null;
  private cachedAt = 0;

  async getSnapshot(options: { force?: boolean } = {}) {
    if (!options.force && this.cachedSnapshot && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cachedSnapshot;
    }
    if (this.pendingSnapshot) return this.pendingSnapshot;

    this.pendingSnapshot = this.collectSnapshot().finally(() => {
      this.pendingSnapshot = null;
    });
    return this.pendingSnapshot;
  }

  async getDetails(options: { force?: boolean } = {}): Promise<SystemHealthDetails> {
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

  private async collectSnapshot(): Promise<SystemHealthSnapshot> {
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
    if (!previous || Date.parse(point.timestamp) - Date.parse(previous.timestamp) >= CACHE_TTL_MS) {
      this.history = [...this.history, point].slice(-MAX_HISTORY_POINTS);
    }

    const healthySamples = this.history.filter((item) => item.status === "operational").length;
    const monitored = components.filter((component) => component.status !== "not_monitored");
    const snapshot: SystemHealthSnapshot = {
      status,
      checkedAt: point.timestamp,
      uptimeSeconds: Math.floor(process.uptime()),
      availabilityPercent: this.history.length ? round((healthySamples / this.history.length) * 100, 2) : 100,
      observationWindowStartedAt: this.history[0]?.timestamp ?? startedAt.toISOString(),
      components,
      summary: {
        operational: monitored.filter((component) => component.status === "operational").length,
        degraded: monitored.filter((component) => component.status === "degraded").length,
        unavailable: monitored.filter((component) => component.status === "unavailable").length,
        notMonitored: components.filter((component) => component.status === "not_monitored").length,
      },
      history: [...this.history],
    };

    this.cachedSnapshot = snapshot;
    this.cachedAt = Date.now();
    return snapshot;
  }
}

export const systemHealthService = new SystemHealthService();
