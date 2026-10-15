import { notificationAutomationService } from "./notification-automation.service.js";

const POLL_INTERVAL_MS = 30_000;

export function startNotificationAutomationScheduler() {
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    let claimedKey: string | null = null;
    try {
      claimedKey = await notificationAutomationService.claimScheduled();
      if (claimedKey) {
        const result = await notificationAutomationService.run("SCHEDULED");
        console.info("Automação de notificações concluída", { runId: result?.id, status: result?.status });
      }
    } catch (error) {
      if (claimedKey) await notificationAutomationService.releaseScheduledClaim(claimedKey).catch(() => undefined);
      console.error("Falha na automação de notificações", { error });
    } finally { running = false; }
  };
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  timer.unref();
  void tick();
  return { stop: () => { stopped = true; clearInterval(timer); } };
}
