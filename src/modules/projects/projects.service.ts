import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

type CreateProjectInput = {
  title: string;
  description?: string;
  status?: "PLANEJAMENTO" | "EM_ANDAMENTO" | "PAUSADO" | "CONCLUIDO" | "CANCELADO";
  startDate?: Date;
  endDate?: Date;
};

type UpdateProjectInput = {
  title?: string;
  description?: string;
  status?: "PLANEJAMENTO" | "EM_ANDAMENTO" | "PAUSADO" | "CONCLUIDO" | "CANCELADO";
  startDate?: Date;
  endDate?: Date;
};

type ListProjectsFilters = {
  code?: number;
  status?: "PLANEJAMENTO" | "EM_ANDAMENTO" | "PAUSADO" | "CONCLUIDO" | "CANCELADO";
  search?: string;
};

const projectInclude = {
  owner: {
    select: {
      id: true,
      userCode: true,
      name: true,
      email: true,
      role: true,
    },
  },
  _count: {
    select: {
      members: true,
      tasks: true,
    },
  },
} satisfies Prisma.ProjectInclude;

export class ProjectsService {
  private isPrivileged(role: string) {
    return role === "ADMIN" || role === "GESTOR";
  }

  private async getProjectAccessData(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        ownerId: true,
        members: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError("Projeto não encontrado", 404);
    }

    return project;
  }

  private async getProjectAccessDataByCode(projectCode: number) {
    const project = await prisma.project.findUnique({
      where: { projectCode },
      select: {
        id: true,
        projectCode: true,
        ownerId: true,
        members: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
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

  private async ensureCanViewByCode(projectCode: number, user: CurrentUser) {
    const project = await this.getProjectAccessDataByCode(projectCode);

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

    if (this.isPrivileged(user.role) || project.ownerId === user.id) {
      return project;
    }

    throw new AppError("Você não tem permissão para alterar este projeto", 403);
  }

  async create(data: CreateProjectInput, user: CurrentUser) {
    const project = await prisma.project.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status ?? "PLANEJAMENTO",
        startDate: data.startDate,
        endDate: data.endDate,
        ownerId: user.id,
      },
      include: projectInclude,
    });

    return project;
  }

  async list(filters: ListProjectsFilters, user: CurrentUser) {
    const andConditions: Prisma.ProjectWhereInput[] = [];

    if (!this.isPrivileged(user.role)) {
      andConditions.push({
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      });
    }

    if (filters.code) {
      andConditions.push({
        projectCode: filters.code,
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

    const where: Prisma.ProjectWhereInput | undefined =
      andConditions.length > 0 ? { AND: andConditions } : undefined;

    const projects = await prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: {
        projectCode: "asc",
      },
    });

    return projects;
  }

  async findById(projectId: string, user: CurrentUser) {
    await this.ensureCanView(projectId, user);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: {
          select: {
            id: true,
            userCode: true,
            name: true,
            email: true,
            role: true,
          },
        },
        members: {
          select: {
            id: true,
            role: true,
            user: {
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
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            assignee: {
              select: {
                id: true,
                userCode: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError("Projeto não encontrado", 404);
    }

    return project;
  }

  async findByCode(projectCode: number, user: CurrentUser) {
    await this.ensureCanViewByCode(projectCode, user);

    const project = await prisma.project.findUnique({
      where: { projectCode },
      include: {
        owner: {
          select: {
            id: true,
            userCode: true,
            name: true,
            email: true,
            role: true,
          },
        },
        members: {
          select: {
            id: true,
            role: true,
            user: {
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
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            assignee: {
              select: {
                id: true,
                userCode: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError("Projeto não encontrado", 404);
    }

    return project;
  }

  async update(projectId: string, data: UpdateProjectInput, user: CurrentUser) {
    await this.ensureCanManage(projectId, user);

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.endDate !== undefined && { endDate: data.endDate }),
      },
      include: projectInclude,
    });

    return project;
  }

  async remove(projectId: string, user: CurrentUser) {
    const project = await this.ensureCanManage(projectId, user);

    if (project._count.members > 0 || project._count.tasks > 0) {
      throw new AppError(
        "Não é possível excluir um projeto que já possui membros ou tarefas vinculadas",
        409
      );
    }

    await prisma.project.delete({
      where: { id: projectId },
    });

    return {
      message: "Projeto excluído com sucesso",
    };
  }
}