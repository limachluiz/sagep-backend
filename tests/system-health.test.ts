import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("../src/config/prisma.js", () => ({
  prisma: { $queryRaw: queryRaw },
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    HEALTH_PGADMIN_URL: undefined,
    HEALTH_PROBE_TIMEOUT_MS: 500,
  },
}));

import { systemHealthService } from "../src/modules/health/health.service.js";

describe("monitoramento de saude do sistema", () => {
  beforeEach(() => queryRaw.mockReset());

  it("valida API e PostgreSQL sem expor infraestrutura administrativa", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const snapshot = await systemHealthService.getSnapshot({ force: true });

    expect(snapshot.status).toBe("operational");
    expect(snapshot.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "api", status: "operational", critical: true }),
      expect.objectContaining({ id: "database", status: "operational", critical: true }),
      expect.objectContaining({ id: "pgadmin", status: "not_monitored", critical: false }),
    ]));
    expect(JSON.stringify(snapshot)).not.toContain("postgresql://");
  });

  it("entrega detalhes de runtime apenas no contrato administrativo", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const details = await systemHealthService.getDetails({ force: true });

    expect(details.diagnostics.infrastructure).toEqual(expect.objectContaining({
      monitoringMode: "service-probes",
      dockerSocketExposed: false,
    }));
    expect(details.diagnostics.infrastructure.units.map((unit) => unit.name)).toEqual([
      "sagep_api",
      "sagep_postgres",
      "sagep_pgadmin",
    ]);
  });
});
