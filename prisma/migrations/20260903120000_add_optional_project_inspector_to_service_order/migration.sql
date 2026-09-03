ALTER TABLE "ServiceOrder"
ADD COLUMN "hasProjectInspector" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "projectInspectorName" TEXT,
ADD COLUMN "projectInspectorRank" TEXT,
ADD COLUMN "projectInspectorCpf" TEXT,
ADD COLUMN "projectInspectorRole" TEXT DEFAULT 'Fiscal do Projeto';
