CREATE TYPE "CommitmentImportStatus" AS ENUM ('AVAILABLE', 'IMPORTING', 'IMPORTED', 'FAILED');

CREATE TABLE "NotificationChannelConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUsername" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "smtpFromName" TEXT,
    "smtpFromEmail" TEXT,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "telegramBotTokenEncrypted" TEXT,
    "telegramChatId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationChannelConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationEmailList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationEmailList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationEmailRecipient" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationEmailRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommitmentImportRegistry" (
    "externalCode" TEXT NOT NULL,
    "status" "CommitmentImportStatus" NOT NULL DEFAULT 'AVAILABLE',
    "source" TEXT NOT NULL DEFAULT 'RADAR',
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "importedById" TEXT,
    "importedAt" TIMESTAMP(3),
    "importedOrigin" TEXT,
    "targetId" TEXT,
    "lastError" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommitmentImportRegistry_pkey" PRIMARY KEY ("externalCode")
);

CREATE UNIQUE INDEX "NotificationEmailList_name_key" ON "NotificationEmailList"("name");
CREATE UNIQUE INDEX "NotificationEmailRecipient_listId_email_key" ON "NotificationEmailRecipient"("listId", "email");
CREATE INDEX "NotificationEmailRecipient_email_active_idx" ON "NotificationEmailRecipient"("email", "active");
CREATE INDEX "CommitmentImportRegistry_status_lastSeenAt_idx" ON "CommitmentImportRegistry"("status", "lastSeenAt");

ALTER TABLE "NotificationEmailRecipient"
ADD CONSTRAINT "NotificationEmailRecipient_listId_fkey"
FOREIGN KEY ("listId") REFERENCES "NotificationEmailList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
