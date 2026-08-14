import { env } from "../../config/env.js";
import { financialExecutionService } from "./financial-execution.service.js";
import { portalTransparenciaClient } from "./portal-transparencia.client.js";

export function startFinancialExecutionScheduler() {
  if (!portalTransparenciaClient.isConfigured()) {
    console.info("Sincronização automática de NE desativada: token do Portal da Transparência não configurado");
    return null;
  }

  const intervalMs = env.PORTAL_TRANSPARENCIA_SYNC_INTERVAL_MINUTES * 60_000;
  let synchronizationRunning = false;

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

  // Atualiza a carteira ao subir o backend; o intervalo passa a cobrir as
  // mudanças publicadas depois dessa primeira fotografia financeira.
  void synchronize("STARTUP");
  const timer = setInterval(() => void synchronize("INTERVAL"), intervalMs);
  timer.unref();
  return timer;
}
