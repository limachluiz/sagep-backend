-- O saldo operacional passa a ser controlado exclusivamente pelo SAGEP.
-- Movimentos manuais originados de conciliação externa são removidos para
-- restaurar o saldo calculado apenas pelos fluxos internos do sistema.
DELETE FROM "AtaItemBalanceMovement"
WHERE "movementType" = 'EXTERNAL_CONSUMPTION';

DELETE FROM "AuditLog"
WHERE "action" = 'REGISTER_EXTERNAL_CONSUMPTION';

DROP TABLE IF EXISTS "AtaItemExternalBalanceSnapshot";

ALTER TYPE "AtaItemBalanceMovementType" RENAME TO "AtaItemBalanceMovementType_old";
CREATE TYPE "AtaItemBalanceMovementType" AS ENUM (
  'RESERVE',
  'RELEASE',
  'CONSUME',
  'REVERSE_CONSUME',
  'ADJUSTMENT'
);
ALTER TABLE "AtaItemBalanceMovement"
  ALTER COLUMN "movementType" TYPE "AtaItemBalanceMovementType"
  USING ("movementType"::text::"AtaItemBalanceMovementType");
DROP TYPE "AtaItemBalanceMovementType_old";

ALTER TYPE "AuditActionType" RENAME TO "AuditActionType_old";
CREATE TYPE "AuditActionType" AS ENUM (
  'CREATE',
  'UPDATE',
  'DELETE',
  'ARCHIVE',
  'RESTORE',
  'STATUS_CHANGE',
  'STAGE_CHANGE',
  'ISSUE',
  'FINALIZE',
  'CANCEL',
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'TOKEN_REFRESH',
  'SESSION_REVOKE',
  'SESSION_REVOKE_ALL',
  'SESSION_EXPIRE',
  'SESSION_CLEANUP',
  'SYNC',
  'DISMISS',
  'CONNECTION_TEST'
);
ALTER TABLE "AuditLog"
  ALTER COLUMN "action" TYPE "AuditActionType"
  USING ("action"::text::"AuditActionType");
DROP TYPE "AuditActionType_old";
