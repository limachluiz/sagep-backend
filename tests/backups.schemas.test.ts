import { describe, expect, it } from "vitest";
import { backupIdParamSchema, restoreBackupSchema, selectiveExportSchema } from "../src/modules/backups/backups.schemas.js";

describe("contratos de backup", () => {
  it("exige UUID e confirmação literal para restauração", () => {
    expect(backupIdParamSchema.safeParse({ id: "not-an-id" }).success).toBe(false);
    expect(restoreBackupSchema.safeParse({ confirmation: "RESTAURAR" }).success).toBe(false);
    expect(restoreBackupSchema.parse({ confirmation: "RESTAURAR BANCO" })).toEqual({ confirmation: "RESTAURAR BANCO" });
  });

  it("aceita somente módulos conhecidos na exportação seletiva", () => {
    expect(selectiveExportSchema.parse({ modules: ["PROJECTS", "ATAS"] }).modules).toEqual(["PROJECTS", "ATAS"]);
    expect(selectiveExportSchema.safeParse({ modules: [] }).success).toBe(false);
    expect(selectiveExportSchema.safeParse({ modules: ["SECRETS"] }).success).toBe(false);
  });
});
