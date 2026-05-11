import { Request, Response } from "express";
import {
  createUserByAdminSchema,
  listUsersQuerySchema,
  updateUserSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from "./users.schemas.js";
import { UsersService } from "./users.service.js";
import { buildListResponse } from "../../shared/pagination.js";

const usersService = new UsersService();

export class UsersController {
  async create(req: Request, res: Response) {
    const data = createUserByAdminSchema.parse(req.body);

    const user = await usersService.create(data);

    return res.status(201).json(user);
  }

  async list(req: Request, res: Response) {
    const filters = listUsersQuerySchema.parse(req.query);
    const users = await usersService.list(filters);

    if (filters.format === "legacy") {
      return res.status(200).json(users);
    }

    return res.status(200).json(
      buildListResponse({
        items: users,
        pagination: filters,
        filters,
        path: req.originalUrl,
      }),
    );
  }

  async findById(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const user = await usersService.findById(id);

    return res.status(200).json(user);
  }

  async update(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const data = updateUserSchema.parse(req.body);

    const user = await usersService.update(id, data);

    return res.status(200).json(user);
  }

  async updateStatus(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const data = updateUserStatusSchema.parse(req.body);

    const user = await usersService.updateStatus(id, data, req.user!);

    return res.status(200).json(user);
  }

  async updateRole(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const data = updateUserRoleSchema.parse(req.body);

    const user = await usersService.updateRole(id, data, req.user!);

    return res.status(200).json(user);
  }
}
