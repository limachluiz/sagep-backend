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
        id: true,
        userCode: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return user;
  }

  async list() {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        userCode: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        userCode: "asc",
      },
    });

    return users;
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
      select: {
        id: true,
        userCode: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }
}