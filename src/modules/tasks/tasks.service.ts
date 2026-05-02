import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { withArchiveContext } from "../../shared/archive-context.js";
import type { RestoreOptions } from "../../shared/restore.schemas.js";
import { auditService } from "../audit/audit.service.js";
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
  includeArchived?: boolean;
  onlyArchived?: boolean;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  archivedFrom?: Date;
  archivedUntil?: Date;
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
  private isAdmin(role: string) {
    return role === "ADMIN";
  }

  private isPrivileged(role: string) {
    return permissionsService.hasPermission({ role }, "tasks.view_all");
  }

  private resolveArchivedAccess(
    user: CurrentUser,
    filters: {
      includeArchived?: boolean;
      onlyArchived?: boolean;
      includeDeleted?: boolean;
      onlyDeleted?: boolean;
      archivedFrom?: Date;
      archivedUntil?: Date;
    },
  ) {
    if (
      (filters.includeArchived ||
        filters.onlyArchived ||
        filters.includeDeleted ||
        filters.onlyDeleted ||
        filters.archivedFrom ||
        filters.archivedUntil) &&
      !this.isAdmin(user.role)
    ) {
      throw new AppError("Apenas ADMIN pode consultar tarefas arquivadas", 403);
    }

    if (filters.onlyArchived && filters.onlyDeleted) {
      throw new AppError("Use onlyArchived ou onlyDeleted, não ambos", 400);
    }

    return {
      includeArchived: Boolean(filters.includeArchived && this.isAdmin(user.role)),
      onlyArchived: Boolean(filters.onlyArchived && this.isAdmin(user.role)),
      includeDeleted: Boolean(filters.includeDeleted && this.isAdmin(user.role)),
      onlyDeleted: Boolean(filters.onlyDeleted && this.isAdmin(user.role)),
    };
  }

  private buildLifecycleVisibilityWhere(
    includeArchived = false,
    includeDeleted = false,
  ): Prisma.TaskWhereInput {
    if (includeArchived && includeDeleted) {
      return {};
    }

    if (includeArchived) {
      return { deletedAt: null };
    }

    if (includeDeleted) {
      return { archivedAt: null };
    }

    return {
      archivedAt: null,
      deletedAt: null,
    };
  }

  private getAuditActor(user: CurrentUser) {
    return {
      id: user.id,
      name: user.email,
    };
  }

  private buildTaskAuditSnapshot(task: {
    id: string;
    taskCode?: number | null;
    title?: string | null;
    status?: string | null;
    priority?: number | null;
    projectId?: string | null;
    assigneeId?: string | null;
    dueDate?: Date | null;
    archivedAt?: Date | null;
    deletedAt?: Date | null;
  }) {
    return {
      id: task.id,
      taskCode: task.taskCode ?? null,
      title: task.title ?? null,
      status: task.status ?? null,
      priority: task.priority ?? null,
      projectId: task.projectId ?? null,
      assigneeId: task.assigneeId ?? null,
      dueDate: task.dueDate ?? null,
      archivedAt: task.archivedAt ?? null,
      deletedAt: task.deletedAt ?? null,
    };
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
          archivedAt: true,
          deletedAt: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!project || project.deletedAt || project.archivedAt || project.projectCode !== projectCode) {
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
          archivedAt: true,
          deletedAt: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!project || project.deletedAt || project.archivedAt) {
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
          archivedAt: true,
          deletedAt: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!project || project.deletedAt || project.archivedAt) {
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
    if (permissionsService.hasPermission(user, "tasks.edit_all")) {
      return true;
    }

    if (
      permissionsService.hasPermission(user, "tasks.edit_own") &&
      project.ownerId === user.id
    ) {
      return true;
    }

    const isMember = project.members.some((member) => member.userId === user.id);

    if (isMember && permissionsService.hasPermission(user, "tasks.edit_own")) {
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
        archivedAt: true,
        deletedAt: true,
        project: {
          select: {
            id: true,
            projectCode: true,
            title: true,
            ownerId: true,
            deletedAt: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!task || task.deletedAt || task.project.deletedAt) {
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
        archivedAt: true,
        deletedAt: true,
        project: {
          select: {
            id: true,
            projectCode: true,
            title: true,
            ownerId: true,
            deletedAt: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!task || task.deletedAt || task.project.deletedAt) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    return task;
  }

  private async ensureCanView(taskId: string, user: CurrentUser, includeArchived = false) {
    const task = await this.getTaskAccessData(taskId);

    if (!includeArchived && task.archivedAt) {
      throw new AppError("Tarefa não encontrada", 404);
    }

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

  private async ensureCanViewByCode(taskCode: number, user: CurrentUser, includeArchived = false) {
    const task = await this.getTaskAccessDataByCode(taskCode);

    if (!includeArchived && task.archivedAt) {
      throw new AppError("Tarefa não encontrada", 404);
    }

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

    if (task.archivedAt) {
      throw new AppError("Tarefa arquivada não pode ser alterada", 409);
    }

    if (permissionsService.hasPermission(user, "tasks.edit_all")) {
      return task;
    }

    if (
      permissionsService.hasPermission(user, "tasks.edit_own") &&
      task.project.ownerId === user.id
    ) {
      return task;
    }

    const isMember = task.project.members.some((member) => member.userId === user.id);
    const isAssignee = task.assigneeId === user.id;

    if ((isMember || isAssignee) && permissionsService.hasPermission(user, "tasks.edit_own")) {
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

    if (assignee && !permissionsService.hasPermission(user, "tasks.assign")) {
      throw new AppError("VocÃª nÃ£o tem permissÃ£o para atribuir tarefas", 403);
    }

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
    const { includeArchived, onlyArchived, includeDeleted, onlyDeleted } =
      this.resolveArchivedAccess(user, filters);
    const andConditions: Prisma.TaskWhereInput[] = [];
    const hasArchivedPeriod = Boolean(filters.archivedFrom || filters.archivedUntil);

    andConditions.push(
      onlyDeleted
        ? {
            deletedAt: {
              not: null,
            },
          }
        : onlyArchived || hasArchivedPeriod
        ? {
            archivedAt: {
              not: null,
              ...(filters.archivedFrom && { gte: filters.archivedFrom }),
              ...(filters.archivedUntil && { lte: filters.archivedUntil }),
            },
            deletedAt: null,
          }
        : this.buildLifecycleVisibilityWhere(includeArchived, includeDeleted),
    );

    if (!onlyDeleted) {
      andConditions.push({
        project: {
          deletedAt: null,
        },
      });
    }

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

    if (includeArchived || onlyArchived || hasArchivedPeriod) {
      return withArchiveContext("TASK", tasks);
    }

    return tasks;
  }

  async findById(
    taskId: string,
    user: CurrentUser,
    filters: { includeArchived?: boolean } = {},
  ) {
    const { includeArchived } = this.resolveArchivedAccess(user, filters);
    await this.ensureCanView(taskId, user, includeArchived);

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

  async findByCode(
    taskCode: number,
    user: CurrentUser,
    filters: { includeArchived?: boolean } = {},
  ) {
    const { includeArchived } = this.resolveArchivedAccess(user, filters);
    await this.ensureCanViewByCode(taskCode, user, includeArchived);

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
      if (!permissionsService.hasPermission(user, "tasks.assign")) {
        throw new AppError("VocÃª nÃ£o tem permissÃ£o para alterar atribuiÃ§Ã£o de tarefas", 403);
      }

      resolvedAssigneeId = undefined;
    } else if (data.assigneeId || data.assigneeUserCode) {
      if (!permissionsService.hasPermission(user, "tasks.assign")) {
        throw new AppError("VocÃª nÃ£o tem permissÃ£o para alterar atribuiÃ§Ã£o de tarefas", 403);
      }

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

    if (taskAccess.archivedAt) {
      throw new AppError("Tarefa arquivada não pode ter status alterado", 409);
    }

    const canManage =
      permissionsService.hasPermission(user, "tasks.edit_all") ||
      (permissionsService.hasPermission(user, "tasks.edit_own") &&
        taskAccess.project.ownerId === user.id) ||
      taskAccess.project.members.some(
        (member) =>
          member.userId === user.id && permissionsService.hasPermission(user, "tasks.edit_own"),
      );

    const canCompleteOwn =
      taskAccess.assigneeId === user.id && permissionsService.hasPermission(user, "tasks.complete");

    if (data.status === "CONCLUIDA" && !canManage && !canCompleteOwn) {
      throw new AppError("Você não tem permissão para concluir esta tarefa", 403);
    }

    if (data.status !== "CONCLUIDA" && !canManage && !canCompleteOwn) {
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
    if (!permissionsService.hasPermission(user, "tasks.archive")) {
      throw new AppError("Você não tem permissão para arquivar esta tarefa", 403);
    }

    const before = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskCode: true,
        title: true,
        status: true,
        priority: true,
        projectId: true,
        assigneeId: true,
        dueDate: true,
        archivedAt: true,
        deletedAt: true,
      },
    });

    if (!before || before.deletedAt) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    if (before.archivedAt) {
      throw new AppError("Tarefa já está arquivada", 409);
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        archivedAt: new Date(),
      },
      include: taskInclude,
    });

    await auditService.log({
      entityType: "TASK",
      entityId: before.id,
      action: "ARCHIVE",
      actor: this.getAuditActor(user),
      summary: `Tarefa TSK-${before.taskCode} arquivada`,
      before: this.buildTaskAuditSnapshot(before),
      after: this.buildTaskAuditSnapshot(task),
      metadata: {
        permissionUsed: "tasks.archive",
      },
    });

    return {
      message: "Tarefa arquivada com sucesso",
      permissionUsed: "tasks.archive" as const,
      task,
    };
  }

  async restore(taskId: string, user: CurrentUser, options: RestoreOptions = {}) {
    if (!permissionsService.hasPermission(user, "tasks.restore")) {
      throw new AppError("Você não tem permissão para restaurar esta tarefa", 403);
    }

    let before = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskCode: true,
        title: true,
        status: true,
        priority: true,
        projectId: true,
        assigneeId: true,
        dueDate: true,
        archivedAt: true,
        deletedAt: true,
        project: {
          select: {
            archivedAt: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!before || before.deletedAt) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    if (!before.archivedAt) {
      throw new AppError("Tarefa não está arquivada", 409);
    }

    if (before.project.deletedAt) {
      throw new AppError("Não é possível restaurar tarefa de projeto removido logicamente", 409);
    }

    if (before.project.archivedAt && options.cascade) {
      const { ProjectsService } = await import("../projects/projects.service.js");
      const projectsService = new ProjectsService();

      await projectsService.restore(before.projectId, user);

      before = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          taskCode: true,
          projectId: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          assigneeId: true,
          dueDate: true,
          archivedAt: true,
          deletedAt: true,
          project: {
            select: {
              archivedAt: true,
              deletedAt: true,
            },
          },
        },
      });
    }

    if (!before || before.project.deletedAt || before.project.archivedAt) {
      throw new AppError("Não é possível restaurar tarefa de projeto arquivado", 409);
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        archivedAt: null,
      },
      include: taskInclude,
    });

    await auditService.log({
      entityType: "TASK",
      entityId: before.id,
      action: "RESTORE",
      actor: this.getAuditActor(user),
      summary: `Tarefa TSK-${before.taskCode} restaurada`,
      before: this.buildTaskAuditSnapshot(before),
      after: this.buildTaskAuditSnapshot(task),
      metadata: {
        permissionUsed: "tasks.restore",
        cascade: Boolean(options.cascade),
      },
    });

    return {
      message: "Tarefa restaurada com sucesso",
      permissionUsed: "tasks.restore" as const,
      cascadeApplied: Boolean(options.cascade),
      task,
    };
  }
}
