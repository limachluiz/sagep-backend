import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { ServiceOrdersController } from "./service-orders.controller.js";

export const serviceOrdersRoutes = Router();
const controller = new ServiceOrdersController();

serviceOrdersRoutes.use(authMiddleware);

serviceOrdersRoutes.post("/", (req, res) => controller.create(req, res));
serviceOrdersRoutes.get("/", (req, res) => controller.list(req, res));
serviceOrdersRoutes.get("/number/:serviceOrderNumber", (req, res) => controller.findByNumber(req, res));
serviceOrdersRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));

serviceOrdersRoutes.get("/:id/document/html", (req, res) => controller.documentHtml(req, res));
serviceOrdersRoutes.get("/:id/document/pdf", (req, res) => controller.documentPdf(req, res));

serviceOrdersRoutes.get("/:id", (req, res) => controller.findById(req, res));
serviceOrdersRoutes.patch("/:id", (req, res) => controller.update(req, res));
serviceOrdersRoutes.post("/:id/restore", (req, res) => controller.restore(req, res));
serviceOrdersRoutes.delete("/:id", (req, res) => controller.remove(req, res));
