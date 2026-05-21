import { NextFunction, Request, Response, Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { AtaItemsController } from "./ata-items.controller.js";

export const ataItemsRoutes = Router();
const controller = new AtaItemsController();

const allowExternalConsumptionRegistration = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return res.status(401).json({ message: "Usuário não autenticado" });
  }

  if (
    req.user.role === "ADMIN" ||
    req.user.role === "GESTOR" ||
    req.user.permissions?.includes("atas.manage")
  ) {
    return next();
  }

  return res.status(403).json({
    message: "Você não tem permissão para registrar consumo externo manual",
  });
};

ataItemsRoutes.use(authMiddleware);

ataItemsRoutes.get("/", (req, res) => controller.list(req, res));
ataItemsRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));
ataItemsRoutes.get("/:id/movements", (req, res) => controller.listMovements(req, res));
ataItemsRoutes.get("/:id/balance-comparison", (req, res) =>
  controller.balanceComparison(req, res)
);
ataItemsRoutes.post("/:id/sync-external-balance", requirePermission("atas.manage"), (req, res) =>
  controller.syncExternalBalance(req, res)
);
ataItemsRoutes.post(
  "/:id/register-external-consumption",
  allowExternalConsumptionRegistration,
  (req, res) => controller.registerExternalConsumption(req, res),
);
ataItemsRoutes.get("/:id", (req, res) => controller.findById(req, res));
ataItemsRoutes.patch("/:id", requirePermission("atas.manage"), (req, res) =>
  controller.update(req, res)
);
ataItemsRoutes.delete("/:id", requirePermission("atas.manage"), (req, res) =>
  controller.remove(req, res)
);
