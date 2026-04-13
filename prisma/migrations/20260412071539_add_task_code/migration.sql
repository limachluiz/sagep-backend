ALTER TABLE "Task" ADD COLUMN "taskCode" INTEGER;
CREATE SEQUENCE "Task_taskCode_seq";
ALTER TABLE "Task" ALTER COLUMN "taskCode" SET DEFAULT nextval('"Task_taskCode_seq"');
UPDATE "Task"
SET "taskCode" = nextval('"Task_taskCode_seq"')
WHERE "taskCode" IS NULL;
ALTER TABLE "Task" ALTER COLUMN "taskCode" SET NOT NULL;
ALTER SEQUENCE "Task_taskCode_seq" OWNED BY "Task"."taskCode";
CREATE UNIQUE INDEX "Task_taskCode_key" ON "Task"("taskCode");