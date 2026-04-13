import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { ProjectMembersController } from "./project-members.controller.js";

export const projectMembersRoutes = Router({ mergeParams: true });
const controller = new ProjectMembersController();

projectMembersRoutes.use(authMiddleware);

projectMembersRoutes.post("/", (req, res) => controller.addMember(req, res));
projectMembersRoutes.get("/", (req, res) => controller.listMembers(req, res));
projectMembersRoutes.delete("/:memberId", (req, res) => controller.removeMember(req, res));