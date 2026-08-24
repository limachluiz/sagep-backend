import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  createUpdateId,
  parseUpdateArguments,
  validatePinnedCommit,
  validateUpdateManifest,
} from "../scripts/update-sagep.mjs";

const backendCommit = "a".repeat(40);
const frontendCommit = "b".repeat(40);

describe("atualizador seguro da implantação", () => {
  it("exige SHA completo e normaliza letras maiúsculas", () => {
    expect(validatePinnedCommit(backendCommit.toUpperCase())).toBe(backendCommit);
    expect(() => validatePinnedCommit("abc123")).toThrow(/40 caracteres/);
    expect(() => validatePinnedCommit(`${"g".repeat(40)}`)).toThrow(/40 caracteres/);
  });

  it("gera identificador cronológico sem caracteres de caminho", () => {
    expect(createUpdateId(new Date("2026-08-24T12:34:56.000Z"))).toBe("20260824123456");
    expect(() => createUpdateId(new Date("inválida"))).toThrow(/Data inválida/);
  });

  it("interpreta verificação, aplicação e rollback com confirmações independentes", () => {
    expect(parseUpdateArguments([]).mode).toBe("check");
    expect(parseUpdateArguments([
      "--apply",
      "--backend-ref", backendCommit,
      "--frontend-ref", frontendCommit,
      "--confirm-update", "ATUALIZAR",
    ])).toMatchObject({
      mode: "apply",
      backendRef: backendCommit,
      frontendRef: frontendCommit,
      confirmUpdate: true,
    });
    expect(parseUpdateArguments([
      "--rollback", "20260824123456",
      "--confirm-rollback", "REVERTER",
      "--restore-database",
      "--confirm-database", "RESTAURAR-BANCO",
    ])).toMatchObject({
      mode: "rollback",
      rollbackId: "20260824123456",
      confirmRollback: true,
      restoreDatabase: true,
      confirmDatabase: true,
    });
  });

  it("rejeita manifesto incompleto antes de qualquer rollback", () => {
    expect(() => validateUpdateManifest({ format: "OUTRO" })).toThrow(/Manifesto/);
    expect(() => validateUpdateManifest({
      format: "SAGEP_DEPLOYMENT_UPDATE_V1",
      id: "../../etc/passwd",
    })).toThrow(/Identificador/);
    expect(() => validateUpdateManifest({
      format: "SAGEP_DEPLOYMENT_UPDATE_V1",
      id: "20260824123456",
      backend: { directory: path.resolve("."), before: backendCommit, target: backendCommit },
      frontend: { directory: path.resolve("../sagep-web"), before: frontendCommit, target: frontendCommit },
      databaseBackup: { id: "123e4567-e89b-42d3-a456-426614174000" },
      images: [],
    })).toThrow(/imagens/);
  });
});
