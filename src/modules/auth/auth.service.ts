import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

export class AuthService {
  async register(data: RegisterInput) {
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
        role: "CONSULTA",
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

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new AppError("E-mail ou senha inválidos", 401);
    }

    const passwordMatches = await bcrypt.compare(data.password, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError("E-mail ou senha inválidos", 401);
    }

    if (!user.active) {
      throw new AppError("Usuário inativo", 403);
    }

    const token = jwt.sign(
      {
        email: user.email,
        role: user.role,
      },
      env.JWT_SECRET,
      {
        subject: user.id,
        expiresIn: "1d",
      }
    );

    return {
      token,
      user: {
        id: user.id,
        userCode: user.userCode,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userCode: true,
        name: true,
        email: true,
        role: true,
        rank: true,
        cpf: true,
        active: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    return user;
  }
}