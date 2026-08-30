import { env } from "../../config/env.js";
import { backupsService } from "./backups.service.js";

export function startBackupScheduler() {
  if (env.BACKUP_SCHEDULE_HOURS <= 0) {
    console.info("Backup automático desativado por configuração");
    return null;
  }

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  const run = async (trigger: "STARTUP" | "INTERVAL") => {
    if (running || stopped) return;
    running = true;
    try {
      const backup = await backupsService.create("AUTOMATIC");
      console.info("Backup automático concluído", { trigger, id: backup.id, sizeBytes: backup.sizeBytes });
    } catch (error) {
      console.error("Falha no backup automático", { trigger, error });
    } finally {
      running = false;
    }
  };

  if (env.BACKUP_RUN_ON_STARTUP) void run("STARTUP");
  timer = setInterval(() => void run("INTERVAL"), env.BACKUP_SCHEDULE_HOURS * 3_600_000);
  timer.unref();
  return { stop: () => { stopped = true; if (timer) clearInterval(timer); } };
}
