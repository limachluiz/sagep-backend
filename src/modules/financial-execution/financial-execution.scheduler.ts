import { env } from "../../config/env.js";
import { financialExecutionService } from "./financial-execution.service.js";
import { portalTransparenciaClient } from "./portal-transparencia.client.js";

export function startFinancialExecutionScheduler() {
  if (!portalTransparenciaClient.isConfigured()) {
    console.info("Sincronização automática de NE desativada: token do Portal da Transparência não configurado");
    return null;
  }

  const intervalMs = env.PORTAL_TRANSPARENCIA_SYNC_INTERVAL_MINUTES * 60_000;
  const timer = setInterval(() => {
    void financialExecutionService.syncAll().then((result) => {
      console.info("Sincronização automática de NE concluída", result);
    }).catch((error) => {
      console.error("Falha na sincronização automática de NE", error);
    });
  }, intervalMs);
  timer.unref();
  return timer;
}
