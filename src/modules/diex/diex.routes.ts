import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { DiexController } from "./diex.controller.js";

export const diexRoutes = Router();
const controller = new DiexController();

diexRoutes.use(authMiddleware);

diexRoutes.post("/", (req, res) => controller.create(req, res));
diexRoutes.get("/", (req, res) => controller.list(req, res));
diexRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));

diexRoutes.get("/:id/document/html", (req, res) => controller.documentHtml(req, res));
diexRoutes.get("/:id/document/pdf", (req, res) => controller.documentPdf(req, res));

diexRoutes.get("/:id", (req, res) => controller.findById(req, res));
diexRoutes.patch("/:id", (req, res) => controller.update(req, res));
diexRoutes.post("/:id/restore", (req, res) => controller.restore(req, res));
diexRoutes.delete("/:id", (req, res) => controller.remove(req, res));
