CREATE TYPE "CommitmentNoteBalanceImpactMode" AS ENUM ('CONSUME', 'ALREADY_INCLUDED');

ALTER TABLE "SystemConfiguration"
ADD COLUMN "implantationModeActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "implantationCutoffAt" TIMESTAMP(3),
ADD COLUMN "implantationReason" TEXT,
ADD COLUMN "implantationChangedAt" TIMESTAMP(3),
ADD COLUMN "implantationChangedById" TEXT;

ALTER TABLE "AtaItem"
ALTER COLUMN "initialQuantity" TYPE DECIMAL(18,5),
ADD COLUMN "openingConsumedQuantity" DECIMAL(18,5) NOT NULL DEFAULT 0,
ADD COLUMN "openingBalanceAppliedAt" TIMESTAMP(3),
ADD COLUMN "openingBalanceCheckedAt" TIMESTAMP(3),
ADD COLUMN "openingBalanceReason" TEXT,
ADD COLUMN "openingBalanceAppliedById" TEXT;

ALTER TABLE "AtaItemBalanceMovement" ALTER COLUMN "quantity" TYPE DECIMAL(18,5);
ALTER TABLE "EstimateItem" ALTER COLUMN "quantity" TYPE DECIMAL(18,5);
ALTER TABLE "DiexRequestItem" ALTER COLUMN "quantityRequested" TYPE DECIMAL(18,5);
ALTER TABLE "ServiceOrderItem" ALTER COLUMN "quantityOrdered" TYPE DECIMAL(18,5);

ALTER TABLE "CommitmentNote"
ADD COLUMN "balanceImpactMode" "CommitmentNoteBalanceImpactMode" NOT NULL DEFAULT 'CONSUME',
ADD COLUMN "balanceImpactReason" TEXT,
ADD COLUMN "balanceImpactDecidedAt" TIMESTAMP(3),
ADD COLUMN "balanceImpactDecidedById" TEXT;

CREATE UNIQUE INDEX "CommitmentNote_managementUnit_management_number_key"
ON "CommitmentNote"("managementUnit", "management", "number");
