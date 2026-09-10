ALTER TABLE "MilitaryOrganization" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "MilitaryOrganization_archivedAt_idx" ON "MilitaryOrganization"("archivedAt");
