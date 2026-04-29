import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import * as $Enums from "../../generated/prisma/enums.js";
import {
  type AuditEntityType,
  type AuditSnapshot,
  type CreateAuditLogInput,
  type TimelineItem,
} from "./audit.types.js";

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
