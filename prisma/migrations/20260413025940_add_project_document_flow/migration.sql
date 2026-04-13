-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('ESTIMATIVA_PRECO', 'AGUARDANDO_NOTA_CREDITO', 'DIEX_REQUISITORIO', 'AGUARDANDO_NOTA_EMPENHO', 'OS_LIBERADA', 'SERVICO_EM_EXECUCAO', 'ANALISANDO_AS_BUILT', 'ATESTAR_NF', 'SERVICO_CONCLUIDO', 'CANCELADO');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "asBuiltReceivedAt" TIMESTAMP(3),
ADD COLUMN     "commitmentNoteNumber" TEXT,
ADD COLUMN     "commitmentNoteReceivedAt" TIMESTAMP(3),
ADD COLUMN     "creditNoteNumber" TEXT,
ADD COLUMN     "creditNoteReceivedAt" TIMESTAMP(3),
ADD COLUMN     "diexIssuedAt" TIMESTAMP(3),
ADD COLUMN     "diexNumber" TEXT,
ADD COLUMN     "executionStartedAt" TIMESTAMP(3),
ADD COLUMN     "invoiceAttestedAt" TIMESTAMP(3),
ADD COLUMN     "serviceCompletedAt" TIMESTAMP(3),
ADD COLUMN     "serviceOrderIssuedAt" TIMESTAMP(3),
ADD COLUMN     "serviceOrderNumber" TEXT,
ADD COLUMN     "stage" "ProjectStage" NOT NULL DEFAULT 'ESTIMATIVA_PRECO';
