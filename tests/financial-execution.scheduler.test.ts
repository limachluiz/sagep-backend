import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncAll: vi.fn().mockResolvedValue({ total: 1, synchronized: 1, failed: 0, errors: [] }),
}));

vi.mock("../src/modules/financial-execution/financial-execution.service.js", () => ({
  financialExecutionService: { syncAll: mocks.syncAll },
}));

vi.mock("../src/modules/financial-execution/portal-transparencia.client.js", () => ({
  portalTransparenciaClient: { isConfigured: () => true },
}));

vi.mock("../src/modules/system-settings/system-settings.service.js", () => ({
  systemSettingsService: { getEffective: vi.fn().mockResolvedValue({ portalSyncOnStartup: true, portalSyncIntervalMinutes: 1440 }) },
}));

import { startFinancialExecutionScheduler } from "../src/modules/financial-execution/financial-execution.scheduler.js";

afterEach(() => {
  vi.useRealTimers();
  mocks.syncAll.mockClear();
});

describe("agendador da execução financeira", () => {
  it("sincroniza a carteira assim que o backend inicia", async () => {
    vi.useFakeTimers();

    const timer = startFinancialExecutionScheduler();
    await vi.waitFor(() => expect(mocks.syncAll).toHaveBeenCalledTimes(1));

    timer?.stop();
  });
});
