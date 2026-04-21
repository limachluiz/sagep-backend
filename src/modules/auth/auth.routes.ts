import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

export const authRoutes = Router();
const controller = new AuthController();

authRoutes.post("/register", (req, res) => controller.register(req, res));
authRoutes.post("/login", (req, res) => controller.login(req, res));
authRoutes.get("/me", authMiddleware, (req, res) => controller.me(req, res));
authRoutes.post("/refresh", (req, res) => controller.refresh(req, res));
authRoutes.post("/logout", (req, res) => controller.logout(req, res));