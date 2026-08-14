import { app } from "./app.js";
import { env } from "./config/env.js";
import { pdfService } from "./shared/pdf.service.js";
import { startFinancialExecutionScheduler } from "./modules/financial-execution/financial-execution.scheduler.js";

const server = app.listen(env.PORT, () => {
  console.log(`SAGEP backend rodando em http://localhost:${env.PORT}`);
});
const financialExecutionTimer = startFinancialExecutionScheduler();

async function shutdown(signal: string) {
  console.log(`${signal} recebido, encerrando servidor HTTP e browser de PDF...`);
  server.close(async () => {
    if (financialExecutionTimer) clearInterval(financialExecutionTimer);
    await pdfService.closeBrowser();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
