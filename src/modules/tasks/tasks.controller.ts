import { Request, Response } from "express";
import {
  archivedTaskQuerySchema,
  completeTaskSchema,
  createTaskActivitySchema,
  createTaskSchema,
  listTasksQuerySchema,
  taskCodeParamSchema,
  taskIdParamSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from "./tasks.schemas.js";
import { TasksService } from "./tasks.service.js";
import { buildListResponse } from "../../shared/pagination.js";
import { restoreOptionsSchema } from "../../shared/restore.schemas.js";

const tasksService = new TasksService();

export class TasksController {
  async addActivity(req: Request, res: Response) {
    const { id } = taskIdParamSchema.parse(req.params);
    return res.status(201).json(await tasksService.addActivity(id, createTaskActivitySchema.parse(req.body), req.user!));
  }

  async complete(req: Request, res: Response) {
    const { id } = taskIdParamSchema.parse(req.params);
    return res.status(200).json(await tasksService.complete(id, completeTaskSchema.parse(req.body ?? {}), req.user!));
  }

  async create(req: Request, res: Response) {
    const data = createTaskSchema.parse(req.body);
    const task = await tasksService.create(data, req.user!);
    return res.status(201).json(task);
  }

  async list(req: Request, res: Response) {
    const filters = listTasksQuerySchema.parse(req.query);
    const tasks = await tasksService.list(filters, req.user!);
    if (filters.format === "legacy") {
      return res.status(200).json(tasks);
    }

    return res.status(200).json(
      buildListResponse({
        items: tasks,
        pagination: filters,
        filters,
        path: req.originalUrl,
      }),
    );
  }

  async findById(req: Request, res: Response) {
    const { id } = taskIdParamSchema.parse(req.params);
    const query = archivedTaskQuerySchema.parse(req.query);
    const task = await tasksService.findById(id, req.user!, query);
    return res.status(200).json(task);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = taskCodeParamSchema.parse(req.params);
    const query = archivedTaskQuerySchema.parse(req.query);
    const task = await tasksService.findByCode(code, req.user!, query);
    return res.status(200).json(task);
  }

  async update(req: Request, res: Response) {
    const { id } = taskIdParamSchema.parse(req.params);
    const data = updateTaskSchema.parse(req.body);
    const task = await tasksService.update(id, data, req.user!);
    return res.status(200).json(task);
  }

  async updateStatus(req: Request, res: Response) {
    const { id } = taskIdParamSchema.parse(req.params);
    const data = updateTaskStatusSchema.parse(req.body);
    const task = await tasksService.updateStatus(id, data, req.user!);
    return res.status(200).json(task);
  }

  async remove(req: Request, res: Response) {
    const { id } = taskIdParamSchema.parse(req.params);
    const result = await tasksService.remove(id, req.user!);
    return res.status(200).json(result);
  }

  async restore(req: Request, res: Response) {
    const { id } = taskIdParamSchema.parse(req.params);
    const options = restoreOptionsSchema.parse(req.body ?? {});
    const result = await tasksService.restore(id, req.user!, options);
    return res.status(200).json(result);
  }

  async softDelete(req: Request, res: Response) {
    const { id } = taskIdParamSchema.parse(req.params);
    const result = await tasksService.softDelete(id, req.user!);
    return res.status(200).json(result);
  }
}
