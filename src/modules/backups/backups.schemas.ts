import { z } from "zod";

export const backupIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const restoreBackupSchema = z.object({
  confirmation: z.literal("RESTAURAR BANCO"),
});

export const selectiveExportSchema = z.object({
  modules: z
    .array(z.enum(["PROJECTS", "ATAS", "USERS", "SETTINGS", "AUDIT"]))
    .min(1)
    .max(5),
});

export type SelectiveExportModule = z.infer<typeof selectiveExportSchema>["modules"][number];
