import { Request, Response } from "express";
import {
  createProjectSchema,
  listProjectsQuerySchema,
  projectCodeParamSchema,
  projectIdParamSchema,
  updateProjectFlowSchema,
  updateProjectSchema,
} from "./projects.schemas.js";
import { ProjectsService } from "./projects.service.js";

const projectsService = new ProjectsService();

export class ProjectsController {
  async create(req: Request, res: Response) {
    const data = createProjectSchema.parse(req.body);
    const project = await projectsService.create(data, req.user!);
    return res.status(201).json(project);
  }

  async list(req: Request, res: Response) {
    const filters = listProjectsQuerySchema.parse(req.query);
    const projects = await projectsService.list(filters, req.user!);
    return res.status(200).json(projects);
  }

  async findById(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const project = await projectsService.findById(id, req.user!);
    return res.status(200).json(project);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = projectCodeParamSchema.parse(req.params);
    const project = await projectsService.findByCode(code, req.user!);
    return res.status(200).json(project);
  }

  async update(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const data = updateProjectSchema.parse(req.body);
    const project = await projectsService.update(id, data, req.user!);
    return res.status(200).json(project);
  }

  async updateFlow(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const data = updateProjectFlowSchema.parse(req.body);
    const project = await projectsService.updateFlow(id, data, req.user!);
    return res.status(200).json(project);
  }

  async remove(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const result = await projectsService.remove(id, req.user!);
    return res.status(200).json(result);
  }
}