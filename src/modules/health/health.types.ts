export type HealthStatus = "operational" | "degraded" | "unavailable" | "not_monitored";

export type HealthComponent = {
  id: "api" | "database" | "pgadmin";
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
    infrastructure: {
      monitoringMode: "service-probes";
      dockerSocketExposed: false;
      units: Array<{
        name: string;
        kind: "container-service";
        healthSource: "process" | "database-query" | "http-probe";
        status: HealthStatus;
      }>;
    };
  };
};
