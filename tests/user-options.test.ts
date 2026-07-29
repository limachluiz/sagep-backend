import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../src/config/prisma.js";
import { UsersService } from "../src/modules/users/users.service.js";

const currentUser = {
  id: "actor-1",
  email: "gestor@sagep.test",
  role: "GESTOR",
  permissions: ["projects.view_all"],
};

describe("UsersService.listOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  });

  it("lista somente usuários ativos para novos membros de projeto", async () => {
    const service = new UsersService();

    await service.listOptions({}, currentUser);

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true },
    }));
  });

  it("restringe responsáveis ao dono e aos membros do projeto", async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({
      ownerId: "owner-1",
      members: [{ userId: "member-1" }, { userId: "member-2" }],
    } as never);
    const service = new UsersService();

    await service.listOptions({ projectCode: 12 }, currentUser);

    expect(prisma.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ projectCode: 12, deletedAt: null }),
    }));
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        active: true,
        id: { in: ["owner-1", "member-1", "member-2"] },
      },
    }));
  });

  it("bloqueia a consulta de equipe de projeto inacessível", async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({
      ownerId: "owner-1",
      members: [{ userId: "member-1" }],
    } as never);
    const service = new UsersService();

    await expect(service.listOptions(
      { projectId: "project-1" },
      { ...currentUser, permissions: [] },
    )).rejects.toMatchObject({ statusCode: 403 });
  });
});
