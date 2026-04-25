import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { GlobalSearchController } from "./global-search.controller.js";

export const globalSearchRoutes = Router();
const controller = new GlobalSearchController();

globalSearchRoutes.use(authMiddleware);

globalSearchRoutes.get("/", (req, res) => controller.search(req, res));
