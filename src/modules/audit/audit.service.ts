import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import * as $Enums from "../../generated/prisma/enums.js";
import {
  type AuditEntityType,
  type AuditSnapshot,
  type CreateAuditLogInput,
  type TimelineItem,
} from "./audit.types.js";
import type { ListAuditLogsQuery } from "./audit.schemas.js";

type JsonDbInput =
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput
  | undefined;

type NormalizedJsonValue = Prisma.InputJsonValue | null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeValue(value: unknown): NormalizedJsonValue {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item)) as unknown as Prisma.InputJsonArray;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, normalizeValue(item)]);

    return Object.fromEntries(entries) as unknown as Prisma.InputJsonObject;
  }

  if (value && typeof value === "object" && "toString" in value) {
    return String(value);
  }

  return null;
}

function normalizeSnapshot(snapshot?: AuditSnapshot | null): JsonDbInput {
  if (!snapshot) {
    return undefined;
  }

  const normalized = normalizeValue(snapshot);

  if (normalized === null) {
    return Prisma.JsonNull;
  }

  return normalized;
}

function parseSnapshot(value: Prisma.JsonValue | null | undefined): AuditSnapshot | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AuditSnapshot;
}

export class AuditService {
  private serializeLog(item: {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    actorUserId: string | null;
    actorName: string | null;
    summary: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }) {
    return {
      id: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      action: item.action,
      actorUserId: item.actorUserId,
      actorName: item.actorName,
      summary: item.summary,
      createdAt: item.createdAt,
      metadata: parseSnapshot(item.metadata),
    };
  }

  async log(input: CreateAuditLogInput) {
    return prisma.auditLog.create({
      data: {
        entityType: input.entityType as $Enums.AuditEntityType,
        entityId: input.entityId,
        action: input.action as $Enums.AuditActionType,
        actorUserId: input.actor?.id ?? undefined,
        actorName: input.actor?.name ?? undefined,
        summary: input.summary,
        beforeJson: normalizeSnapshot(input.before),
        afterJson: normalizeSnapshot(input.after),
        metadata: normalizeSnapshot(input.metadata),
      },
    });
  }

  async list(filters: ListAuditLogsQuery, path: string) {
    const andConditions: Prisma.AuditLogWhereInput[] = [];

    if (filters.entityType) {
      andConditions.push({
        entityType: filters.entityType as $Enums.AuditEntityType,
      });
    }

    if (filters.action) {
      andConditions.push({
        action: filters.action as $Enums.AuditActionType,
      });
    }

    if (filters.actor) {
      andConditions.push({
        OR: [
          {
            actorName: {
              contains: filters.actor,
              mode: "insensitive",
            },
          },
          {
            actorUserId: filters.actor,
          },
        ],
      });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          {
            summary: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            entityId: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            actorName: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        ],
      });
    }

    if (filters.startDate || filters.endDate) {
      andConditions.push({
        createdAt: {
          ...(filters.startDate && { gte: filters.startDate }),
          ...(filters.endDate && { lte: filters.endDate }),
        },
      });
    }

    const where: Prisma.AuditLogWhereInput | undefined =
      andConditions.length > 0 ? { AND: andConditions } : undefined;
    const totalItems = await prisma.auditLog.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalItems / filters.limit));
    const page = Math.min(filters.page, totalPages);

    const items = await prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        actorUserId: true,
        actorName: true,
        summary: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * filters.limit,
      take: filters.limit,
    });

    return {
      items: items.map((item) => this.serializeLog(item)),
      meta: {
        page,
        pageSize: filters.limit,
        limit: filters.limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: {
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.action && { action: filters.action }),
        ...(filters.actor && { actor: filters.actor }),
        ...(filters.search && { search: filters.search }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      },
      links: {
        self: path,
      },
    };
  }

  async listTimeline(
    entityType: CreateAuditLogInput["entityType"],
    entityId: string,
  ): Promise<TimelineItem[]> {
    return this.listTimelineForEntities([{ entityType, entityId }]);
  }

  async listTimelineForEntities(
    entities: Array<{
      entityType: AuditEntityType;
      entityId: string;
      context?: AuditSnapshot | null;
    }>,
  ): Promise<TimelineItem[]> {
    if (entities.length === 0) {
      return [];
    }

    const contextByEntity = new Map(
      entities.map((entity) => [
        `${entity.entityType}:${entity.entityId}`,
        entity.context ?? null,
      ]),
    );

    const items = await prisma.auditLog.findMany({
      where: {
        OR: entities.map((entity) => ({
          entityType: entity.entityType as $Enums.AuditEntityType,
          entityId: entity.entityId,
        })),
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return items.map((item) => ({
      id: item.id,
      at: item.createdAt,
      entityType: item.entityType as TimelineItem["entityType"],
      entityId: item.entityId,
      action: item.action as TimelineItem["action"],
      label: item.summary,
      actorName: item.actorName,
      summary: item.summary,
      before: parseSnapshot(item.beforeJson),
      after: parseSnapshot(item.afterJson),
      metadata: parseSnapshot(item.metadata),
      source: "AUDIT",
      context: contextByEntity.get(`${item.entityType}:${item.entityId}`) ?? null,
    }));
  }
}

export const auditService = new AuditService();
