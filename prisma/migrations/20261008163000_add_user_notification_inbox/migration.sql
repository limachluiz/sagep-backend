CREATE TABLE "UserNotification" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "detailsPath" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "emailSentAt" TIMESTAMP(3),
  "telegramSentAt" TIMESTAMP(3),
  "emailError" TEXT,
  "telegramError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotification_recipientId_eventKey_key" ON "UserNotification"("recipientId", "eventKey");
CREATE INDEX "UserNotification_recipientId_resolvedAt_dismissedAt_readAt_occurredAt_idx" ON "UserNotification"("recipientId", "resolvedAt", "dismissedAt", "readAt", "occurredAt");
CREATE INDEX "UserNotification_entityType_entityId_idx" ON "UserNotification"("entityType", "entityId");
CREATE INDEX "UserNotification_category_occurredAt_idx" ON "UserNotification"("category", "occurredAt");
CREATE INDEX "UserNotification_emailSentAt_occurredAt_idx" ON "UserNotification"("emailSentAt", "occurredAt");
CREATE INDEX "UserNotification_telegramSentAt_occurredAt_idx" ON "UserNotification"("telegramSentAt", "occurredAt");

ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationAutomationEvent" ADD COLUMN "resolvedAt" TIMESTAMP(3);
CREATE INDEX "NotificationAutomationEvent_resolvedAt_occurredAt_idx" ON "NotificationAutomationEvent"("resolvedAt", "occurredAt");

ALTER TABLE "NotificationAutomationConfiguration"
  ADD COLUMN "taskDueDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "projectStaleDays" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "ataExpiryDays" INTEGER NOT NULL DEFAULT 90;
