ALTER TYPE "NotificationAutomationEventType" ADD VALUE IF NOT EXISTS 'NE_CANCELLED';

ALTER TABLE "NotificationChannelConfiguration"
ADD COLUMN "telegramUpdateOffset" BIGINT;
