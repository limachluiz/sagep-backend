-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "omId" TEXT;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_omId_fkey" FOREIGN KEY ("omId") REFERENCES "MilitaryOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
