CREATE TYPE "UserThemePreference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

ALTER TABLE "User"
ADD COLUMN "phone" TEXT,
ADD COLUMN "avatarDataUrl" TEXT,
ADD COLUMN "themePreference" "UserThemePreference" NOT NULL DEFAULT 'DARK',
ADD COLUMN "notifyTaskAssignments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyDeadlines" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyWorkflowUpdates" BOOLEAN NOT NULL DEFAULT true;
