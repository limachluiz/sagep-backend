import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { workflowService } from "../workflow/workflow.service.js";

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  rank?: string | null;
  cpf?: string | null;
};

type ProjectStageValue =
  | "ESTIMATIVA_PRECO"
  | "AGUARDANDO_NOTA_CREDITO"
  | "DIEX_REQUISITORIO"
  | "AGUARDANDO_NOTA_EMPENHO"
  | "OS_LIBERADA"
  | "SERVICO_EM_EXECUCAO"
  | "ANALISANDO_AS_BUILT"
  | "ATESTAR_NF"
  | "SERVICO_CONCLUIDO"
  | "CANCELADO";

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

type UpdateProjectFlowInput = {
  stage: ProjectStageValue;
  creditNoteNumber?: string;
  creditNoteReceivedAt?: Date;
  diexNumber?: string;
  diexIssuedAt?: Date;
  commitmentNoteNumber?: string;
  commitmentNoteReceivedAt?: Date;
  serviceOrderNumber?: string;
  serviceOrderIssuedAt?: Date;
  executionStartedAt?: Date;
  asBuiltReceivedAt?: Date;
  invoiceAttestedAt?: Date;
  serviceCompletedAt?: Date;
};

type ListProjectsFilters = {
  code?: number;
  status?: "PLANEJAMENTO" | "EM_ANDAMENTO" | "PAUSADO" | "CONCLUIDO" | "CANCELADO";
  stage?: ProjectStageValue;
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
      estimates: true,
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
        stage: true,
        members: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
            estimates: true,
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
        stage: true,
        members: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
            estimates: true,
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

  private getAuditActor(user: CurrentUser) {
    return {
      id: user.id,
      name: user.email,
    };
  }

  private buildProjectAuditSnapshot(project: {
    id: string;
    projectCode?: number | null;
    title?: string | null;
    description?: string | null;
    status?: string | null;
    stage?: ProjectStageValue | null;
    ownerId?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    creditNoteNumber?: string | null;
    creditNoteReceivedAt?: Date | null;
    diexNumber?: string | null;
    diexIssuedAt?: Date | null;
    commitmentNoteNumber?: string | null;
    commitmentNoteReceivedAt?: Date | null;
    serviceOrderNumber?: string | null;
    serviceOrderIssuedAt?: Date | null;
    executionStartedAt?: Date | null;
    asBuiltReceivedAt?: Date | null;
    invoiceAttestedAt?: Date | null;
    serviceCompletedAt?: Date | null;
  }) {
    return {
      id: project.id,
      projectCode: project.projectCode ?? null,
      title: project.title ?? null,
      description: project.description ?? null,
      status: project.status ?? null,
      stage: project.stage ?? null,
      ownerId: project.ownerId ?? null,
      startDate: project.startDate ?? null,
      endDate: project.endDate ?? null,
      creditNoteNumber: project.creditNoteNumber ?? null,
      creditNoteReceivedAt: project.creditNoteReceivedAt ?? null,
      diexNumber: project.diexNumber ?? null,
      diexIssuedAt: project.diexIssuedAt ?? null,
      commitmentNoteNumber: project.commitmentNoteNumber ?? null,
      commitmentNoteReceivedAt: project.commitmentNoteReceivedAt ?? null,
      serviceOrderNumber: project.serviceOrderNumber ?? null,
      serviceOrderIssuedAt: project.serviceOrderIssuedAt ?? null,
      executionStartedAt: project.executionStartedAt ?? null,
      asBuiltReceivedAt: project.asBuiltReceivedAt ?? null,
      invoiceAttestedAt: project.invoiceAttestedAt ?? null,
      serviceCompletedAt: project.serviceCompletedAt ?? null,
    };
  }

  private buildWorkflowSnapshot(project: {
    id: string;
    projectCode?: number | null;
    stage: ProjectStageValue;
    creditNoteNumber?: string | null;
    creditNoteReceivedAt?: Date | null;
    diexNumber?: string | null;
    diexIssuedAt?: Date | null;
    commitmentNoteNumber?: string | null;
    commitmentNoteReceivedAt?: Date | null;
    serviceOrderNumber?: string | null;
    serviceOrderIssuedAt?: Date | null;
    executionStartedAt?: Date | null;
    asBuiltReceivedAt?: Date | null;
    invoiceAttestedAt?: Date | null;
    serviceCompletedAt?: Date | null;
  }) {
    return {
      id: project.id,
      projectCode: project.projectCode ?? undefined,
      stage: project.stage,
      creditNoteNumber: project.creditNoteNumber ?? null,
      creditNoteReceivedAt: project.creditNoteReceivedAt ?? null,
      diexNumber: project.diexNumber ?? null,
      diexIssuedAt: project.diexIssuedAt ?? null,
      commitmentNoteNumber: project.commitmentNoteNumber ?? null,
      commitmentNoteReceivedAt: project.commitmentNoteReceivedAt ?? null,
      serviceOrderNumber: project.serviceOrderNumber ?? null,
      serviceOrderIssuedAt: project.serviceOrderIssuedAt ?? null,
      executionStartedAt: project.executionStartedAt ?? null,
      asBuiltReceivedAt: project.asBuiltReceivedAt ?? null,
      invoiceAttestedAt: project.invoiceAttestedAt ?? null,
      serviceCompletedAt: project.serviceCompletedAt ?? null,
    };
  }

  async create(data: CreateProjectInput, user: CurrentUser) {
    const project = await prisma.project.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status ?? "PLANEJAMENTO",
        stage: "ESTIMATIVA_PRECO",
        startDate: data.startDate,
        endDate: data.endDate,
        ownerId: user.id,
      },
      include: projectInclude,
    });

    await auditService.log({
      entityType: "PROJECT",
      entityId: project.id,
      action: "CREATE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${project.projectCode} criado`,
      after: this.buildProjectAuditSnapshot({
        id: project.id,
        projectCode: project.projectCode,
        title: project.title,
        description: project.description,
        status: project.status,
        stage: project.stage,
        ownerId: project.ownerId,
        startDate: project.startDate,
        endDate: project.endDate,
      }),
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

    if (filters.stage) {
      andConditions.push({
        stage: filters.stage,
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
            taskCode: true,
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
        estimates: {
          select: {
            id: true,
            estimateCode: true,
            status: true,
            destinationCityName: true,
            destinationStateUf: true,
            totalAmount: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
            estimates: true,
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
            taskCode: true,
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
        estimates: {
          select: {
            id: true,
            estimateCode: true,
            status: true,
            destinationCityName: true,
            destinationStateUf: true,
            totalAmount: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
            estimates: true,
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

    const before = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        title: true,
        description: true,
        status: true,
        stage: true,
        ownerId: true,
        startDate: true,
        endDate: true,
        creditNoteNumber: true,
        creditNoteReceivedAt: true,
        diexNumber: true,
        diexIssuedAt: true,
        commitmentNoteNumber: true,
        commitmentNoteReceivedAt: true,
        serviceOrderNumber: true,
        serviceOrderIssuedAt: true,
        executionStartedAt: true,
        asBuiltReceivedAt: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
      },
    });

    if (!before) {
      throw new AppError("Projeto não encontrado", 404);
    }

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

    await auditService.log({
      entityType: "PROJECT",
      entityId: project.id,
      action: "UPDATE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${project.projectCode} atualizado`,
      before: this.buildProjectAuditSnapshot(before),
      after: this.buildProjectAuditSnapshot({
        id: project.id,
        projectCode: project.projectCode,
        title: project.title,
        description: project.description,
        status: project.status,
        stage: project.stage,
        ownerId: project.ownerId,
        startDate: project.startDate,
        endDate: project.endDate,
        creditNoteNumber: project.creditNoteNumber,
        creditNoteReceivedAt: project.creditNoteReceivedAt,
        diexNumber: project.diexNumber,
        diexIssuedAt: project.diexIssuedAt,
        commitmentNoteNumber: project.commitmentNoteNumber,
        commitmentNoteReceivedAt: project.commitmentNoteReceivedAt,
        serviceOrderNumber: project.serviceOrderNumber,
        serviceOrderIssuedAt: project.serviceOrderIssuedAt,
        executionStartedAt: project.executionStartedAt,
        asBuiltReceivedAt: project.asBuiltReceivedAt,
        invoiceAttestedAt: project.invoiceAttestedAt,
        serviceCompletedAt: project.serviceCompletedAt,
      }),
    });

    return project;
  }
  
  async updateFlow(projectId: string, data: UpdateProjectFlowInput, user: CurrentUser) {
    await this.ensureCanManage(projectId, user);

    const currentProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        title: true,
        description: true,
        status: true,
        stage: true,
        ownerId: true,
        startDate: true,
        endDate: true,
        creditNoteNumber: true,
        creditNoteReceivedAt: true,
        diexNumber: true,
        diexIssuedAt: true,
        commitmentNoteNumber: true,
        commitmentNoteReceivedAt: true,
        serviceOrderNumber: true,
        serviceOrderIssuedAt: true,
        executionStartedAt: true,
        asBuiltReceivedAt: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
      },
    });

    if (!currentProject) {
      throw new AppError("Projeto não encontrado", 404);
    }

    const finalizedEstimateCount = await prisma.estimate.count({
      where: {
        projectId,
        status: "FINALIZADA",
      },
    });

    const nextSnapshot = {
      creditNoteNumber: data.creditNoteNumber ?? currentProject.creditNoteNumber,
      creditNoteReceivedAt: data.creditNoteReceivedAt ?? currentProject.creditNoteReceivedAt,
      diexNumber: data.diexNumber ?? currentProject.diexNumber,
      diexIssuedAt: data.diexIssuedAt ?? currentProject.diexIssuedAt,
      commitmentNoteNumber:
        data.commitmentNoteNumber ?? currentProject.commitmentNoteNumber,
      commitmentNoteReceivedAt:
        data.commitmentNoteReceivedAt ?? currentProject.commitmentNoteReceivedAt,
      serviceOrderNumber: data.serviceOrderNumber ?? currentProject.serviceOrderNumber,
      serviceOrderIssuedAt:
        data.serviceOrderIssuedAt ?? currentProject.serviceOrderIssuedAt,
      executionStartedAt: data.executionStartedAt ?? currentProject.executionStartedAt,
      asBuiltReceivedAt: data.asBuiltReceivedAt ?? currentProject.asBuiltReceivedAt,
      invoiceAttestedAt: data.invoiceAttestedAt ?? currentProject.invoiceAttestedAt,
      serviceCompletedAt: data.serviceCompletedAt ?? currentProject.serviceCompletedAt,
    };

    workflowService.assertStageTransition(currentProject.stage, data.stage);
    workflowService.validateStageRequirements(
      data.stage,
      this.buildWorkflowSnapshot({
        id: currentProject.id,
        projectCode: currentProject.projectCode,
        stage: data.stage,
        ...nextSnapshot,
      }),
      finalizedEstimateCount,
    );

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        stage: data.stage,
        status: workflowService.getMacroStatusFromStage(data.stage),
        ...(data.creditNoteNumber !== undefined && {
          creditNoteNumber: data.creditNoteNumber,
        }),
        ...(data.creditNoteReceivedAt !== undefined && {
          creditNoteReceivedAt: data.creditNoteReceivedAt,
        }),
        ...(data.diexNumber !== undefined && {
          diexNumber: data.diexNumber,
        }),
        ...(data.diexIssuedAt !== undefined && {
          diexIssuedAt: data.diexIssuedAt,
        }),
        ...(data.commitmentNoteNumber !== undefined && {
          commitmentNoteNumber: data.commitmentNoteNumber,
        }),
        ...(data.commitmentNoteReceivedAt !== undefined && {
          commitmentNoteReceivedAt: data.commitmentNoteReceivedAt,
        }),
        ...(data.serviceOrderNumber !== undefined && {
          serviceOrderNumber: data.serviceOrderNumber,
        }),
        ...(data.serviceOrderIssuedAt !== undefined && {
          serviceOrderIssuedAt: data.serviceOrderIssuedAt,
        }),
        ...(data.executionStartedAt !== undefined && {
          executionStartedAt: data.executionStartedAt,
        }),
        ...(data.asBuiltReceivedAt !== undefined && {
          asBuiltReceivedAt: data.asBuiltReceivedAt,
        }),
        ...(data.invoiceAttestedAt !== undefined && {
          invoiceAttestedAt: data.invoiceAttestedAt,
        }),
        ...(data.serviceCompletedAt !== undefined && {
          serviceCompletedAt: data.serviceCompletedAt,
        }),
      },
      include: projectInclude,
    });

    const beforeSnapshot = this.buildProjectAuditSnapshot(currentProject);
    const afterSnapshot = this.buildProjectAuditSnapshot({
      id: project.id,
      projectCode: project.projectCode,
      title: project.title,
      description: project.description,
      status: project.status,
      stage: project.stage,
      ownerId: project.ownerId,
      startDate: project.startDate,
      endDate: project.endDate,
      creditNoteNumber: project.creditNoteNumber,
      creditNoteReceivedAt: project.creditNoteReceivedAt,
      diexNumber: project.diexNumber,
      diexIssuedAt: project.diexIssuedAt,
      commitmentNoteNumber: project.commitmentNoteNumber,
      commitmentNoteReceivedAt: project.commitmentNoteReceivedAt,
      serviceOrderNumber: project.serviceOrderNumber,
      serviceOrderIssuedAt: project.serviceOrderIssuedAt,
      executionStartedAt: project.executionStartedAt,
      asBuiltReceivedAt: project.asBuiltReceivedAt,
      invoiceAttestedAt: project.invoiceAttestedAt,
      serviceCompletedAt: project.serviceCompletedAt,
    });

    await auditService.log({
      entityType: "PROJECT",
      entityId: project.id,
      action: currentProject.stage !== project.stage ? "STAGE_CHANGE" : "UPDATE",
      actor: this.getAuditActor(user),
      summary:
        currentProject.stage !== project.stage
          ? `Projeto PRJ-${project.projectCode} avançou de ${currentProject.stage} para ${project.stage}`
          : `Fluxo do projeto PRJ-${project.projectCode} atualizado`,
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: {
        previousStage: currentProject.stage,
        newStage: project.stage,
        nextActionCode: workflowService.getNextAction(
          this.buildWorkflowSnapshot({
            id: project.id,
            projectCode: project.projectCode,
            stage: project.stage,
            creditNoteNumber: project.creditNoteNumber,
            creditNoteReceivedAt: project.creditNoteReceivedAt,
            diexNumber: project.diexNumber,
            diexIssuedAt: project.diexIssuedAt,
            commitmentNoteNumber: project.commitmentNoteNumber,
            commitmentNoteReceivedAt: project.commitmentNoteReceivedAt,
            serviceOrderNumber: project.serviceOrderNumber,
            serviceOrderIssuedAt: project.serviceOrderIssuedAt,
            executionStartedAt: project.executionStartedAt,
            asBuiltReceivedAt: project.asBuiltReceivedAt,
            invoiceAttestedAt: project.invoiceAttestedAt,
            serviceCompletedAt: project.serviceCompletedAt,
          }),
        ).code,
      },
    });

    return project;
  }

  async remove(projectId: string, user: CurrentUser) {
    const projectAccess = await this.ensureCanManage(projectId, user);

    if (
      projectAccess._count.members > 0 ||
      projectAccess._count.tasks > 0 ||
      projectAccess._count.estimates > 0
    ) {
      throw new AppError(
        "Não é possível excluir um projeto que já possui membros, tarefas ou estimativas vinculadas",
        409,
      );
    }

    const before = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        title: true,
        description: true,
        status: true,
        stage: true,
        ownerId: true,
        startDate: true,
        endDate: true,
        creditNoteNumber: true,
        creditNoteReceivedAt: true,
        diexNumber: true,
        diexIssuedAt: true,
        commitmentNoteNumber: true,
        commitmentNoteReceivedAt: true,
        serviceOrderNumber: true,
        serviceOrderIssuedAt: true,
        executionStartedAt: true,
        asBuiltReceivedAt: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
      },
    });

    if (!before) {
      throw new AppError("Projeto não encontrado", 404);
    }

    await auditService.log({
      entityType: "PROJECT",
      entityId: before.id,
      action: "DELETE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${before.projectCode} excluído`,
      before: this.buildProjectAuditSnapshot(before),
    });

    await prisma.project.delete({
      where: { id: projectId },
    });

    return {
      message: "Projeto excluído com sucesso",
    };
  }

    async getTimeline(projectId: string, user: CurrentUser) {
    await this.ensureCanView(projectId, user);

    return auditService.listTimeline("PROJECT", projectId);
  }

  async getNextAction(projectId: string, user: CurrentUser) {
    await this.ensureCanView(projectId, user);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        stage: true,
        creditNoteNumber: true,
        creditNoteReceivedAt: true,
        diexNumber: true,
        diexIssuedAt: true,
        commitmentNoteNumber: true,
        commitmentNoteReceivedAt: true,
        serviceOrderNumber: true,
        serviceOrderIssuedAt: true,
        executionStartedAt: true,
        asBuiltReceivedAt: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
      },
    });

    if (!project) {
      throw new AppError("Projeto não encontrado", 404);
    }

    return workflowService.getNextAction(
      this.buildWorkflowSnapshot({
        id: project.id,
        projectCode: project.projectCode,
        stage: project.stage,
        creditNoteNumber: project.creditNoteNumber,
        creditNoteReceivedAt: project.creditNoteReceivedAt,
        diexNumber: project.diexNumber,
        diexIssuedAt: project.diexIssuedAt,
        commitmentNoteNumber: project.commitmentNoteNumber,
        commitmentNoteReceivedAt: project.commitmentNoteReceivedAt,
        serviceOrderNumber: project.serviceOrderNumber,
        serviceOrderIssuedAt: project.serviceOrderIssuedAt,
        executionStartedAt: project.executionStartedAt,
        asBuiltReceivedAt: project.asBuiltReceivedAt,
        invoiceAttestedAt: project.invoiceAttestedAt,
        serviceCompletedAt: project.serviceCompletedAt,
      }),
    );
  }
}
