ALTER TABLE "AtaItem"
  ADD COLUMN "automaticDescription" TEXT,
  ADD COLUMN "descriptionCorrectionStatus" TEXT NOT NULL DEFAULT 'OK',
  ADD COLUMN "descriptionCorrectionConfidence" INTEGER,
  ADD COLUMN "descriptionCorrectionSuggestions" JSONB;

UPDATE "AtaItem"
SET
  "externalDescription" = COALESCE("externalDescription", "description"),
  "automaticDescription" = "description",
  "descriptionCorrectionStatus" = CASE
    WHEN "descriptionEditedAt" IS NOT NULL THEN 'MANUALLY_REVIEWED'
    WHEN "description" LIKE '%�%' THEN 'NEEDS_REVIEW'
    ELSE 'OK'
  END,
  "descriptionCorrectionConfidence" = CASE
    WHEN "description" LIKE '%�%' THEN 50
    ELSE 100
  END;
