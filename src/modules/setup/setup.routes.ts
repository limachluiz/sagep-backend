import { Router } from "express";
import { requireTrustedBrowserOrigin } from "../../middlewares/csrf.middleware.js";
import { sensitiveRateLimiter } from "../../middlewares/rate-limit.middleware.js";
import { SetupController } from "./setup.controller.js";

export const setupRoutes = Router();
const controller = new SetupController();

setupRoutes.get("/status", (req, res) => controller.status(req, res));
setupRoutes.post(
  "/initialize",
  requireTrustedBrowserOrigin,
  sensitiveRateLimiter,
  (req, res) => controller.initialize(req, res),
);
