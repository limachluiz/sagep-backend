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
    mentionedUserIds?: string[];
    projectId?: string | null;
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
      if (!codes.length && !input.mentionedUserIds?.length) return { created: 0, mentioned: [] as number[] };
      const allowedIds = input.projectId ? await this.allowedMentionRecipientIds(input.projectId) : null;
      const users = await prisma.user.findMany({
        where: { OR: [{ userCode: { in: [...new Set(codes)] } }, { id: { in: input.mentionedUserIds ?? [] } }], active: true, ...(allowedIds ? { id: { in: allowedIds } } : {}) },
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
        const eventKey = `${input.eventKeyPrefix}:MENTION:${user.id}`;
        const notification = await prisma.userNotification.findUnique({ where: { recipientId_eventKey: { recipientId: user.id, eventKey } }, select: { id: true } });
        await prisma.entityMention.upsert({
          where: { eventKey },
          create: { eventKey, notificationId: notification?.id ?? null, recipientId: user.id, actorId: input.actorId ?? null, projectId: input.projectId ?? null, entityType: input.entityType, entityId: input.entityId, sourceText: input.content },
          update: { sourceText: input.content, notificationId: notification?.id ?? undefined },
        });
      }
      return { created, mentioned: users.map((user) => user.userCode) };
    } catch (error) {
      console.error("Falha ao processar menções", { entityType: input.entityType, entityId: input.entityId, error });
      return { created: 0, mentioned: [] as number[] };
    }
  }

  private async allowedMentionRecipientIds(projectId: string) {
    const [project, privileged] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, members: { select: { userId: true } } } }),
      prisma.user.findMany({ where: { active: true, role: { in: ["ADMIN", "GESTOR"] } }, select: { id: true } }),
    ]);
    if (!project) return [];
    return [...new Set([project.ownerId, ...project.members.map((item) => item.userId), ...privileged.map((item) => item.id)])];
  }

  async mentionCandidates(projectId: string, search: string, requesterId: string) {
    const ids = await this.allowedMentionRecipientIds(projectId);
    if (!ids.length) return [];
    if (!ids.includes(requesterId)) throw new AppError("Você não participa deste projeto", 403);
    return prisma.user.findMany({ where: { id: { in: ids }, active: true, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { warName: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, ...(/^\d+$/.test(search) ? [{ userCode: Number(search) }] : [])] } : {}) }, select: { id: true, userCode: true, name: true, warName: true, email: true, role: true }, orderBy: [{ warName: "asc" }, { name: "asc" }], take: 20 });
  }

  async escalatePendingMentions(hours: number, roles: Array<"ADMIN" | "GESTOR" | "PROJETISTA" | "CONSULTA">) {
    const limit = new Date(Date.now() - hours * 60 * 60_000);
    const [mentions, recipients] = await Promise.all([
      prisma.entityMention.findMany({ where: { readAt: null, resolvedAt: null, escalatedAt: null, createdAt: { lte: limit } }, take: 200 }),
      prisma.user.findMany({ where: { active: true, role: { in: roles } }, select: { id: true } }),
    ]);
    let created = 0;
    for (const mention of mentions) {
      const result = await this.publish({ eventKey: `MENTION_ESCALATION:${mention.id}`, recipientIds: recipients.map((item) => item.id), actorId: mention.actorId, category: "MENTION_ESCALATION", severity: "WARNING", title: "Menção sem leitura requer atenção", description: mention.sourceText.slice(0, 180), detailsPath: mention.entityType === "TASK" ? `/tasks/${mention.entityId}` : `/projects/${mention.entityId}`, entityType: mention.entityType, entityId: mention.entityId, metadata: { mentionId: mention.id, originalRecipientId: mention.recipientId } });
      created += result.created;
      await prisma.entityMention.update({ where: { id: mention.id }, data: { escalatedAt: new Date() } });
    }
    return { pending: mentions.length, created };
  }

  async resolveByEventKey(eventKey: string) {
    const now = new Date();
    const notifications = await prisma.userNotification.findMany({ where: { eventKey, resolvedAt: null }, select: { id: true } });
    const result = await prisma.userNotification.updateMany({
      where: { eventKey, resolvedAt: null },
      data: { resolvedAt: now },
    }).catch((error) => { console.error("Falha ao resolver notificação", { eventKey, error }); return { count: 0 }; });
    if (notifications.length) await prisma.entityMention.updateMany({ where: { notificationId: { in: notifications.map((item) => item.id) } }, data: { resolvedAt: now } });
    return result;
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
    const now = new Date();
    const notification = await prisma.userNotification.update({ where: { id }, data: { readAt: now } });
    const mention = await prisma.entityMention.findUnique({ where: { notificationId: id }, select: { id: true } });
    if (mention) {
      await prisma.entityMention.update({ where: { id: mention.id }, data: { readAt: now, resolvedAt: now } });
      await prisma.userNotification.updateMany({ where: { eventKey: `MENTION_ESCALATION:${mention.id}`, resolvedAt: null }, data: { resolvedAt: now } });
    }
    return notification;
  }

  async markAllRead(userId: string) {
    const now = new Date();
    const mentions = await prisma.entityMention.findMany({ where: { recipientId: userId, readAt: null, resolvedAt: null }, select: { id: true } });
    const result = await prisma.userNotification.updateMany({
      where: { recipientId: userId, readAt: null, dismissedAt: null, resolvedAt: null },
      data: { readAt: now },
    });
    await prisma.entityMention.updateMany({ where: { id: { in: mentions.map((item) => item.id) } }, data: { readAt: now, resolvedAt: now } });
    if (mentions.length) await prisma.userNotification.updateMany({ where: { eventKey: { in: mentions.map((item) => `MENTION_ESCALATION:${item.id}`) }, resolvedAt: null }, data: { resolvedAt: now } });
    return { updated: result.count };
  }

  async dismiss(id: string, userId: string) {
    await this.owned(id, userId);
    const now = new Date();
    const notification = await prisma.userNotification.update({ where: { id }, data: { dismissedAt: now, readAt: now, resolvedAt: now } });
    const mention = await prisma.entityMention.findUnique({ where: { notificationId: id }, select: { id: true } });
    if (mention) {
      await prisma.entityMention.update({ where: { id: mention.id }, data: { readAt: now, resolvedAt: now } });
      await prisma.userNotification.updateMany({ where: { eventKey: `MENTION_ESCALATION:${mention.id}`, resolvedAt: null }, data: { resolvedAt: now } });
    }
    return notification;
  }
}

export const notificationsService = new NotificationsService();

