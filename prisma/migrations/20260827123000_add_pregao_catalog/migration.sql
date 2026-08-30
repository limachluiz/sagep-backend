CREATE TABLE "Pregao" (
    "id" TEXT NOT NULL,
    "pregaoCode" SERIAL NOT NULL,
    "uasg" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "modality" TEXT NOT NULL DEFAULT 'PREGÃO ELETRÔNICO',
    "object" TEXT,
    "type" "AtaType",
    "managingAgency" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "externalSource" TEXT,
    "externalLastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pregao_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Ata" ADD COLUMN "pregaoId" TEXT;

CREATE UNIQUE INDEX "Pregao_pregaoCode_key" ON "Pregao"("pregaoCode");
CREATE UNIQUE INDEX "Pregao_uasg_number_year_key" ON "Pregao"("uasg", "number", "year");
CREATE INDEX "Pregao_year_number_idx" ON "Pregao"("year", "number");
CREATE INDEX "Pregao_type_isActive_idx" ON "Pregao"("type", "isActive");
CREATE INDEX "Ata_pregaoId_isActive_idx" ON "Ata"("pregaoId", "isActive");

INSERT INTO "Pregao" (
    "id", "uasg", "number", "year", "type", "managingAgency",
    "externalSource", "externalLastSyncAt", "createdAt", "updatedAt"
)
SELECT
    'pregao_' || md5(
        COALESCE("externalUasg", '') || ':' ||
        COALESCE("externalPregaoNumber", '') || ':' ||
        COALESCE("externalPregaoYear", '')
    ),
    "externalUasg",
    "externalPregaoNumber",
    "externalPregaoYear",
    MIN("type"::text)::"AtaType",
    MAX("managingAgency"),
    MAX("externalSource"),
    MAX("externalLastSyncAt"),
    MIN("createdAt"),
    CURRENT_TIMESTAMP
FROM "Ata"
WHERE "externalUasg" IS NOT NULL
  AND "externalPregaoNumber" IS NOT NULL
  AND "externalPregaoYear" IS NOT NULL
GROUP BY "externalUasg", "externalPregaoNumber", "externalPregaoYear";

UPDATE "Ata" AS ata
SET "pregaoId" = pregao."id"
FROM "Pregao" AS pregao
WHERE ata."externalUasg" = pregao."uasg"
  AND ata."externalPregaoNumber" = pregao."number"
  AND ata."externalPregaoYear" = pregao."year";

ALTER TABLE "Ata"
ADD CONSTRAINT "Ata_pregaoId_fkey"
FOREIGN KEY ("pregaoId") REFERENCES "Pregao"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
