import { Router } from "express";
import { serviceOrdersRoutes } from "../service-orders/service-orders.routes.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { ProjectMembersController } from "../project-members/project-members.controller.js";
import { ProjectsController } from "./projects.controller.js";

export const projectsRoutes = Router();
const controller = new ProjectsController();
const projectMembersController = new ProjectMembersController();

projectsRoutes.use(authMiddleware);

projectsRoutes.post("/", (req, res) => controller.create(req, res));
projectsRoutes.get("/", (req, res) => controller.list(req, res));
projectsRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));

projectsRoutes.post("/:id/members", (req, res) => projectMembersController.addMember(req, res));
projectsRoutes.get("/:id/members", (req, res) => projectMembersController.listMembers(req, res));
projectsRoutes.delete("/:id/members/:memberId", (req, res) =>
  projectMembersController.removeMember(req, res)
);

projectsRoutes.patch("/:id/flow", (req, res) => controller.updateFlow(req, res));
projectsRoutes.patch("/:id/as-built/review", (req, res) => controller.reviewAsBuilt(req, res));
projectsRoutes.post("/:id/commitment-note/cancel", (req, res) =>
  controller.cancelCommitmentNote(req, res)
);
projectsRoutes.use("/:id/service-order", serviceOrdersRoutes);
projectsRoutes.get("/:id/details", (req, res) => controller.details(req, res));
projectsRoutes.get("/:id/timeline", (req, res) => controller.timeline(req, res));
projectsRoutes.get("/:id/next-action", (req, res) => controller.nextAction(req, res));
projectsRoutes.get("/:id", (req, res) => controller.findById(req, res));
projectsRoutes.patch("/:id", (req, res) => controller.update(req, res));
projectsRoutes.post("/:id/restore", (req, res) => controller.restore(req, res));
projectsRoutes.delete("/:id", (req, res) => controller.remove(req, res));
