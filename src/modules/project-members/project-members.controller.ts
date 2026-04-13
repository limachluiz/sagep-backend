import { Request, Response } from "express";
import {
  addProjectMemberSchema,
  projectIdParamSchema,
  projectMemberIdParamSchema,
} from "./project-members.schemas.js";
import { ProjectMembersService } from "./project-members.service.js";

const projectMembersService = new ProjectMembersService();

export class ProjectMembersController {
  async addMember(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const data = addProjectMemberSchema.parse(req.body);

    const member = await projectMembersService.addMember(id, data, req.user!);

    return res.status(201).json(member);
  }

  async listMembers(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);

    const result = await projectMembersService.listMembers(id, req.user!);

    return res.status(200).json(result);
  }

  async removeMember(req: Request, res: Response) {
    const { id, memberId } = projectMemberIdParamSchema.parse(req.params);

    const result = await projectMembersService.removeMember(id, memberId, req.user!);

    return res.status(200).json(result);
  }
}