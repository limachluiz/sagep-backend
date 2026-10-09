export type HealthStatus = "operational" | "degraded" | "unavailable" | "not_monitored";
export type HealthWindow = "3h" | "6h" | "12h" | "24h" | "7d";

export type HealthComponent = {
  id: "api" | "database" | "pgadmin" | "storage" | "backups" | "certificate" | "automations";
  name: string;
  description: string;
  status: HealthStatus;
  latencyMs: number | null;
  critical: boolean;
  message: string;
};

export type HealthHistoryPoint = {
  timestamp: string;
  status: Exclude<HealthStatus, "not_monitored">;
  apiLatencyMs: number;
  databaseLatencyMs: number | null;
};

export type SystemHealthSnapshot = {
  status: Exclude<HealthStatus, "not_monitored">;
  checkedAt: string;
  uptimeSeconds: number;
  availabilityPercent: number;
  observationWindowStartedAt: string;
  historyWindow: HealthWindow;
  sampleCount: number;
  performance: {
    incidentCount: number;
    apiAverageMs: number | null;
    apiP95Ms: number | null;
    apiMaximumMs: number | null;
    databaseAverageMs: number | null;
    databaseP95Ms: number | null;
    databaseMaximumMs: number | null;
  };
  components: HealthComponent[];
  summary: {
    operational: number;
    degraded: number;
    unavailable: number;
    notMonitored: number;
  };
  history: HealthHistoryPoint[];
};

export type SystemHealthDetails = SystemHealthSnapshot & {
  diagnostics: {
    runtime: {
      nodeVersion: string;
      environment: string;
      platform: string;
      architecture: string;
      processId: number;
    };
    memory: {
      residentSetMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
    };
    requests: {
      startedAt: string;
      windowMinutes: number;
      totalRequests: number;
      countByStatus: { success: number; clientError: number; serverError: number };
      averageDurationMs: number;
      p95DurationMs: number;
      recentServerErrors: Array<{ method: string; route: string; statusCode: number; durationMs: number; occurredAt: string; requestId: string }>;
    };
    infrastructure: {
      monitoringMode: "service-probes";
      dockerSocketExposed: false;
      units: Array<{
        name: string;
        kind: "container-service" | "system-check";
        healthSource: "process" | "database-query" | "http-probe" | "filesystem" | "database-state" | "certificate";
        status: HealthStatus;
      }>;
    };
  };
};
