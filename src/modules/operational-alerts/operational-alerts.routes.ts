import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { OperationalAlertsController } from "./operational-alerts.controller.js";

export const operationalAlertsRoutes = Router();
const controller = new OperationalAlertsController();

operationalAlertsRoutes.use(authMiddleware);

operationalAlertsRoutes.get("/", (req, res) => controller.list(req, res));
operationalAlertsRoutes.delete("/", (req, res) => controller.dismissAll(req, res));
operationalAlertsRoutes.delete("/:notificationKey", (req, res) => controller.dismissOne(req, res));
