UPDATE "NotificationAutomationConfiguration"
SET "syncAtaBalances" = false,
    "lastScheduledKey" = NULL;

UPDATE "NotificationAutomationEvent"
SET "resolvedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'ATA_BALANCE_CHANGED'
  AND "resolvedAt" IS NULL;
