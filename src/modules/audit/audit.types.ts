export type AuditEntityType =
  | "PROJECT"
  | "ESTIMATE"
  | "DIEX_REQUEST"
  | "SERVICE_ORDER"
  | "TASK"
  | "USER"
  | "AUTH";

export type AuditActionType =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "ARCHIVE"
  | "STATUS_CHANGE"
  | "STAGE_CHANGE"
  | "ISSUE"
  | "FINALIZE"
  | "CANCEL"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "TOKEN_REFRESH";

export type AuditPrimitive = string | number | boolean | null;
export type AuditValue =
  | AuditPrimitive
  | Date
  | AuditValue[]
  | { [key: string]: AuditValue };

export type AuditSnapshot = Record<string, AuditValue>;

export type AuditActor = {
  id?: string | null;
  name?: string | null;
};

export type CreateAuditLogInput = {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditActionType;
  actor?: AuditActor;
  summary: string;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
  metadata?: AuditSnapshot | null;
};

export type TimelineItem = {
  id: string;
  at: Date;
  action: AuditActionType;
  label: string;
  actorName: string | null;
  summary: string;
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
  metadata: AuditSnapshot | null;
};
