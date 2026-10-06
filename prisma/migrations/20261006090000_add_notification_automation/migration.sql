CREATE TYPE "NotificationAutomationRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');
CREATE TYPE "NotificationAutomationEventType" AS ENUM ('NE_DISCOVERED', 'NE_LIQUIDATED', 'NE_PAID', 'ATA_BALANCE_CHANGED', 'AUTOMATION_FAILED');

CREATE TABLE "NotificationAutomationConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Manaus',
    "hour" INTEGER NOT NULL DEFAULT 7,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "syncTrackedCommitments" BOOLEAN NOT NULL DEFAULT true,
    "discoverCommitments" BOOLEAN NOT NULL DEFAULT true,
    "syncAtaBalances" BOOLEAN NOT NULL DEFAULT true,
    "managementUnits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailListIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notifyRoles" "UserRole"[] NOT NULL DEFAULT ARRAY['ADMIN', 'GESTOR']::"UserRole"[],
    "maxDiscoveryPages" INTEGER NOT NULL DEFAULT 100,
    "lastScheduledKey" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationAutomationConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationAutomationRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "NotificationAutomationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "error" TEXT,
    "requestedById" TEXT,
    CONSTRAINT "NotificationAutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationAutomationEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "type" "NotificationAutomationEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detailsPath" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailSentAt" TIMESTAMP(3),
    "telegramSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "telegramError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationAutomationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationAutomationRun_startedAt_idx" ON "NotificationAutomationRun"("startedAt");
CREATE INDEX "NotificationAutomationRun_status_startedAt_idx" ON "NotificationAutomationRun"("status", "startedAt");
CREATE UNIQUE INDEX "NotificationAutomationEvent_eventKey_key" ON "NotificationAutomationEvent"("eventKey");
CREATE INDEX "NotificationAutomationEvent_type_occurredAt_idx" ON "NotificationAutomationEvent"("type", "occurredAt");
CREATE INDEX "NotificationAutomationEvent_occurredAt_idx" ON "NotificationAutomationEvent"("occurredAt");
