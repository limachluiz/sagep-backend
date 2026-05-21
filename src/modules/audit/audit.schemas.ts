import { z } from "zod";

const auditEntityTypeEnum = z.enum([
  "PROJECT",
  "ESTIMATE",
  "DIEX_REQUEST",
  "SERVICE_ORDER",
  "TASK",
  "USER",
  "AUTH",
]);

const auditActionTypeEnum = z.enum([
  "CREATE",
  "UPDATE",
  "DELETE",
  "ARCHIVE",
  "RESTORE",
  "STATUS_CHANGE",
  "STAGE_CHANGE",
  "ISSUE",
  "FINALIZE",
  "CANCEL",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "TOKEN_REFRESH",
  "SESSION_REVOKE",
  "SESSION_REVOKE_ALL",
  "SESSION_EXPIRE",
  "SESSION_CLEANUP",
]);

const optionalDate = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.coerce.date().optional());

export const listAuditLogsQuerySchema = z
  .object({
    entityType: auditEntityTypeEnum.optional(),
    action: auditActionTypeEnum.optional(),
    actor: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(
    (data) =>
      !data.startDate ||
      !data.endDate ||
      data.endDate.getTime() >= data.startDate.getTime(),
    {
      message: "Data final deve ser maior ou igual a data inicial",
      path: ["endDate"],
    },
  );

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
