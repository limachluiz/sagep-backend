import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { ExportsController } from "./exports.controller.js";

export const exportsRoutes = Router();
const controller = new ExportsController();

exportsRoutes.use(authMiddleware);

exportsRoutes.get("/projects.xlsx", (req, res) => controller.projectsXlsx(req, res));
