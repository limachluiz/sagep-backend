-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('PROJECT', 'ESTIMATE', 'DIEX_REQUEST', 'SERVICE_ORDER', 'TASK', 'USER', 'AUTH');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'STATUS_CHANGE', 'STAGE_CHANGE', 'ISSUE', 'FINALIZE', 'CANCEL', 'LOGIN', 'LOGOUT', 'TOKEN_REFRESH');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditActionType" NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "summary" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
