/*
  Warnings:

  - You are about to drop the column `deletedAt` on the `AtaItem` table. All the data in the column will be lost.
  - You are about to drop the column `initialQuantity` on the `AtaItem` table. All the data in the column will be lost.
  - You are about to drop the `AtaItemBalanceMovement` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AtaItemBalanceMovement" DROP CONSTRAINT "AtaItemBalanceMovement_ataItemId_fkey";

-- DropForeignKey
ALTER TABLE "AtaItemBalanceMovement" DROP CONSTRAINT "AtaItemBalanceMovement_diexRequestId_fkey";

-- DropForeignKey
ALTER TABLE "AtaItemBalanceMovement" DROP CONSTRAINT "AtaItemBalanceMovement_estimateId_fkey";

-- DropForeignKey
ALTER TABLE "AtaItemBalanceMovement" DROP CONSTRAINT "AtaItemBalanceMovement_estimateItemId_fkey";

-- DropForeignKey
ALTER TABLE "AtaItemBalanceMovement" DROP CONSTRAINT "AtaItemBalanceMovement_projectId_fkey";

-- DropForeignKey
ALTER TABLE "AtaItemBalanceMovement" DROP CONSTRAINT "AtaItemBalanceMovement_serviceOrderId_fkey";

-- AlterTable
ALTER TABLE "AtaItem" DROP COLUMN "deletedAt",
DROP COLUMN "initialQuantity";

-- DropTable
DROP TABLE "AtaItemBalanceMovement";

-- DropEnum
DROP TYPE "AtaItemBalanceMovementType";
