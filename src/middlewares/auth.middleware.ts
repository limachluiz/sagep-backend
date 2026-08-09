import { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { permissionsService } from "../modules/permissions/permissions.service.js";
import { verifyAccessToken } from "../shared/auth-tokens.js";
import { AppError } from "../shared/app-error.js";

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
};

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(new AppError("Token não informado", 401, "AUTH_TOKEN_MISSING"));
  }

  const [, token] = authHeader.split(" ");

  if (!token) {
    return next(new AppError("Token inválido", 401, "AUTH_TOKEN_INVALID"));
  }

  try {
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        rank: true,
        cpf: true,
        active: true,
      },
    });

    if (!user || !user.active) {
      return next(
        new AppError(
          "Usuário não encontrado ou inativo",
          401,
          "AUTH_USER_INACTIVE_OR_NOT_FOUND",
        ),
      );
    }

    const effectivePermissions = await permissionsService.getEffectivePermissionsForUser(
      user.id,
      user.role,
    );

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: effectivePermissions,
      rank: user.rank,
      cpf: user.cpf,
    };

    return next();
  } catch {
    return next(
      new AppError(
        "Token inválido ou expirado",
        401,
        "AUTH_TOKEN_INVALID_OR_EXPIRED",
      ),
    );
  }
}
