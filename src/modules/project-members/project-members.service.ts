import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { permissionsService } from "../permissions/permissions.service.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

type AddProjectMemberInput = {
  userId?: string;
  userCode?: number;
  role?: string;
};

export class ProjectMembersService {
  private isPrivileged(role: string) {
    return permissionsService.hasPermission({ role }, "projects.view_all");
  }

  private async getProjectAccessData(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        title: true,
        ownerId: true,
        members: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError("Projeto não encontrado", 404);
    }

    return project;
  }

  private async ensureCanView(projectId: string, user: CurrentUser) {
    const project = await this.getProjectAccessData(projectId);

    if (this.isPrivileged(user.role)) {
      return project;
    }

    const isOwner = project.ownerId === user.id;
    const isMember = project.members.some((member) => member.userId === user.id);

    if (!isOwner && !isMember) {
      throw new AppError("Você não tem acesso a este projeto", 403);
    }

    return project;
  }

  private async ensureCanManage(projectId: string, user: CurrentUser) {
    const project = await this.getProjectAccessData(projectId);

    if (permissionsService.hasPermission(user, "projects.edit_all")) {
      return project;
    }

    if (
      permissionsService.hasPermission(user, "projects.edit_own") &&
      project.ownerId === user.id
    ) {
      return project;
    }

    throw new AppError("Você não tem permissão para gerenciar membros deste projeto", 403);
  }

  private async resolveUser(userId?: string, userCode?: number) {
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          userCode: true,
          name: true,
          email: true,
          role: true,
          active: true,
        },
      });

      if (!user) {
        throw new AppError("Usuário não encontrado", 404);
      }

      return user;
    }

    if (userCode) {
      const user = await prisma.user.findUnique({
        where: { userCode },
        select: {
          id: true,
          userCode: true,
          name: true,
          email: true,
          role: true,
          active: true,
        },
      });

      if (!user) {
        throw new AppError("Usuário não encontrado", 404);
      }

      return user;
    }

    throw new AppError("Usuário não informado", 400);
  }

  async addMember(projectId: string, data: AddProjectMemberInput, currentUser: CurrentUser) {
    const project = await this.ensureCanManage(projectId, currentUser);
    const user = await this.resolveUser(data.userId, data.userCode);

    if (!user.active) {
      throw new AppError("Não é possível adicionar usuário inativo ao projeto", 409);
    }

    if (user.id === project.ownerId) {
      throw new AppError("O dono do projeto já possui acesso automático", 409);
    }

    const existingMember = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingMember) {
      throw new AppError("Este usuário já é membro do projeto", 409);
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId,
        userId: user.id,
        role: data.role,
      },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            userCode: true,
            name: true,
            email: true,
            role: true,
            active: true,
          },
        },
        project: {
          select: {
            id: true,
            projectCode: true,
            title: true,
          },
        },
      },
    });

    return member;
  }

  async listMembers(projectId: string, currentUser: CurrentUser) {
    const project = await this.ensureCanView(projectId, currentUser);

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            userCode: true,
            name: true,
            email: true,
            role: true,
            active: true,
          },
        },
      },
      orderBy: [
        {
          createdAt: "asc",
        },
      ],
    });

    return {
      project: {
        id: project.id,
        projectCode: project.projectCode,
        title: project.title,
        ownerId: project.ownerId,
      },
      members,
    };
  }

  async removeMember(projectId: string, memberId: string, currentUser: CurrentUser) {
    const project = await this.ensureCanManage(projectId, currentUser);

    const member = await prisma.projectMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        user: {
          select: {
            id: true,
            userCode: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!member || member.projectId !== projectId) {
      throw new AppError("Membro do projeto não encontrado", 404);
    }

    if (member.userId === project.ownerId) {
      throw new AppError("O dono do projeto não pode ser removido da equipe", 409);
    }

    const assignedTasksCount = await prisma.task.count({
      where: {
        projectId,
        assigneeId: member.userId,
      },
    });

    if (assignedTasksCount > 0) {
      throw new AppError(
        "Não é possível remover este membro porque ele ainda possui tarefas atribuídas neste projeto",
        409
      );
    }

    await prisma.projectMember.delete({
      where: { id: memberId },
    });

    return {
      message: "Membro removido do projeto com sucesso",
      removedMember: {
        id: member.id,
        user: member.user,
      },
    };
  }
}
