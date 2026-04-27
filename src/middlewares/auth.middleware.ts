import { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { permissionsService } from "../modules/permissions/permissions.service.js";
import { verifyAccessToken } from "../shared/auth-tokens.js";

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
    return res.status(401).json({ message: "Token não informado" });
  }

  const [, token] = authHeader.split(" ");

  if (!token) {
    return res.status(401).json({ message: "Token inválido" });
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
      return res.status(401).json({ message: "Usuário não encontrado ou inativo" });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: permissionsService.getPermissionsForRole(user.role),
      rank: user.rank,
      cpf: user.cpf,
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido ou expirado" });
  }
}
