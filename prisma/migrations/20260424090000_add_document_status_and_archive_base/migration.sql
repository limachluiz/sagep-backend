-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('EMITIDO', 'ARQUIVADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "Project"
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DiexRequest"
ADD COLUMN     "documentStatus" "DocumentStatus" NOT NULL DEFAULT 'EMITIDO',
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ServiceOrder"
ADD COLUMN     "documentStatus" "DocumentStatus" NOT NULL DEFAULT 'EMITIDO',
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);
