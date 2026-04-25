-- AlterEnum
ALTER TYPE "AuditActionType" ADD VALUE 'LOGIN_FAILED';

-- CreateEnum
CREATE TYPE "RefreshTokenRevocationReason" AS ENUM ('LOGOUT', 'ROTATED', 'EXPIRED', 'ADMIN_REVOKED', 'SECURITY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RefreshToken"
ADD COLUMN "createdIpAddress" TEXT,
ADD COLUMN "createdUserAgent" TEXT,
ADD COLUMN "lastUsedAt" TIMESTAMP(3),
ADD COLUMN "revokedReason" "RefreshTokenRevocationReason",
ADD COLUMN "revokedByUserId" TEXT;
