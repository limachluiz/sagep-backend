import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import type { MilitaryRank } from "../../shared/military-ranks.js";
import { permissionsService } from "../permissions/permissions.service.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
  permissions?: string[];
};

type CreateUserByAdminInput = {
  name: string;
  warName?: string;
  email: string;
  password: string;
  role: "PROJETISTA" | "GESTOR" | "CONSULTA";
  rank?: MilitaryRank;
  cpf?: string;
};

type UpdateUserRoleInput = {
  role: "ADMIN" | "GESTOR" | "PROJETISTA" | "CONSULTA";
  rank?: MilitaryRank;
  cpf?: string;
};

type UpdateUserInput = {
  name?: string;
  warName?: string | null;
  email?: string;
  rank?: MilitaryRank | null;
  cpf?: string;
};

type UpdateUserStatusInput = {
  active?: boolean;
};

type ListUsersFilters = {
  role?: "ADMIN" | "GESTOR" | "PROJETISTA" | "CONSULTA";
  active?: boolean;
  search?: string;
};

type ListUserOptionsFilters = {
  projectId?: string;
  projectCode?: number;
};

const adminUserSelect = {
  id: true,
  userCode: true,
  name: true,
  avatarDataUrl: true,
  warName: true,
  email: true,
  role: true,
  rank: true,
  cpf: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class UsersService {
  async listOptions(filters: ListUserOptionsFilters, currentUser: CurrentUser) {
    let eligibleUserIds: string[] | undefined;

    if (filters.projectId || filters.projectCode) {
      const project = await prisma.project.findFirst({
        where: {
          ...(filters.projectId && { id: filters.projectId }),
          ...(filters.projectCode && { projectCode: filters.projectCode }),
          deletedAt: null,
        },
        select: {
          ownerId: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!project) {
        throw new AppError("Projeto não encontrado", 404);
      }

      const canViewAll = permissionsService.hasPermission(currentUser, "projects.view_all");
      const belongsToProject =
        project.ownerId === currentUser.id ||
        project.members.some((member) => member.userId === currentUser.id);

      if (!canViewAll && !belongsToProject) {
        throw new AppError("Você não tem acesso a este projeto", 403);
      }

      eligibleUserIds = [
        project.ownerId,
        ...project.members.map((member) => member.userId),
      ];
    }

    return prisma.user.findMany({
      where: {
        active: true,
        ...(eligibleUserIds && { id: { in: eligibleUserIds } }),
      },
      select: {
        id: true,
        userCode: true,
        name: true,
        avatarDataUrl: true,
        warName: true,
        email: true,
        role: true,
        rank: true,
        active: true,
      },
      orderBy: [
        { name: "asc" },
        { userCode: "asc" },
      ],
    });
  }

  async create(data: CreateUserByAdminInput) {
    const userExists = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (userExists) {
      throw new AppError("Já existe um usuário com este e-mail", 409);
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        warName: data.warName?.trim(),
        email: data.email,
        passwordHash,
        role: data.role,
        rank: data.rank?.trim(),
        cpf: data.cpf?.trim(),
      },
      select: {
        ...adminUserSelect,
      },
    });

    return user;
  }

  async list(filters: ListUsersFilters = {}) {
    const users = await prisma.user.findMany({
      where: {
        ...(filters.role && { role: filters.role }),
        ...(filters.active !== undefined && { active: filters.active }),
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { warName: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
            { rank: { contains: filters.search, mode: "insensitive" } },
            { cpf: { contains: filters.search, mode: "insensitive" } },
          ],
        }),
      },
      select: adminUserSelect,
      orderBy: {
        userCode: "asc",
      },
    });

    return users;
  }

  async findById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: adminUserSelect,
    });

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    return user;
  }

  async update(userId: string, data: UpdateUserInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    const normalizedEmail = data.email?.trim().toLowerCase();

    if (normalizedEmail && normalizedEmail !== user.email.toLowerCase()) {
      const emailInUse = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (emailInUse) {
        throw new AppError("Já existe um usuário com este e-mail", 409);
      }
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.warName !== undefined && { warName: data.warName?.trim() || null }),
        ...(normalizedEmail !== undefined && { email: normalizedEmail }),
        ...(data.rank !== undefined && { rank: data.rank }),
        ...(data.cpf !== undefined && { cpf: data.cpf?.trim() }),
      },
      select: adminUserSelect,
    });
  }

  async updateStatus(
    userId: string,
    data: UpdateUserStatusInput,
    currentUser: CurrentUser
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        active: true,
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    if (currentUser.id === userId && data.active === false && user.role === "ADMIN") {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          id: { not: userId },
          role: "ADMIN",
          active: true,
        },
      });

      if (otherActiveAdmins === 0) {
        throw new AppError("Você não pode desativar o último ADMIN ativo", 409);
      }
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        active: data.active,
        ...(data.active === true && {
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      },
      select: adminUserSelect,
    });
  }

  async updateRole(userId: string, data: UpdateUserRoleInput, currentUser: CurrentUser) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    if (currentUser.id === userId && data.role !== "ADMIN") {
      throw new AppError(
        "Você não pode remover seu próprio perfil ADMIN por esta rota",
        409
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        role: data.role,
      },
      select: adminUserSelect,
    });

    return updatedUser;
  }
}
