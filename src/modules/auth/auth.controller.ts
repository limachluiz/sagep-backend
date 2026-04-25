import { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { loginSchema, logoutSchema, refreshTokenSchema, registerSchema } from "./auth.schemas.js";

const authService = new AuthService();

function getRequestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  };
}

export class AuthController {
  async register(req: Request, res: Response) {
    const data = registerSchema.parse(req.body);
    const user = await authService.register(data);

    return res.status(201).json(user);
  }

  async login(req: Request, res: Response) {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data, getRequestContext(req));

    return res.status(200).json(result);
  }

  async me(req: Request, res: Response) {
    const userId = req.user!.id;
    const user = await authService.me(userId);

    return res.status(200).json(user);
  }

  async refresh(req: Request, res: Response) {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const tokens = await authService.refresh(refreshToken, getRequestContext(req));

    return res.status(200).json(tokens);
  }

  async logout(req: Request, res: Response) {
    const { refreshToken } = logoutSchema.parse(req.body);
    const result = await authService.logout(refreshToken, getRequestContext(req));
    return res.status(200).json(result);
  }
}
