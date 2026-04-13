import { Request, Response } from "express";
import {
  createUserByAdminSchema,
  updateUserRoleSchema,
  userIdParamSchema,
} from "./users.schemas.js";
import { UsersService } from "./users.service.js";

const usersService = new UsersService();

export class UsersController {
  async create(req: Request, res: Response) {
    const data = createUserByAdminSchema.parse(req.body);

    const user = await usersService.create(data);

    return res.status(201).json(user);
  }

  async list(_req: Request, res: Response) {
    const users = await usersService.list();

    return res.status(200).json(users);
  }

  async updateRole(req: Request, res: Response) {
    const { id } = userIdParamSchema.parse(req.params);
    const data = updateUserRoleSchema.parse(req.body);

    const user = await usersService.updateRole(id, data, req.user!);

    return res.status(200).json(user);
  }
}