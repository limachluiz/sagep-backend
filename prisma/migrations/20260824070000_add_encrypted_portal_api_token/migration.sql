ALTER TABLE "SystemConfiguration"
ADD COLUMN "portalApiTokenEncrypted" TEXT,
ADD COLUMN "portalApiTokenUpdatedAt" TIMESTAMP(3),
ADD COLUMN "portalApiTokenUpdatedById" TEXT;

ALTER TABLE "SystemConfiguration"
ADD CONSTRAINT "SystemConfiguration_portalApiTokenUpdatedById_fkey"
FOREIGN KEY ("portalApiTokenUpdatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SystemConfiguration_portalApiTokenUpdatedById_idx"
ON "SystemConfiguration"("portalApiTokenUpdatedById");
