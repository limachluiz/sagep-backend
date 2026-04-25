import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { permissionsService } from "../permissions/permissions.service.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

type CreateTaskInput = {
  projectId?: string;
  projectCode?: number;
  title: string;
  description?: string;
  status?: "PENDENTE" | "EM_ANDAMENTO" | "REVISAO" | "CONCLUIDA" | "CANCELADA";
  priority?: number;
  assigneeId?: string;
  assigneeUserCode?: number;
  dueDate?: Date;
};

type UpdateTaskInput = {
  title?: string;
  description?: string;
  status?: "PENDENTE" | "EM_ANDAMENTO" | "REVISAO" | "CONCLUIDA" | "CANCELADA";
  priority?: number;
  assigneeId?: string;
  assigneeUserCode?: number;
  clearAssignee?: boolean;
  dueDate?: Date;
};

type UpdateTaskStatusInput = {
  status: "PENDENTE" | "EM_ANDAMENTO" | "REVISAO" | "CONCLUIDA" | "CANCELADA";
};

type ListTasksFilters = {
  code?: number;
  projectCode?: number;
  assigneeCode?: number;
  status?: "PENDENTE" | "EM_ANDAMENTO" | "REVISAO" | "CONCLUIDA" | "CANCELADA";
  search?: string;
};

const taskInclude = {
  project: {
    select: {
      id: true,
      projectCode: true,
      title: true,
      status: true,
      ownerId: true,
    },
  },
  assignee: {
    select: {
      id: true,
      userCode: true,
      name: true,
      email: true,
      role: true,
      active: true,
    },
  },
} satisfies Prisma.TaskInclude;

export class TasksService {
  private isPrivileged(role: string) {
    return role === "ADMIN" || role === "GESTOR";
  }

  private async resolveProject(projectId?: string, projectCode?: number) {
    if (projectId && projectCode) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          projectCode: true,
          title: true,
          ownerId: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!project || project.projectCode !== projectCode) {
        throw new AppError("ProjectId e projectCode não correspondem ao mesmo projeto", 400);
      }

      return project;
    }

    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          projectCode: true,
          title: true,
          ownerId: true,
          members: {
            select: {
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

    if (projectCode) {
      const project = await prisma.project.findUnique({
        where: { projectCode },
        select: {
          id: true,
          projectCode: true,
          title: true,
          ownerId: true,
          members: {
            select: {
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

    throw new AppError("Projeto não informado", 400);
  }

  private async resolveAssignee(assigneeId?: string, assigneeUserCode?: number) {
    if (!assigneeId && !assigneeUserCode) {
      return null;
    }

    if (assigneeId && assigneeUserCode) {
      const user = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: {
          id: true,
          userCode: true,
          active: true,
        },
      });

      if (!user || user.userCode !== assigneeUserCode) {
        throw new AppError("assigneeId e assigneeUserCode não correspondem ao mesmo usuário", 400);
      }

      if (!user.active) {
        throw new AppError("Não é possível atribuir tarefa a um usuário inativo", 409);
      }

      return user;
    }

    if (assigneeId) {
      const user = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: {
          id: true,
          userCode: true,
          active: true,
        },
      });

      if (!user) {
        throw new AppError("Usuário responsável não encontrado", 404);
      }

      if (!user.active) {
        throw new AppError("Não é possível atribuir tarefa a um usuário inativo", 409);
      }

      return user;
    }

    if (assigneeUserCode) {
      const user = await prisma.user.findUnique({
        where: { userCode: assigneeUserCode },
        select: {
          id: true,
          userCode: true,
          active: true,
        },
      });

      if (!user) {
        throw new AppError("Usuário responsável não encontrado", 404);
      }

      if (!user.active) {
        throw new AppError("Não é possível atribuir tarefa a um usuário inativo", 409);
      }

      return user;
    }

    return null;
  }

  private canManageProject(project: { ownerId: string; members: { userId: string }[] }, user: CurrentUser) {
    if (permissionsService.hasPermission(user, "projects.edit_all")) {
      return true;
    }

    if (
      permissionsService.hasPermission(user, "projects.edit_own") &&
      project.ownerId === user.id
    ) {
      return true;
    }

    const isMember = project.members.some((member) => member.userId === user.id);

    if (isMember && user.role !== "CONSULTA") {
      return true;
    }

    return false;
  }

  private ensureAssigneeBelongsToProject(
    project: { ownerId: string; members: { userId: string }[] },
    assigneeId: string
  ) {
    const isOwner = project.ownerId === assigneeId;
    const isMember = project.members.some((member) => member.userId === assigneeId);

    if (!isOwner && !isMember) {
      throw new AppError(
        "O responsável da tarefa precisa ser o dono do projeto ou um membro vinculado a ele",
        409
      );
    }
  }

  private async getTaskAccessData(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskCode: true,
        assigneeId: true,
        project: {
          select: {
            id: true,
            projectCode: true,
            title: true,
            ownerId: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!task) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    return task;
  }

  private async getTaskAccessDataByCode(taskCode: number) {
    const task = await prisma.task.findUnique({
      where: { taskCode },
      select: {
        id: true,
        taskCode: true,
        assigneeId: true,
        project: {
          select: {
            id: true,
            projectCode: true,
            title: true,
            ownerId: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!task) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    return task;
  }

  private async ensureCanView(taskId: string, user: CurrentUser) {
    const task = await this.getTaskAccessData(taskId);

    if (this.isPrivileged(user.role)) {
      return task;
    }

    const isOwner = task.project.ownerId === user.id;
    const isMember = task.project.members.some((member) => member.userId === user.id);
    const isAssignee = task.assigneeId === user.id;

    if (!isOwner && !isMember && !isAssignee) {
      throw new AppError("Você não tem acesso a esta tarefa", 403);
    }

    return task;
  }

  private async ensureCanViewByCode(taskCode: number, user: CurrentUser) {
    const task = await this.getTaskAccessDataByCode(taskCode);

    if (this.isPrivileged(user.role)) {
      return task;
    }

    const isOwner = task.project.ownerId === user.id;
    const isMember = task.project.members.some((member) => member.userId === user.id);
    const isAssignee = task.assigneeId === user.id;

    if (!isOwner && !isMember && !isAssignee) {
      throw new AppError("Você não tem acesso a esta tarefa", 403);
    }

    return task;
  }

  private async ensureCanManage(taskId: string, user: CurrentUser) {
    const task = await this.getTaskAccessData(taskId);

    if (permissionsService.hasPermission(user, "projects.edit_all")) {
      return task;
    }

    if (
      permissionsService.hasPermission(user, "projects.edit_own") &&
      task.project.ownerId === user.id
    ) {
      return task;
    }

    const isMember = task.project.members.some((member) => member.userId === user.id);

    if (isMember && user.role !== "CONSULTA") {
      return task;
    }

    throw new AppError("Você não tem permissão para gerenciar esta tarefa", 403);
  }

  async create(data: CreateTaskInput, user: CurrentUser) {
    const project = await this.resolveProject(data.projectId, data.projectCode);

    if (!this.canManageProject(project, user)) {
      throw new AppError("Você não tem permissão para criar tarefas neste projeto", 403);
    }

    const assignee = await this.resolveAssignee(data.assigneeId, data.assigneeUserCode);

    if (assignee) {
      this.ensureAssigneeBelongsToProject(project, assignee.id);
    }

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status ?? "PENDENTE",
        priority: data.priority ?? 3,
        dueDate: data.dueDate,
        projectId: project.id,
        assigneeId: assignee?.id,
      },
      include: taskInclude,
    });

    return task;
  }

  async list(filters: ListTasksFilters, user: CurrentUser) {
    const andConditions: Prisma.TaskWhereInput[] = [];

    if (!this.isPrivileged(user.role)) {
      andConditions.push({
        OR: [
          { assigneeId: user.id },
          { project: { ownerId: user.id } },
          { project: { members: { some: { userId: user.id } } } },
        ],
      });
    }

    if (filters.code) {
      andConditions.push({
        taskCode: filters.code,
      });
    }

    if (filters.projectCode) {
      andConditions.push({
        project: {
          projectCode: filters.projectCode,
        },
      });
    }

    if (filters.assigneeCode) {
      andConditions.push({
        assignee: {
          userCode: filters.assigneeCode,
        },
      });
    }

    if (filters.status) {
      andConditions.push({
        status: filters.status,
      });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          {
            title: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        ],
      });
    }

    const where: Prisma.TaskWhereInput | undefined =
      andConditions.length > 0 ? { AND: andConditions } : undefined;

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [
        { taskCode: "asc" },
      ],
    });

    return tasks;
  }

  async findById(taskId: string, user: CurrentUser) {
    await this.ensureCanView(taskId, user);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          select: {
            id: true,
            projectCode: true,
            title: true,
            status: true,
            owner: {
              select: {
                id: true,
                userCode: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
        assignee: {
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
    });

    if (!task) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    return task;
  }

  async findByCode(taskCode: number, user: CurrentUser) {
    await this.ensureCanViewByCode(taskCode, user);

    const task = await prisma.task.findUnique({
      where: { taskCode },
      include: {
        project: {
          select: {
            id: true,
            projectCode: true,
            title: true,
            status: true,
            owner: {
              select: {
                id: true,
                userCode: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
        assignee: {
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
    });

    if (!task) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    return task;
  }

  async update(taskId: string, data: UpdateTaskInput, user: CurrentUser) {
    const taskAccess = await this.ensureCanManage(taskId, user);

    let resolvedAssigneeId: string | undefined;

    if (data.clearAssignee) {
      resolvedAssigneeId = undefined;
    } else if (data.assigneeId || data.assigneeUserCode) {
      const assignee = await this.resolveAssignee(data.assigneeId, data.assigneeUserCode);

      if (assignee) {
        this.ensureAssigneeBelongsToProject(taskAccess.project, assignee.id);
        resolvedAssigneeId = assignee.id;
      }
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        ...(data.clearAssignee === true && { assigneeId: null }),
        ...(data.clearAssignee !== true &&
          resolvedAssigneeId !== undefined && { assigneeId: resolvedAssigneeId }),
      },
      include: taskInclude,
    });

    return task;
  }

  async updateStatus(taskId: string, data: UpdateTaskStatusInput, user: CurrentUser) {
    const taskAccess = await this.getTaskAccessData(taskId);

    const canManage =
      permissionsService.hasPermission(user, "projects.edit_all") ||
      (permissionsService.hasPermission(user, "projects.edit_own") &&
        taskAccess.project.ownerId === user.id) ||
      taskAccess.project.members.some((member) => member.userId === user.id && user.role !== "CONSULTA");

    const isAssignee = taskAccess.assigneeId === user.id && user.role !== "CONSULTA";

    if (!canManage && !isAssignee) {
      throw new AppError("Você não tem permissão para alterar o status desta tarefa", 403);
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: data.status,
      },
      include: taskInclude,
    });

    return task;
  }

  async remove(taskId: string, user: CurrentUser) {
    await this.ensureCanManage(taskId, user);

    await prisma.task.delete({
      where: { id: taskId },
    });

    return {
      message: "Tarefa excluída com sucesso",
    };
  }
}
