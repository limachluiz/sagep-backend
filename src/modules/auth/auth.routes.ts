import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

export const authRoutes = Router();
const controller = new AuthController();

authRoutes.post("/register", (req, res) => controller.register(req, res));
authRoutes.post("/login", (req, res) => controller.login(req, res));
authRoutes.get("/me", authMiddleware, (req, res) => controller.me(req, res));
authRoutes.get("/sessions", authMiddleware, (req, res) => controller.listOwnSessions(req, res));
authRoutes.post("/sessions/revoke-all", authMiddleware, (req, res) =>
  controller.revokeAllOwnSessions(req, res),
);
authRoutes.post("/sessions/cleanup", authMiddleware, (req, res) =>
  controller.cleanupSessions(req, res),
);
authRoutes.post("/sessions/:sessionId/revoke", authMiddleware, (req, res) =>
  controller.revokeOwnSession(req, res),
);
authRoutes.get("/users/:userId/sessions", authMiddleware, (req, res) =>
  controller.listUserSessions(req, res),
);
authRoutes.post("/users/:userId/sessions/revoke-all", authMiddleware, (req, res) =>
  controller.revokeAllUserSessions(req, res),
);
authRoutes.post("/users/:userId/sessions/:sessionId/revoke", authMiddleware, (req, res) =>
  controller.revokeUserSession(req, res),
);
authRoutes.post("/refresh", (req, res) => controller.refresh(req, res));
authRoutes.post("/logout", (req, res) => controller.logout(req, res));
