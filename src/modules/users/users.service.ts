import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

type CreateUserByAdminInput = {
  name: string;
  email: string;
  password: string;
  role: "PROJETISTA" | "GESTOR" | "CONSULTA";
  rank?: string;
  cpf?: string;
};

type UpdateUserRoleInput = {
  role: "ADMIN" | "GESTOR" | "PROJETISTA" | "CONSULTA";
  rank?: string;
  cpf?: string;
};

type UpdateUserInput = {
  name?: string;
  email?: string;
  rank?: string;
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

const adminUserSelect = {
  id: true,
  userCode: true,
  name: true,
  email: true,
  role: true,
  rank: true,
  cpf: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class UsersService {
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
        ...(normalizedEmail !== undefined && { email: normalizedEmail }),
        ...(data.rank !== undefined && { rank: data.rank?.trim() }),
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
