import { Router } from "express";
import { ataItemsRoutes } from "./modules/ata-items/ata-items.routes.js";
import { atasRoutes } from "./modules/atas/atas.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { estimatesRoutes } from "./modules/estimates/estimates.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { projectsRoutes } from "./modules/projects/projects.routes.js";
import { tasksRoutes } from "./modules/tasks/tasks.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";

export const routes = Router();

routes.use("/health", healthRoutes);
routes.use("/auth", authRoutes);
routes.use("/users", usersRoutes);
routes.use("/projects", projectsRoutes);
routes.use("/tasks", tasksRoutes);
routes.use("/atas", atasRoutes);
routes.use("/ata-items", ataItemsRoutes);
routes.use("/estimates", estimatesRoutes);
routes.use("/dashboard", dashboardRoutes);