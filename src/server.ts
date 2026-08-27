import { app } from "./app.js";
import { env } from "./config/env.js";
import { pdfService } from "./shared/pdf.service.js";
import { startFinancialExecutionScheduler } from "./modules/financial-execution/financial-execution.scheduler.js";
import { startBackupScheduler } from "./modules/backups/backups.scheduler.js";
import { startCertificateRenewalScheduler } from "./modules/deployment/certificate-renewal.scheduler.js";
import { initializeSetupToken } from "./modules/setup/setup-token.js";

await initializeSetupToken();
const server = app.listen(env.PORT, () => {
  console.log(`SAGEP backend rodando em http://localhost:${env.PORT}`);
});
const financialExecutionScheduler = startFinancialExecutionScheduler();
const backupScheduler = startBackupScheduler();
const certificateRenewalScheduler = startCertificateRenewalScheduler();

async function shutdown(signal: string) {
  console.log(`${signal} recebido, encerrando servidor HTTP e browser de PDF...`);
  server.close(async () => {
    financialExecutionScheduler?.stop();
    backupScheduler?.stop();
    certificateRenewalScheduler?.stop();
    await pdfService.closeBrowser();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
