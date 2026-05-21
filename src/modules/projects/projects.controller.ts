import { Request, Response } from "express";
import {
  archivedQuerySchema,
  cancelCommitmentNoteSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  projectCodeParamSchema,
  projectIdParamSchema,
  reviewAsBuiltSchema,
  updateProjectFlowSchema,
  updateProjectSchema,
} from "./projects.schemas.js";
import { ProjectsService } from "./projects.service.js";
import { AppError } from "../../shared/app-error.js";
import { buildListResponse } from "../../shared/pagination.js";
import { restoreOptionsSchema } from "../../shared/restore.schemas.js";

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
    if (filters.format === "legacy") {
      return res.status(200).json(projects);
    }

    return res.status(200).json(
      buildListResponse({
        items: projects,
        pagination: filters,
        filters,
        path: req.originalUrl,
      }),
    );
  }

  async findById(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const query = archivedQuerySchema.parse(req.query);
    const project = await projectsService.findById(id, req.user!, query);
    return res.status(200).json(project);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = projectCodeParamSchema.parse(req.params);
    const query = archivedQuerySchema.parse(req.query);
    const project = await projectsService.findByCode(code, req.user!, query);
    return res.status(200).json(project);
  }

  async details(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const query = archivedQuerySchema.parse(req.query);
    const details = await projectsService.getDetails(id, req.user!, query);
    return res.status(200).json(details);
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

  async cancelCommitmentNote(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const data = cancelCommitmentNoteSchema.parse(req.body);
    const result = await projectsService.cancelCommitmentNote(id, data, req.user!);
    return res.status(200).json(result);
  }

  async reviewAsBuilt(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const data = reviewAsBuiltSchema.parse(req.body);
    const project = await projectsService.reviewAsBuilt(id, data, req.user!);
    return res.status(200).json(project);
  }

  async remove(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const result = await projectsService.remove(id, req.user!);
    return res.status(200).json(result);
  }

  async restore(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const options = restoreOptionsSchema.parse(req.body ?? {});
    const result = await projectsService.restore(id, req.user!, options);
    return res.status(200).json(result);
  }

  async timeline(req: Request, res: Response) {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!projectId) {
      throw new AppError("ID do projeto é obrigatório", 400);
    }

    const result = await projectsService.getTimeline(projectId, req.user!);
    return res.json(result);
  }

  async nextAction(req: Request, res: Response) {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!projectId) {
      throw new AppError("ID do projeto é obrigatório", 400);
    }

    const result = await projectsService.getNextAction(projectId, req.user!);
    return res.json(result);
  }
}
