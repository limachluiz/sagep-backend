import { afterEach, describe, expect, it, vi } from "vitest";

const automation = vi.hoisted(() => ({
  claimScheduled: vi.fn(),
  releaseScheduledClaim: vi.fn(),
  run: vi.fn(),
}));

vi.mock("../src/modules/notification-settings/notification-automation.service.js", () => ({
  notificationAutomationService: automation,
}));

import { startNotificationAutomationScheduler } from "../src/modules/notification-settings/notification-automation.scheduler.js";

describe("agendador da automação de notificações", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("libera o horário reservado quando a execução não consegue iniciar", async () => {
    vi.useFakeTimers();
    automation.claimScheduled.mockResolvedValueOnce("2026-10-15@15:00").mockResolvedValue(null);
    automation.run.mockRejectedValueOnce(new Error("conflito transitório"));
    automation.releaseScheduledClaim.mockResolvedValue(undefined);
    const scheduler = startNotificationAutomationScheduler();
    await vi.advanceTimersByTimeAsync(1);
    expect(automation.releaseScheduledClaim).toHaveBeenCalledWith("2026-10-15@15:00");
    scheduler.stop();
  });
});
