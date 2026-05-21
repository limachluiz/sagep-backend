-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "asBuiltApprovedAt" TIMESTAMP(3),
ADD COLUMN     "asBuiltRejectedAt" TIMESTAMP(3),
ADD COLUMN     "asBuiltRejectionReason" TEXT,
ADD COLUMN     "asBuiltReviewedAt" TIMESTAMP(3);
