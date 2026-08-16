import { financialExecutionService } from "./financial-execution.service.js";
import { portalTransparenciaClient } from "./portal-transparencia.client.js";
import { systemSettingsService } from "../system-settings/system-settings.service.js";

export function startFinancialExecutionScheduler() {
  if (!portalTransparenciaClient.isConfigured()) {
    console.info("Sincronização automática de NE desativada: token do Portal da Transparência não configurado");
    return null;
  }

  let synchronizationRunning = false;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const synchronize = async (trigger: "STARTUP" | "INTERVAL") => {
    if (synchronizationRunning) {
      console.info("Sincronização automática de NE ignorada: ciclo anterior ainda em execução", { trigger });
      return;
    }

    synchronizationRunning = true;
    try {
      const result = await financialExecutionService.syncAll();
      console.info("Sincronização automática de NE concluída", { trigger, ...result });
    } catch (error) {
      console.error("Falha na sincronização automática de NE", { trigger, error });
    } finally {
      synchronizationRunning = false;
    }
  };

  const schedule = async (startup: boolean) => {
    const settings = await systemSettingsService.getEffective();
    if (startup && settings.portalSyncOnStartup) await synchronize("STARTUP");
    if (stopped) return;
    timer = setTimeout(async () => {
      await synchronize("INTERVAL");
      await schedule(false);
    }, settings.portalSyncIntervalMinutes * 60_000);
    timer.unref();
  };

  void schedule(true).catch((error) => console.error("Falha ao iniciar agendamento de NE", { error }));
  return { stop: () => { stopped = true; if (timer) clearTimeout(timer); } };
}
