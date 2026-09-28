ALTER TABLE "DiscoveredCommitment"
ADD COLUMN "attendedOmId" TEXT,
ADD COLUMN "observation" TEXT;

UPDATE "DiscoveredCommitment"
SET "observation" = "attendedUnit"
WHERE "attendedUnit" IS NOT NULL AND BTRIM("attendedUnit") <> '';

ALTER TABLE "DiscoveredCommitment" DROP COLUMN "attendedUnit";

CREATE INDEX "DiscoveredCommitment_attendedOmId_idx"
ON "DiscoveredCommitment"("attendedOmId");

ALTER TABLE "DiscoveredCommitment"
ADD CONSTRAINT "DiscoveredCommitment_attendedOmId_fkey"
FOREIGN KEY ("attendedOmId") REFERENCES "MilitaryOrganization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
