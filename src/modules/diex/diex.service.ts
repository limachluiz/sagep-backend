import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { workflowService } from "../workflow/workflow.service.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
  name?: string;
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

type CreateDiexInput = {
  projectId?: string;
  projectCode?: number;
  estimateId?: string;
  estimateCode?: number;
  diexNumber?: string;
  issuedAt?: Date;
  supplierCnpj: string;
  requesterName: string;
  requesterRank: string;
  requesterCpf?: string;
  requesterRole?: string;
  issuingOrganization?: string;
  commandName?: string;
  pregaoNumber?: string;
  uasg?: string;
  notes?: string;
};

type UpdateDiexInput = {
  diexNumber?: string;
  issuedAt?: Date;
  supplierCnpj?: string;
  requesterName?: string;
  requesterRank?: string;
  requesterRole?: string;
  requesterCpf?: string;
  issuingOrganization?: string;
  commandName?: string;
  pregaoNumber?: string;
  uasg?: string;
  notes?: string;
};

type ListDiexFilters = {
  code?: number;
  projectCode?: number;
  estimateCode?: number;
  search?: string;
};

const diexInclude = {
  project: {
    select: {
      id: true,
      projectCode: true,
      title: true,
      stage: true,
      status: true,
    },
  },
  estimate: {
    select: {
      id: true,
      estimateCode: true,
      status: true,
      omName: true,
      destinationCityName: true,
      destinationStateUf: true,
      totalAmount: true,
      om: {
        select: {
          id: true,
          omCode: true,
          sigla: true,
          name: true,
          cityName: true,
          stateUf: true,
        },
      },
      ata: {
        select: {
          id: true,
          ataCode: true,
          number: true,
          type: true,
          vendorName: true,
        },
      },
    },
  },
  items: {
    select: {
      id: true,
      diexItemCode: true,
      itemCode: true,
      description: true,
      supplyUnit: true,
      quantityRequested: true,
      unitPrice: true,
      totalPrice: true,
      notes: true,
      estimateItem: {
        select: {
          id: true,
          estimateItemCode: true,
        },
      },
    },
    orderBy: {
      diexItemCode: "asc",
    },
  },
} satisfies Prisma.DiexRequestInclude;

export class DiexService {
  private isPrivileged(role: string) {
    return role === "ADMIN" || role === "GESTOR";
  }

  private stageOrder: ProjectStageValue[] = [
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

  private assertProjectStageAllowsDiexCreation(stage: ProjectStageValue) {
    const allowedStages: ProjectStageValue[] = [
      "AGUARDANDO_NOTA_CREDITO",
      "DIEX_REQUISITORIO",
    ];

    if (!allowedStages.includes(stage)) {
      throw new AppError(
        "O DIEx só pode ser criado quando o projeto estiver em AGUARDANDO_NOTA_CREDITO ou DIEX_REQUISITORIO",
        409
      );
    }
  }

  private isStageBefore(current: ProjectStageValue, target: ProjectStageValue) {
    return this.stageOrder.indexOf(current) < this.stageOrder.indexOf(target);
  }

  private async resolveProject(projectId?: string, projectCode?: number) {
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          projectCode: true,
          title: true,
          ownerId: true,
          stage: true,
          creditNoteNumber: true,
          creditNoteReceivedAt: true,
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

      if (projectCode && project.projectCode !== projectCode) {
        throw new AppError("projectId e projectCode não correspondem ao mesmo projeto", 400);
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
          stage: true,
          creditNoteNumber: true,
          creditNoteReceivedAt: true,
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

  private async resolveEstimate(estimateId?: string, estimateCode?: number) {
    if (estimateId) {
      const estimate = await prisma.estimate.findUnique({
        where: { id: estimateId },
        select: {
          id: true,
          estimateCode: true,
          projectId: true,
          status: true,
          totalAmount: true,
          items: {
            select: {
              id: true,
              estimateItemCode: true,
              referenceCode: true,
              description: true,
              unit: true,
              quantity: true,
              unitPrice: true,
              subtotal: true,
              notes: true,
            },
            orderBy: {
              estimateItemCode: "asc",
            },
          },
          ata: {
            select: {
              vendorName: true,
            },
          },
        },
      });

      if (!estimate) {
        throw new AppError("Estimativa não encontrada", 404);
      }

      if (estimateCode && estimate.estimateCode !== estimateCode) {
        throw new AppError("estimateId e estimateCode não correspondem à mesma estimativa", 400);
      }

      return estimate;
    }

    if (estimateCode) {
      const estimate = await prisma.estimate.findUnique({
        where: { estimateCode },
        select: {
          id: true,
          estimateCode: true,
          projectId: true,
          status: true,
          totalAmount: true,
          items: {
            select: {
              id: true,
              estimateItemCode: true,
              referenceCode: true,
              description: true,
              unit: true,
              quantity: true,
              unitPrice: true,
              subtotal: true,
              notes: true,
            },
            orderBy: {
              estimateItemCode: "asc",
            },
          },
          ata: {
            select: {
              vendorName: true,
            },
          },
        },
      });

      if (!estimate) {
        throw new AppError("Estimativa não encontrada", 404);
      }

      return estimate;
    }

    throw new AppError("Estimativa não informada", 400);
  }

  private canManageProject(
    project: { ownerId: string; members: { userId: string }[] },
    user: CurrentUser
  ) {
    if (this.isPrivileged(user.role)) {
      return true;
    }

    if (project.ownerId === user.id) {
      return true;
    }

    const isMember = project.members.some((member) => member.userId === user.id);

    return isMember && user.role !== "CONSULTA";
  }

  private canViewProject(
    project: { ownerId: string; members: { userId: string }[] },
    user: CurrentUser
  ) {
    if (this.isPrivileged(user.role)) {
      return true;
    }

    if (project.ownerId === user.id) {
      return true;
    }

    return project.members.some((member) => member.userId === user.id);
  }

  private async getDiexAccessData(diexId: string) {
    const diex = await prisma.diexRequest.findUnique({
      where: { id: diexId },
      select: {
        id: true,
        diexCode: true,
        project: {
          select: {
            id: true,
            ownerId: true,
            stage: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!diex) {
      throw new AppError("DIEx não encontrado", 404);
    }

    return diex;
  }

  private async getDiexAccessDataByCode(diexCode: number) {
    const diex = await prisma.diexRequest.findUnique({
      where: { diexCode },
      select: {
        id: true,
        diexCode: true,
        project: {
          select: {
            id: true,
            ownerId: true,
            stage: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!diex) {
      throw new AppError("DIEx não encontrado", 404);
    }

    return diex;
  }

  private async ensureCanView(diexId: string, user: CurrentUser) {
    const diex = await this.getDiexAccessData(diexId);

    if (!this.canViewProject(diex.project, user)) {
      throw new AppError("Você não tem acesso a este DIEx", 403);
    }

    return diex;
  }

  private async ensureCanManage(diexId: string, user: CurrentUser) {
    const diex = await this.getDiexAccessData(diexId);

    if (!this.canManageProject(diex.project, user)) {
      throw new AppError("Você não tem permissão para gerenciar este DIEx", 403);
    }

    return diex;
  }

  private resolveRequesterData(
  payload: {
    requesterName?: string;
    requesterRank?: string;
    requesterCpf?: string;
  },
  user: CurrentUser
) {
  const requesterName = payload.requesterName?.trim() || user.name?.trim();
  const requesterRank = payload.requesterRank?.trim() || user.rank?.trim();
  const requesterCpf = payload.requesterCpf?.trim() || user.cpf?.trim();

  if (!requesterName) {
    throw new AppError("Nome do requisitante não informado", 409);
  }

  if (!requesterRank) {
    throw new AppError(
      "Posto/patente do requisitante não informado nem no payload nem no usuário logado",
      409
    );
  }

  if (!requesterCpf) {
    throw new AppError(
      "CPF do requisitante não informado nem no payload nem no usuário logado",
      409
    );
  }

  return {
    requesterName,
    requesterRank,
    requesterCpf,
  };
}

  private getAuditActor(user: CurrentUser) {
    return {
      id: user.id,
      name: user.name ?? user.email,
    };
  }

  private buildDiexAuditSnapshot(diex: {
    id: string;
    diexCode?: number | null;
    projectId?: string | null;
    estimateId?: string | null;
    diexNumber?: string | null;
    issuedAt?: Date | null;
    issuingOrganization?: string | null;
    commandName?: string | null;
    pregaoNumber?: string | null;
    uasg?: string | null;
    supplierName?: string | null;
    supplierCnpj?: string | null;
    requesterName?: string | null;
    requesterRank?: string | null;
    requesterCpf?: string | null;
    requesterRole?: string | null;
    notes?: string | null;
    totalAmount?: { toString(): string } | string | number | null;
  }) {
    return {
      id: diex.id,
      diexCode: diex.diexCode ?? null,
      projectId: diex.projectId ?? null,
      estimateId: diex.estimateId ?? null,
      diexNumber: diex.diexNumber ?? null,
      issuedAt: diex.issuedAt ?? null,
      issuingOrganization: diex.issuingOrganization ?? null,
      commandName: diex.commandName ?? null,
      pregaoNumber: diex.pregaoNumber ?? null,
      uasg: diex.uasg ?? null,
      supplierName: diex.supplierName ?? null,
      supplierCnpj: diex.supplierCnpj ?? null,
      requesterName: diex.requesterName ?? null,
      requesterRank: diex.requesterRank ?? null,
      requesterCpf: diex.requesterCpf ?? null,
      requesterRole: diex.requesterRole ?? null,
      notes: diex.notes ?? null,
      totalAmount:
        diex.totalAmount && typeof diex.totalAmount === "object" && "toString" in diex.totalAmount
          ? diex.totalAmount.toString()
          : diex.totalAmount ?? null,
    };
  }

  private buildProjectAuditSnapshot(project: {
    id: string;
    projectCode?: number | null;
    stage?: ProjectStageValue | null;
    status?: string | null;
    diexNumber?: string | null;
    diexIssuedAt?: Date | null;
  }) {
    return {
      id: project.id,
      projectCode: project.projectCode ?? null,
      stage: project.stage ?? null,
      status: project.status ?? null,
      diexNumber: project.diexNumber ?? null,
      diexIssuedAt: project.diexIssuedAt ?? null,
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

  async create(data: CreateDiexInput, user: CurrentUser) {
    const project = await this.resolveProject(data.projectId, data.projectCode);

    this.assertProjectStageAllowsDiexCreation(project.stage);

    if (!this.canManageProject(project, user)) {
      throw new AppError("Você não tem permissão para criar DIEx neste projeto", 403);
    }

    const estimate = await this.resolveEstimate(data.estimateId, data.estimateCode);

    if (estimate.projectId !== project.id) {
      throw new AppError("A estimativa informada não pertence ao projeto selecionado", 409);
    }

    if (estimate.status !== "FINALIZADA") {
      throw new AppError("Só é possível gerar DIEx a partir de uma estimativa finalizada", 409);
    }

    if (!project.creditNoteNumber && !project.creditNoteReceivedAt) {
      throw new AppError(
        "Para gerar o DIEx, o projeto precisa ter Nota de Crédito informada",
        409,
      );
    }

    const requester = this.resolveRequesterData(
      {
        requesterName: data.requesterName,
        requesterRank: data.requesterRank,
        requesterCpf: data.requesterCpf,
      },
      user,
    );

    const existingDiex = await prisma.diexRequest.findFirst({
      where: { estimateId: estimate.id },
      select: { id: true },
    });

    if (existingDiex) {
      throw new AppError("Já existe um DIEx vinculado a esta estimativa", 409);
    }

    const diex = await prisma.diexRequest.create({
      data: {
        projectId: project.id,
        estimateId: estimate.id,
        diexNumber: data.diexNumber?.trim(),
        issuedAt: data.issuedAt,
        issuingOrganization: data.issuingOrganization?.trim() || "4º CTA",
        commandName: data.commandName?.trim() || "COMANDO MILITAR DA AMAZÔNIA",
        pregaoNumber: data.pregaoNumber?.trim() || "04/2025",
        uasg: data.uasg?.trim() || "160016",
        supplierName: estimate.ata.vendorName,
        supplierCnpj: data.supplierCnpj.trim(),
        requesterName: requester.requesterName,
        requesterRank: requester.requesterRank,
        requesterCpf: requester.requesterCpf,
        requesterRole: data.requesterRole?.trim() || "Requisitante",
        notes: data.notes?.trim(),
        totalAmount: estimate.totalAmount,
        items: {
          create: estimate.items.map((item) => ({
            estimateItemId: item.id,
            itemCode: item.referenceCode,
            description: item.description,
            supplyUnit: item.unit,
            quantityRequested: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.subtotal,
            notes: item.notes,
          })),
        },
      },
      include: diexInclude,
    });

    const projectUpdateData: Prisma.ProjectUpdateInput = {
      ...(project.stage === "AGUARDANDO_NOTA_CREDITO"
        ? {
            stage: "DIEX_REQUISITORIO",
            status: "PLANEJAMENTO",
          }
        : {}),
      ...(diex.diexNumber !== null && diex.diexNumber !== undefined
        ? { diexNumber: diex.diexNumber }
        : {}),
      ...(diex.issuedAt !== null && diex.issuedAt !== undefined
        ? { diexIssuedAt: diex.issuedAt }
        : {}),
    };

    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: projectUpdateData,
      select: {
        id: true,
        projectCode: true,
        stage: true,
        status: true,
        diexNumber: true,
        diexIssuedAt: true,
        creditNoteNumber: true,
        creditNoteReceivedAt: true,
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

    await auditService.log({
      entityType: "DIEX_REQUEST",
      entityId: diex.id,
      action: "CREATE",
      actor: this.getAuditActor(user),
      summary: `DIEx ${diex.diexNumber ?? `#${diex.diexCode}`} criado para o projeto PRJ-${project.projectCode}`,
      after: this.buildDiexAuditSnapshot({
        id: diex.id,
        diexCode: diex.diexCode,
        projectId: diex.projectId,
        estimateId: diex.estimateId,
        diexNumber: diex.diexNumber,
        issuedAt: diex.issuedAt,
        issuingOrganization: diex.issuingOrganization,
        commandName: diex.commandName,
        pregaoNumber: diex.pregaoNumber,
        uasg: diex.uasg,
        supplierName: diex.supplierName,
        supplierCnpj: diex.supplierCnpj,
        requesterName: diex.requesterName,
        requesterRank: diex.requesterRank,
        requesterCpf: diex.requesterCpf,
        requesterRole: diex.requesterRole,
        notes: diex.notes,
        totalAmount: diex.totalAmount,
      }),
    });

    await auditService.log({
      entityType: "PROJECT",
      entityId: project.id,
      action: "STAGE_CHANGE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${project.projectCode} atualizado após criação do DIEx`,
      before: this.buildProjectAuditSnapshot({
        id: project.id,
        projectCode: project.projectCode,
        stage: project.stage,
        status: "PLANEJAMENTO",
        diexNumber: null,
        diexIssuedAt: null,
      }),
      after: this.buildProjectAuditSnapshot(updatedProject),
      metadata: {
        source: "diex.create",
        previousStage: project.stage,
        newStage: updatedProject.stage,
        nextActionCode: workflowService.getNextAction(
          this.buildWorkflowSnapshot(updatedProject),
        ).code,
      },
    });

    return prisma.diexRequest.findUniqueOrThrow({
      where: { id: diex.id },
      include: diexInclude,
    });
  }

  async list(filters: ListDiexFilters, user: CurrentUser) {
    const andConditions: Prisma.DiexRequestWhereInput[] = [];

    if (!this.isPrivileged(user.role)) {
      andConditions.push({
        OR: [
          { project: { ownerId: user.id } },
          { project: { members: { some: { userId: user.id } } } },
        ],
      });
    }

    if (filters.code) {
      andConditions.push({ diexCode: filters.code });
    }

    if (filters.projectCode) {
      andConditions.push({
        project: {
          projectCode: filters.projectCode,
        },
      });
    }

    if (filters.estimateCode) {
      andConditions.push({
        estimate: {
          estimateCode: filters.estimateCode,
        },
      });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          {
            diexNumber: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            supplierName: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            supplierCnpj: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            requesterName: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        ],
      });
    }

    const where: Prisma.DiexRequestWhereInput | undefined =
      andConditions.length > 0 ? { AND: andConditions } : undefined;

    return prisma.diexRequest.findMany({
      where,
      include: diexInclude,
      orderBy: {
        diexCode: "asc",
      },
    });
  }

  async findById(diexId: string, user: CurrentUser) {
    await this.ensureCanView(diexId, user);

    const diex = await prisma.diexRequest.findUnique({
      where: { id: diexId },
      include: diexInclude,
    });

    if (!diex) {
      throw new AppError("DIEx não encontrado", 404);
    }

    return diex;
  }

  async findByCode(diexCode: number, user: CurrentUser) {
    const accessData = await this.getDiexAccessDataByCode(diexCode);

    if (!this.canViewProject(accessData.project, user)) {
      throw new AppError("Você não tem acesso a este DIEx", 403);
    }

    const diex = await prisma.diexRequest.findUnique({
      where: { diexCode },
      include: diexInclude,
    });

    if (!diex) {
      throw new AppError("DIEx não encontrado", 404);
    }

    return diex;
  }

  async update(diexId: string, data: UpdateDiexInput, user: CurrentUser) {
    await this.ensureCanManage(diexId, user);

    const before = await prisma.diexRequest.findUnique({
      where: { id: diexId },
      select: {
        id: true,
        diexCode: true,
        projectId: true,
        estimateId: true,
        diexNumber: true,
        issuedAt: true,
        issuingOrganization: true,
        commandName: true,
        pregaoNumber: true,
        uasg: true,
        supplierName: true,
        supplierCnpj: true,
        requesterName: true,
        requesterRank: true,
        requesterCpf: true,
        requesterRole: true,
        notes: true,
        totalAmount: true,
        project: {
          select: {
            id: true,
            projectCode: true,
            stage: true,
            status: true,
            diexNumber: true,
            diexIssuedAt: true,
            creditNoteNumber: true,
            creditNoteReceivedAt: true,
            commitmentNoteNumber: true,
            commitmentNoteReceivedAt: true,
            serviceOrderNumber: true,
            serviceOrderIssuedAt: true,
            executionStartedAt: true,
            asBuiltReceivedAt: true,
            invoiceAttestedAt: true,
            serviceCompletedAt: true,
          },
        },
      },
    });

    if (!before) {
      throw new AppError("DIEx não encontrado", 404);
    }

    const diex = await prisma.diexRequest.update({
      where: { id: diexId },
      data: {
        ...(data.diexNumber !== undefined && { diexNumber: data.diexNumber.trim() }),
        ...(data.issuedAt !== undefined && { issuedAt: data.issuedAt }),
        ...(data.supplierCnpj !== undefined && { supplierCnpj: data.supplierCnpj.trim() }),
        ...(data.requesterName !== undefined && { requesterName: data.requesterName.trim() }),
        ...(data.requesterRank !== undefined && { requesterRank: data.requesterRank.trim() }),
        ...(data.requesterRole !== undefined && { requesterRole: data.requesterRole?.trim() }),
        ...(data.requesterCpf !== undefined && { requesterCpf: data.requesterCpf.trim() }),
        ...(data.issuingOrganization !== undefined && {
          issuingOrganization: data.issuingOrganization?.trim(),
        }),
        ...(data.commandName !== undefined && { commandName: data.commandName?.trim() }),
        ...(data.pregaoNumber !== undefined && { pregaoNumber: data.pregaoNumber?.trim() }),
        ...(data.uasg !== undefined && { uasg: data.uasg?.trim() }),
        ...(data.notes !== undefined && { notes: data.notes?.trim() }),
      },
      include: diexInclude,
    });

    const updatedProject = await prisma.project.update({
      where: { id: diex.project.id },
      data: {
        ...(diex.diexNumber !== null && diex.diexNumber !== undefined
          ? { diexNumber: diex.diexNumber }
          : {}),
        ...(diex.issuedAt !== null && diex.issuedAt !== undefined
          ? { diexIssuedAt: diex.issuedAt }
          : {}),
      },
      select: {
        id: true,
        projectCode: true,
        stage: true,
        status: true,
        diexNumber: true,
        diexIssuedAt: true,
        creditNoteNumber: true,
        creditNoteReceivedAt: true,
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

    await auditService.log({
      entityType: "DIEX_REQUEST",
      entityId: diex.id,
      action: "UPDATE",
      actor: this.getAuditActor(user),
      summary: `DIEx ${diex.diexNumber ?? `#${diex.diexCode}`} atualizado`,
      before: this.buildDiexAuditSnapshot(before),
      after: this.buildDiexAuditSnapshot({
        id: diex.id,
        diexCode: diex.diexCode,
        projectId: diex.projectId,
        estimateId: diex.estimateId,
        diexNumber: diex.diexNumber,
        issuedAt: diex.issuedAt,
        issuingOrganization: diex.issuingOrganization,
        commandName: diex.commandName,
        pregaoNumber: diex.pregaoNumber,
        uasg: diex.uasg,
        supplierName: diex.supplierName,
        supplierCnpj: diex.supplierCnpj,
        requesterName: diex.requesterName,
        requesterRank: diex.requesterRank,
        requesterCpf: diex.requesterCpf,
        requesterRole: diex.requesterRole,
        notes: diex.notes,
        totalAmount: diex.totalAmount,
      }),
    });

    await auditService.log({
      entityType: "PROJECT",
      entityId: diex.project.id,
      action: "UPDATE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${updatedProject.projectCode} sincronizado após atualização do DIEx`,
      before: this.buildProjectAuditSnapshot(before.project),
      after: this.buildProjectAuditSnapshot(updatedProject),
      metadata: {
        source: "diex.update",
        nextActionCode: workflowService.getNextAction(
          this.buildWorkflowSnapshot(updatedProject),
        ).code,
      },
    });

    return diex;
  }

  async remove(diexId: string, user: CurrentUser) {
    const accessData = await this.ensureCanManage(diexId, user);

    if (!this.isStageBefore(accessData.project.stage, "AGUARDANDO_NOTA_EMPENHO")) {
      throw new AppError(
        "Não é possível excluir o DIEx quando o projeto já avançou além da etapa de DIEx",
        409
      );
    }

    const diex = await prisma.diexRequest.findUnique({
        where: { id: diexId },
        select: {
          id: true,
          diexCode: true,
          projectId: true,
          estimateId: true,
          diexNumber: true,
          issuedAt: true,
          issuingOrganization: true,
          commandName: true,
          pregaoNumber: true,
          uasg: true,
          supplierName: true,
          supplierCnpj: true,
          requesterName: true,
          requesterRank: true,
          requesterCpf: true,
          requesterRole: true,
          notes: true,
          totalAmount: true,
          project: {
            select: {
              id: true,
              projectCode: true,
              stage: true,
              status: true,
              diexNumber: true,
              diexIssuedAt: true,
              creditNoteNumber: true,
              creditNoteReceivedAt: true,
              commitmentNoteNumber: true,
              commitmentNoteReceivedAt: true,
              serviceOrderNumber: true,
              serviceOrderIssuedAt: true,
              executionStartedAt: true,
              asBuiltReceivedAt: true,
              invoiceAttestedAt: true,
              serviceCompletedAt: true,
            },
          },
        },
      });

    if (!diex) {
      throw new AppError("DIEx não encontrado", 404);
    }

    await auditService.log({
        entityType: "DIEX_REQUEST",
        entityId: diex.id,
        action: "DELETE",
        actor: this.getAuditActor(user),
        summary: `DIEx ${diex.diexNumber ?? `#${diex.diexCode}`} excluído`,
        before: this.buildDiexAuditSnapshot(diex),
      });

      await prisma.diexRequest.delete({
        where: { id: diexId },
      });
    
      const updatedProject = await prisma.project.update({
      where: { id: diex.projectId },
      data: {
        diexNumber: null,
        diexIssuedAt: null,
        stage: "AGUARDANDO_NOTA_CREDITO",
        status: "PLANEJAMENTO",
      },
      select: {
        id: true,
        projectCode: true,
        stage: true,
        status: true,
        diexNumber: true,
        diexIssuedAt: true,
        creditNoteNumber: true,
        creditNoteReceivedAt: true,
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

    await auditService.log({
      entityType: "PROJECT",
      entityId: diex.projectId,
      action: "STAGE_CHANGE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${updatedProject.projectCode} retornou após exclusão do DIEx`,
      before: this.buildProjectAuditSnapshot(diex.project),
      after: this.buildProjectAuditSnapshot(updatedProject),
      metadata: {
        source: "diex.remove",
        previousStage: diex.project.stage,
        newStage: updatedProject.stage,
        nextActionCode: workflowService.getNextAction(
          this.buildWorkflowSnapshot(updatedProject),
        ).code,
      },
    });

    return {
      message: "DIEx excluído com sucesso",
    };
  }
}