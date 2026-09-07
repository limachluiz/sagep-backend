CREATE TABLE "SystemHealthSample" (
  "id" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "apiLatencyMs" DOUBLE PRECISION NOT NULL,
  "databaseLatencyMs" DOUBLE PRECISION,
  "pgadminLatencyMs" DOUBLE PRECISION,
  "heapUsedMb" DOUBLE PRECISION NOT NULL,
  "residentSetMb" DOUBLE PRECISION NOT NULL,
  "uptimeSeconds" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SystemHealthSample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemHealthSample_checkedAt_key" ON "SystemHealthSample"("checkedAt");
CREATE INDEX "SystemHealthSample_checkedAt_idx" ON "SystemHealthSample"("checkedAt");
