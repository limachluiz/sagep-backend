import { systemHealthService } from "./health.service.js";

const HEALTH_COLLECTION_INTERVAL_MS = 60_000;

export function startHealthScheduler() {
  let running = false;

  const collect = async () => {
    if (running) return;
    running = true;
    try {
      await systemHealthService.getSnapshot({ force: true, window: "3h" });
    } catch (error) {
      console.error("Falha na coleta automática de saúde", { error });
    } finally {
      running = false;
    }
  };

  void collect();
  const timer = setInterval(() => void collect(), HEALTH_COLLECTION_INTERVAL_MS);
  timer.unref();

  return { stop: () => clearInterval(timer) };
}
