import { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response) {
    const data = registerSchema.parse(req.body);
    const user = await authService.register(data);

    return res.status(201).json(user);
  }

  async login(req: Request, res: Response) {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);

    return res.status(200).json(result);
  }

  async me(req: Request, res: Response) {
    const userId = req.user!.id;
    const user = await authService.me(userId);

    return res.status(200).json(user);
  }
}