import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
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
  private getAllowedNextStages(
  currentStage: ProjectStageValue
): ProjectStageValue[] {
  switch (currentStage) {
    case "ESTIMATIVA_PRECO":
      return ["AGUARDANDO_NOTA_CREDITO", "CANCELADO"];

    case "AGUARDANDO_NOTA_CREDITO":
      return ["DIEX_REQUISITORIO", "CANCELADO"];

    case "DIEX_REQUISITORIO":
      return ["AGUARDANDO_NOTA_EMPENHO", "CANCELADO"];

    case "AGUARDANDO_NOTA_EMPENHO":
      return ["OS_LIBERADA", "CANCELADO"];

    case "OS_LIBERADA":
      return ["SERVICO_EM_EXECUCAO", "CANCELADO"];

    case "SERVICO_EM_EXECUCAO":
      return ["ANALISANDO_AS_BUILT", "CANCELADO"];

    case "ANALISANDO_AS_BUILT":
      return ["ATESTAR_NF", "CANCELADO"];

    case "ATESTAR_NF":
      return ["SERVICO_CONCLUIDO", "CANCELADO"];

    case "SERVICO_CONCLUIDO":
      return [];

    case "CANCELADO":
      return [];

    default:
      return [];
  }
  }

  private assertStageTransition(
    currentStage: ProjectStageValue,
    nextStage: ProjectStageValue
  ) {
    if (currentStage === nextStage) {
      return;
    }

    const allowedNextStages = this.getAllowedNextStages(currentStage);

    if (!allowedNextStages.includes(nextStage)) {
      throw new AppError(
        `Transição inválida: o projeto está em ${currentStage} e só pode avançar para ${allowedNextStages.join(", ") || "nenhuma etapa"}`,
        409
      );
    }
  }

  private isPrivileged(role: string) {
    return role === "ADMIN" || role === "GESTOR";
  }

  private getMacroStatusFromStage(
    stage: ProjectStageValue
  ): "PLANEJAMENTO" | "EM_ANDAMENTO" | "PAUSADO" | "CONCLUIDO" | "CANCELADO" {
    if (stage === "SERVICO_CONCLUIDO") {
      return "CONCLUIDO";
    }

    if (stage === "CANCELADO") {
      return "CANCELADO";
    }

    if (
      stage === "OS_LIBERADA" ||
      stage === "SERVICO_EM_EXECUCAO" ||
      stage === "ANALISANDO_AS_BUILT" ||
      stage === "ATESTAR_NF"
    ) {
      return "EM_ANDAMENTO";
    }

    return "PLANEJAMENTO";
  }

  private isStageAtOrBeyond(stage: ProjectStageValue, checkpoint: ProjectStageValue) {
    const order: ProjectStageValue[] = [
      "ESTIMATIVA_PRECO",
      "AGUARDANDO_NOTA_CREDITO",
      "DIEX_REQUISITORIO",
      "AGUARDANDO_NOTA_EMPENHO",
      "OS_LIBERADA",
      "SERVICO_EM_EXECUCAO",
      "ANALISANDO_AS_BUILT",
      "ATESTAR_NF",
      "SERVICO_CONCLUIDO",
      "CANCELADO",
    ];

    return order.indexOf(stage) >= order.indexOf(checkpoint);
  }

  private validateStageRequirements(
    stage: ProjectStageValue,
    snapshot: {
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
    },
    finalizedEstimateCount: number
  ) {
    if (
      stage !== "ESTIMATIVA_PRECO" &&
      stage !== "CANCELADO" &&
      finalizedEstimateCount === 0
    ) {
      throw new AppError(
        "Para avançar o fluxo, o projeto precisa ter pelo menos uma estimativa finalizada",
        409
      );
    }

    if (this.isStageAtOrBeyond(stage, "DIEX_REQUISITORIO")) {
      if (!snapshot.creditNoteNumber && !snapshot.creditNoteReceivedAt) {
        throw new AppError(
          "Para avançar até DIEx Requisitório, informe o número ou a data de recebimento da Nota de Crédito",
          409
        );
      }

      if (!snapshot.diexNumber && !snapshot.diexIssuedAt) {
        throw new AppError(
          "Para avançar até DIEx Requisitório, informe o número ou a data do DIEx",
          409
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "OS_LIBERADA")) {
      if (!snapshot.commitmentNoteNumber && !snapshot.commitmentNoteReceivedAt) {
        throw new AppError(
          "Para liberar a OS, informe o número ou a data da Nota/Empenho",
          409
        );
      }

      if (!snapshot.serviceOrderNumber && !snapshot.serviceOrderIssuedAt) {
        throw new AppError(
          "Para liberar a OS, informe o número ou a data da Ordem de Serviço",
          409
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "SERVICO_EM_EXECUCAO")) {
      if (!snapshot.executionStartedAt) {
        throw new AppError(
          "Para colocar o serviço em execução, informe a data de início da execução",
          409
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "ANALISANDO_AS_BUILT")) {
      if (!snapshot.asBuiltReceivedAt) {
        throw new AppError(
          "Para entrar na etapa de análise do As-Built, informe a data de recebimento do As-Built",
          409
        );
      }
    }

    if (stage === "SERVICO_CONCLUIDO") {
      if (!snapshot.invoiceAttestedAt) {
        throw new AppError(
          "Para concluir o serviço, informe a data de atesto da NF",
          409
        );
      }

      if (!snapshot.serviceCompletedAt) {
        throw new AppError(
          "Para concluir o serviço, informe a data de conclusão do serviço",
          409
        );
      }
    }
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

  async updateFlow(projectId: string, data: UpdateProjectFlowInput, user: CurrentUser) {
    await this.ensureCanManage(projectId, user);

    const currentProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
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

    this.assertStageTransition(currentProject.stage, data.stage);
    this.validateStageRequirements(data.stage, nextSnapshot, finalizedEstimateCount);

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        stage: data.stage,
        status: this.getMacroStatusFromStage(data.stage),
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

    return project;
  }

  async remove(projectId: string, user: CurrentUser) {
    const project = await this.ensureCanManage(projectId, user);

    if (
      project._count.members > 0 ||
      project._count.tasks > 0 ||
      project._count.estimates > 0
    ) {
      throw new AppError(
        "Não é possível excluir um projeto que já possui membros, tarefas ou estimativas vinculadas",
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