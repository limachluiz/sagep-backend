ALTER TABLE "User" ADD COLUMN "userCode" INTEGER;
CREATE SEQUENCE "User_userCode_seq";
ALTER TABLE "User" ALTER COLUMN "userCode" SET DEFAULT nextval('"User_userCode_seq"');
UPDATE "User"
SET "userCode" = nextval('"User_userCode_seq"')
WHERE "userCode" IS NULL;
ALTER TABLE "User" ALTER COLUMN "userCode" SET NOT NULL;
ALTER SEQUENCE "User_userCode_seq" OWNED BY "User"."userCode";
CREATE UNIQUE INDEX "User_userCode_key" ON "User"("userCode");

ALTER TABLE "Project" ADD COLUMN "projectCode" INTEGER;
CREATE SEQUENCE "Project_projectCode_seq";
ALTER TABLE "Project" ALTER COLUMN "projectCode" SET DEFAULT nextval('"Project_projectCode_seq"');
UPDATE "Project"
SET "projectCode" = nextval('"Project_projectCode_seq"')
WHERE "projectCode" IS NULL;
ALTER TABLE "Project" ALTER COLUMN "projectCode" SET NOT NULL;
ALTER SEQUENCE "Project_projectCode_seq" OWNED BY "Project"."projectCode";
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");