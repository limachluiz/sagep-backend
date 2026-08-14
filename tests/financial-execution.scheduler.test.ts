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

import { startFinancialExecutionScheduler } from "../src/modules/financial-execution/financial-execution.scheduler.js";

afterEach(() => {
  vi.useRealTimers();
  mocks.syncAll.mockClear();
});

describe("agendador da execução financeira", () => {
  it("sincroniza a carteira assim que o backend inicia", async () => {
    vi.useFakeTimers();

    const timer = startFinancialExecutionScheduler();
    await Promise.resolve();

    expect(mocks.syncAll).toHaveBeenCalledTimes(1);
    if (timer) clearInterval(timer);
  });
});
