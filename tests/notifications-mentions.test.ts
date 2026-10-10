import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  notificationFindMany: vi.fn(),
  mentionFindMany: vi.fn(),
  mentionCount: vi.fn(),
  mentionUpdate: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    userNotification: { findMany: mocks.notificationFindMany },
    entityMention: {
      findMany: mocks.mentionFindMany,
      count: mocks.mentionCount,
      update: mocks.mentionUpdate,
    },
  },
}));

vi.mock("../src/modules/audit/audit.service.js", () => ({
  auditService: { log: mocks.auditLog },
}));

import { NotificationsService } from "../src/modules/notifications/notifications.service.js";

describe("acompanhamento e escalonamento de menções", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auditLog.mockResolvedValue(undefined);
  });

  it("impede um usuário comum de acompanhar menções de toda a equipe", async () => {
    const service = new NotificationsService();
    await expect(
      service.trackMentions(
        { scope: "ALL", status: "ALL", page: 1, pageSize: 20 },
        { id: "user-1", role: "PROJETISTA" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.mentionFindMany).not.toHaveBeenCalled();
  });

  it("restringe a visão pessoal ao destinatário autenticado e devolve o estado da notificação", async () => {
    const mention = {
      id: "mention-1",
      recipientId: "user-1",
      actorId: "actor-1",
      notificationId: "notification-1",
      projectId: "project-1",
      entityType: "TASK",
      entityId: "task-1",
      eventKey: "event-1",
      sourceText: "@USR-1 revise",
      createdAt: new Date(),
      readAt: null,
      resolvedAt: null,
      escalatedAt: null,
    };
    mocks.mentionFindMany.mockResolvedValue([mention]);
    mocks.mentionCount.mockResolvedValue(1);
    mocks.userFindMany.mockResolvedValue([
      {
        id: "user-1",
        userCode: 1,
        name: "Destino",
        warName: null,
        role: "PROJETISTA",
      },
      {
        id: "actor-1",
        userCode: 2,
        name: "Autor",
        warName: null,
        role: "GESTOR",
      },
    ]);
    mocks.notificationFindMany.mockResolvedValue([
      {
        id: "notification-1",
        title: "Menção",
        description: "Revisar",
        detailsPath: "/tasks/task-1",
        readAt: null,
        resolvedAt: null,
        dismissedAt: null,
      },
    ]);
    const service = new NotificationsService();
    const result = await service.trackMentions(
      { scope: "MINE", status: "PENDING", page: 1, pageSize: 20 },
      { id: "user-1", role: "PROJETISTA" },
    );
    expect(mocks.mentionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: "user-1", resolvedAt: null },
      }),
    );
    expect(result.items[0]).toMatchObject({
      recipient: { id: "user-1" },
      actor: { id: "actor-1" },
      notification: { id: "notification-1" },
    });
  });

  it("oferece usuários ativos no autocomplete antes de o projeto existir", async () => {
    mocks.userFindMany
      .mockResolvedValueOnce([{ id: "requester" }, { id: "user-2" }])
      .mockResolvedValueOnce([
        {
          id: "user-2",
          userCode: 2,
          name: "Maria",
          warName: "Lima",
          email: "maria@example.test",
          role: "PROJETISTA",
        },
      ]);
    const service = new NotificationsService();
    const result = await service.mentionCandidates(
      undefined,
      "Lima",
      "requester",
    );
    expect(result).toHaveLength(1);
    expect(mocks.userFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["requester", "user-2"] },
          active: true,
        }),
      }),
    );
  });

  it("escalona somente menções vencidas e registra a ação em auditoria", async () => {
    const mention = {
      id: "mention-1",
      recipientId: "user-1",
      actorId: "actor-1",
      entityType: "TASK",
      entityId: "task-1",
      sourceText: "@USR-1 revise",
      createdAt: new Date("2026-10-01T00:00:00Z"),
    };
    mocks.mentionFindMany.mockResolvedValue([mention]);
    mocks.userFindMany.mockResolvedValue([{ id: "manager-1" }]);
    mocks.mentionUpdate.mockResolvedValue({
      ...mention,
      escalatedAt: new Date(),
    });
    const service = new NotificationsService();
    const publish = vi
      .spyOn(service, "publish")
      .mockResolvedValue({ created: 1 });
    const result = await service.escalatePendingMentions(24, ["GESTOR"]);
    expect(mocks.mentionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          readAt: null,
          resolvedAt: null,
          escalatedAt: null,
          createdAt: { lte: expect.any(Date) },
        }),
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "MENTION_ESCALATION",
        preference: "mentions",
        recipientIds: ["manager-1"],
      }),
    );
    expect(mocks.mentionUpdate).toHaveBeenCalledWith({
      where: { id: "mention-1" },
      data: { escalatedAt: expect.any(Date) },
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "mention-1", action: "UPDATE" }),
    );
    expect(result).toEqual({ pending: 1, created: 1 });
  });
});
