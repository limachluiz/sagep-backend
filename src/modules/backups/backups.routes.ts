import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { BackupsController } from "./backups.controller.js";

export const backupsRoutes = Router();
const controller = new BackupsController();
const adminOnly = [requirePermission("backups.manage"), requireRole("ADMIN")];

backupsRoutes.use(authMiddleware);
backupsRoutes.get("/", ...adminOnly, (req, res) => controller.list(req, res));
backupsRoutes.post("/", ...adminOnly, (req, res) => controller.create(req, res));
backupsRoutes.post(
  "/import",
  ...adminOnly,
  (req, res) => controller.importArchive(req, res),
);
backupsRoutes.post("/export", ...adminOnly, (req, res) => controller.selectiveExport(req, res));
backupsRoutes.get("/:id/download", ...adminOnly, (req, res) => controller.download(req, res));
backupsRoutes.post("/:id/restore", ...adminOnly, (req, res) => controller.restore(req, res));
backupsRoutes.delete("/:id", ...adminOnly, (req, res) => controller.remove(req, res));
