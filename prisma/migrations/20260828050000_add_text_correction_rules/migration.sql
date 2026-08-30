CREATE TABLE "TextCorrectionRule" (
    "id" TEXT NOT NULL,
    "damagedText" TEXT NOT NULL,
    "correctedText" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TextCorrectionRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TextCorrectionRule_damagedText_key" ON "TextCorrectionRule"("damagedText");
