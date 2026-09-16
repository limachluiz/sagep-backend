CREATE TABLE "DiscoveredCommitment" (
  "id" TEXT NOT NULL,
  "externalCode" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "importedById" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveredCommitment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscoveredCommitment_externalCode_key" ON "DiscoveredCommitment"("externalCode");
