-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('CFTV', 'FIBRA_OPTICA_PONTO_LOGICO');

-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "projectType" "ProjectType",
ADD COLUMN "omId" TEXT;

-- CreateIndex
CREATE INDEX "Project_projectType_idx" ON "Project"("projectType");

-- CreateIndex
CREATE INDEX "Project_omId_idx" ON "Project"("omId");

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_omId_fkey"
FOREIGN KEY ("omId") REFERENCES "MilitaryOrganization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
