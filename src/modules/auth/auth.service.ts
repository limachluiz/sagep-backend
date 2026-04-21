import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpirationDate,
  hashToken,
  verifyRefreshToken,
} from "../../shared/auth-tokens.js";

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

    const accessToken = generateAccessToken(
      {
        email: user.email,
        role: user.role,
      },
      user.id
    );

    const refreshToken = generateRefreshToken(
      {
        email: user.email,
        role: user.role,
      },
      user.id
    );

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: getRefreshTokenExpirationDate(),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        userCode: user.userCode,
        name: user.name,
        email: user.email,
        role: user.role,
        rank: user.rank,
        cpf: user.cpf,
        active: user.active,
        createdAt: user.createdAt,
      },
    };
  }

  async refresh(refreshToken: string) {
    verifyRefreshToken(refreshToken);

    const tokenHash = hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!storedToken) {
      throw new AppError("Refresh token inválido", 401);
    }

    if (storedToken.revokedAt) {
      throw new AppError("Refresh token revogado", 401);
    }

    if (storedToken.expiresAt < new Date()) {
      throw new AppError("Refresh token expirado", 401);
    }

    if (!storedToken.user.active) {
      throw new AppError("Usuário inativo", 401);
    }

    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        revokedAt: new Date(),
      },
    });

    const newAccessToken = generateAccessToken(
      {
        email: storedToken.user.email,
        role: storedToken.user.role,
      },
      storedToken.user.id
    );

    const newRefreshToken = generateRefreshToken(
      {
        email: storedToken.user.email,
        role: storedToken.user.role,
      },
      storedToken.user.id
    );

    await prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        tokenHash: hashToken(newRefreshToken),
        expiresAt: getRefreshTokenExpirationDate(),
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken) {
      return { message: "Logout realizado com sucesso" };
    }

    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        revokedAt: new Date(),
      },
    });

    return { message: "Logout realizado com sucesso" };
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