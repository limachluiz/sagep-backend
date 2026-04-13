import { Request, Response } from "express";
import {
  createTaskSchema,
  listTasksQuerySchema,
  taskCodeParamSchema,
  taskIdParamSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from "./tasks.schemas.js";
import { TasksService } from "./tasks.service.js";

const tasksService = new TasksService();

export class TasksController {
  async create(req: Request, res: Response) {
    const data = createTaskSchema.parse(req.body);
    const task = await tasksService.create(data, req.user!);
    return res.status(201).json(task);
  }

  async list(req: Request, res: Response) {
    const filters = listTasksQuerySchema.parse(req.query);
    const tasks = await tasksService.list(filters, req.user!);
    return res.status(200).json(tasks);
  }

  async findById(req: Request, res: Response) {
    const { id } = taskIdParamSchema.parse(req.params);
    const task = await tasksService.findById(id, req.user!);
    return res.status(200).json(task);
  }

  async findByCode(req: Request, res: Response) {
    const { code } = taskCodeParamSchema.parse(req.params);
    const task = await tasksService.findByCode(code, req.user!);
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
}