import { prisma } from "../config/prisma.js";
import type { AuditEntityType } from "../generated/prisma/enums.js";

type ArchivableItem = {
  id: string;
  archivedAt: Date | null;
};

export type ArchiveContext = {
  archivedAt: Date;
  auditLogId: string | null;
  summary: string | null;
  actorUserId: string | null;
  actorName: string | null;
  metadata: unknown;
};

export async function withArchiveContext<T extends ArchivableItem>(
  entityType: AuditEntityType,
  items: T[],
): Promise<Array<T & { archiveContext?: ArchiveContext | null }>> {
  const archivedItems = items.filter((item) => item.archivedAt);

  if (archivedItems.length === 0) {
    return items;
  }

  const archiveLogs = await prisma.auditLog.findMany({
    where: {
      entityType,
      entityId: {
        in: archivedItems.map((item) => item.id),
      },
      action: "ARCHIVE",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const latestLogByEntity = new Map<string, (typeof archiveLogs)[number]>();

  for (const log of archiveLogs) {
    if (!latestLogByEntity.has(log.entityId)) {
      latestLogByEntity.set(log.entityId, log);
    }
  }

  return items.map((item) => {
    if (!item.archivedAt) {
      return item;
    }

    const log = latestLogByEntity.get(item.id);

    return {
      ...item,
      archiveContext: {
        archivedAt: item.archivedAt,
        auditLogId: log?.id ?? null,
        summary: log?.summary ?? null,
        actorUserId: log?.actorUserId ?? null,
        actorName: log?.actorName ?? null,
        metadata: log?.metadata ?? null,
      },
    };
  });
}
