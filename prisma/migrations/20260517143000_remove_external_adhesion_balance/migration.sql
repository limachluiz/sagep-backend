ALTER TABLE "AtaItemExternalBalanceSnapshot"
ADD COLUMN "externalBalance" JSONB;

UPDATE "AtaItemExternalBalanceSnapshot"
SET "externalBalance" = jsonb_strip_nulls(
  jsonb_build_object(
    'source', "source",
    'externalItemNumber', COALESCE("managedBalance"->>'externalItemNumber', NULL),
    'registeredQuantity', "managedBalance"->>'registeredQuantity',
    'committedQuantity', "managedBalance"->>'committedQuantity',
    'availableQuantity', "managedBalance"->>'availableQuantity',
    'commitments', COALESCE("commitments", '[]'::jsonb),
    'lastUpdatedAt', to_jsonb("lastUpdatedAt"),
    'rawRecords', to_jsonb("rawRecords")
  )
)
WHERE "managedBalance" IS NOT NULL;

ALTER TABLE "AtaItemExternalBalanceSnapshot"
DROP COLUMN "externalUsageStatus",
DROP COLUMN "managedBalance",
DROP COLUMN "adhesionBalance",
DROP COLUMN "commitments",
DROP COLUMN "nonParticipantCommitments",
DROP COLUMN "rawRecords",
DROP COLUMN "lastUpdatedAt";
