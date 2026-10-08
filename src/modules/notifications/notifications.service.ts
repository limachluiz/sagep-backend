import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

export type NotificationPreference = "taskAssignments" | "deadlines" | "workflowUpdates";

export type PublishNotificationInput = {
  eventKey: string;
  recipientIds: string[];
  actorId?: string | null;
  category: string;
  severity?: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  description: string;
  detailsPath: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  preference?: NotificationPreference;
  includeActor?: boolean;
};

function preferenceWhere(preference?: NotificationPreference): Prisma.UserWhereInput {
  if (preference === "taskAssignments") return { notifyTaskAssignments: true };
  if (preference === "deadlines") return { notifyDeadlines: true };
  if (preference === "workflowUpdates") return { notifyWorkflowUpdates: true };
  return {};
}

export class NotificationsService {
  async publish(input: PublishNotificationInput) {
    try {
      const ids = [...new Set(input.recipientIds.filter(Boolean))]
        .filter((id) => input.includeActor || id !== input.actorId);
      if (!ids.length) return { created: 0 };

      const recipients = await prisma.user.findMany({
        where: { id: { in: ids }, active: true, ...preferenceWhere(input.preference) },
        select: { id: true },
      });
      if (!recipients.length) return { created: 0 };

      const result = await prisma.userNotification.createMany({
        data: recipients.map(({ id }) => ({
          eventKey: input.eventKey,
          recipientId: id,
          actorId: input.actorId ?? null,
          category: input.category,
          severity: input.severity ?? "INFO",
          title: input.title,
          description: input.description,
          detailsPath: input.detailsPath,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          metadata: input.metadata,
        })),
        skipDuplicates: true,
      });
      return { created: result.count };
    } catch (error) {
      console.error("Falha ao registrar notificação sem interromper a operação principal", { eventKey: input.eventKey, error });
      return { created: 0 };
    }
  }

  async publishToProject(input: Omit<PublishNotificationInput, "recipientIds"> & { projectId: string }) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: { ownerId: true, members: { select: { userId: true } } },
      });
      if (!project) return { created: 0 };
      return this.publish({
        ...input,
        recipientIds: [project.ownerId, ...project.members.map((member) => member.userId)],
      });
    } catch (error) {
      console.error("Falha ao localizar destinatários do projeto", { projectId: input.projectId, error });
      return { created: 0 };
    }
  }

  async publishMentions(input: {
    content: string;
    eventKeyPrefix: string;
    actorId?: string | null;
    title: string;
    description: string;
    detailsPath: string;
    entityType: string;
    entityId: string;
  }) {
    try {
      const codes = [...input.content.matchAll(/@(?:USR-)?(\d+)/gi)]
        .map((match) => Number(match[1]))
        .filter(Number.isSafeInteger);
      if (!codes.length) return { created: 0, mentioned: [] as number[] };
      const users = await prisma.user.findMany({
        where: { userCode: { in: [...new Set(codes)] }, active: true },
        select: { id: true, userCode: true },
      });
      let created = 0;
      for (const user of users) {
        const result = await this.publish({
          eventKey: `${input.eventKeyPrefix}:MENTION:${user.id}`,
          recipientIds: [user.id],
          actorId: input.actorId,
          category: "MENTION",
          severity: "INFO",
          title: input.title,
          description: input.description,
          detailsPath: input.detailsPath,
          entityType: input.entityType,
          entityId: input.entityId,
        });
        created += result.created;
      }
      return { created, mentioned: users.map((user) => user.userCode) };
    } catch (error) {
      console.error("Falha ao processar menções", { entityType: input.entityType, entityId: input.entityId, error });
      return { created: 0, mentioned: [] as number[] };
    }
  }

  async resolveByEventKey(eventKey: string) {
    return prisma.userNotification.updateMany({
      where: { eventKey, resolvedAt: null },
      data: { resolvedAt: new Date() },
    }).catch((error) => { console.error("Falha ao resolver notificação", { eventKey, error }); return { count: 0 }; });
  }

  async resolveByPrefix(eventKeyPrefix: string) {
    return prisma.userNotification.updateMany({
      where: { eventKey: { startsWith: eventKeyPrefix }, resolvedAt: null },
      data: { resolvedAt: new Date() },
    }).catch((error) => { console.error("Falha ao resolver notificações", { eventKeyPrefix, error }); return { count: 0 }; });
  }

  async list(userId: string, filters: { status: string; category?: string; page: number; pageSize: number }) {
    const stateWhere: Prisma.UserNotificationWhereInput =
      filters.status === "UNREAD" ? { readAt: null, dismissedAt: null, resolvedAt: null }
      : filters.status === "READ" ? { readAt: { not: null }, dismissedAt: null, resolvedAt: null }
      : filters.status === "DISMISSED" ? { dismissedAt: { not: null } }
      : filters.status === "RESOLVED" ? { resolvedAt: { not: null } }
      : { dismissedAt: null, resolvedAt: null };
    const where: Prisma.UserNotificationWhereInput = {
      recipientId: userId,
      ...stateWhere,
      ...(filters.category ? { category: filters.category } : {}),
    };
    const [items, total, unread, categories] = await Promise.all([
      prisma.userNotification.findMany({
        where,
        include: { actor: { select: { id: true, name: true, warName: true, userCode: true } } },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.userNotification.count({ where }),
      prisma.userNotification.count({ where: { recipientId: userId, readAt: null, dismissedAt: null, resolvedAt: null } }),
      prisma.userNotification.groupBy({
        by: ["category"],
        where: { recipientId: userId, dismissedAt: null, resolvedAt: null },
        _count: { _all: true },
      }),
    ]);
    return {
      items,
      pagination: { page: filters.page, pageSize: filters.pageSize, total, pages: Math.ceil(total / filters.pageSize) },
      summary: { unread, active: categories.reduce((sum, item) => sum + item._count._all, 0), byCategory: Object.fromEntries(categories.map((item) => [item.category, item._count._all])) },
    };
  }

  private async owned(id: string, userId: string) {
    const notification = await prisma.userNotification.findFirst({ where: { id, recipientId: userId } });
    if (!notification) throw new AppError("Notificação não encontrada", 404);
    return notification;
  }

  async markRead(id: string, userId: string) {
    await this.owned(id, userId);
    return prisma.userNotification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    const result = await prisma.userNotification.updateMany({
      where: { recipientId: userId, readAt: null, dismissedAt: null, resolvedAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async dismiss(id: string, userId: string) {
    await this.owned(id, userId);
    return prisma.userNotification.update({ where: { id }, data: { dismissedAt: new Date(), readAt: new Date() } });
  }
}

export const notificationsService = new NotificationsService();

