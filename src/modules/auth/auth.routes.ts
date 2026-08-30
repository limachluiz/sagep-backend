import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";
import {
  authSessionRateLimiter,
  loginAccountRateLimiter,
  loginRateLimiter,
} from "../../middlewares/rate-limit.middleware.js";
import { requireTrustedBrowserOrigin } from "../../middlewares/csrf.middleware.js";
import { requireStepUp } from "../../middlewares/step-up.middleware.js";

export const authRoutes = Router();
const controller = new AuthController();

authRoutes.post("/register", requireTrustedBrowserOrigin, loginRateLimiter, (req, res, next) => {
  if (!env.ALLOW_PUBLIC_REGISTRATION) {
    return next(
      new AppError(
        "Cadastro público desativado",
        403,
        "AUTH_PUBLIC_REGISTRATION_DISABLED",
      ),
    );
  }

  return controller.register(req, res);
});
authRoutes.post(
  "/login",
  requireTrustedBrowserOrigin,
  loginRateLimiter,
  loginAccountRateLimiter,
  (req, res) => controller.login(req, res),
);
authRoutes.get("/me", authMiddleware, (req, res) => controller.me(req, res));
authRoutes.post("/reauthenticate", authMiddleware, authSessionRateLimiter, (req, res) =>
  controller.reauthenticate(req, res),
);
authRoutes.patch("/profile", authMiddleware, (req, res) => controller.updateOwnProfile(req, res));
authRoutes.post("/change-password", authMiddleware, (req, res) =>
  controller.changeOwnPassword(req, res),
);
authRoutes.get("/sessions", authMiddleware, (req, res) => controller.listOwnSessions(req, res));
authRoutes.post("/sessions/revoke-all", authMiddleware, requireStepUp, (req, res) =>
  controller.revokeAllOwnSessions(req, res),
);
authRoutes.post("/sessions/cleanup", authMiddleware, requireStepUp, (req, res) =>
  controller.cleanupSessions(req, res),
);
authRoutes.post("/sessions/:sessionId/revoke", authMiddleware, (req, res) =>
  controller.revokeOwnSession(req, res),
);
authRoutes.get("/users/:userId/sessions", authMiddleware, (req, res) =>
  controller.listUserSessions(req, res),
);
authRoutes.post("/users/:userId/sessions/revoke-all", authMiddleware, requireStepUp, (req, res) =>
  controller.revokeAllUserSessions(req, res),
);
authRoutes.post("/users/:userId/sessions/:sessionId/revoke", authMiddleware, requireStepUp, (req, res) =>
  controller.revokeUserSession(req, res),
);
authRoutes.post("/refresh", requireTrustedBrowserOrigin, authSessionRateLimiter, (req, res) => controller.refresh(req, res));
authRoutes.post("/logout", requireTrustedBrowserOrigin, authSessionRateLimiter, (req, res) => controller.logout(req, res));
