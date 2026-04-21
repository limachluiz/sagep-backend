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

type ScheduleItemInput = {
  orderIndex: number;
  taskStep: string;
  scheduleText: string;
};

type DeliveredDocumentInput = {
  description: string;
  isChecked?: boolean;
};

type CreateServiceOrderInput = {
  projectId?: string;
  projectCode?: number;
  estimateId?: string;
  estimateCode?: number;
  diexId?: string;
  diexCode?: number;
  serviceOrderNumber: string;
  issuedAt: Date;
  contractorCnpj: string;
  requesterName: string;
  requesterRank: string;
  requesterRole?: string;
  issuingOrganization?: string;
  isEmergency?: boolean;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  requestingArea?: string;
  projectDisplayName?: string;
  projectAcronym?: string;
  contractNumber?: string;
  executionLocation?: string;
  executionHours?: string;
  contactName?: string;
  contactPhone?: string;
  contactExtension?: string;
  contractTotalTerm?: string;
  originProcess?: string;
  requesterCpf?: string;
  contractorRepresentativeName?: string;
  contractorRepresentativeRole?: string;
  scheduleItems?: ScheduleItemInput[];
  deliveredDocuments?: DeliveredDocumentInput[];
  notes?: string;
};

type UpdateServiceOrderInput = {
  serviceOrderNumber?: string;
  issuedAt?: Date;
  contractorCnpj?: string;
  requesterName?: string;
  requesterRank?: string;
  requesterRole?: string;
  issuingOrganization?: string;
  isEmergency?: boolean;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  requestingArea?: string;
  projectDisplayName?: string;
  projectAcronym?: string;
  contractNumber?: string;
  executionLocation?: string;
  executionHours?: string;
  contactName?: string;
  contactPhone?: string;
  contactExtension?: string;
  contractTotalTerm?: string;
  originProcess?: string;
  requesterCpf?: string;
  contractorRepresentativeName?: string;
  contractorRepresentativeRole?: string;
  scheduleItems?: ScheduleItemInput[];
  deliveredDocuments?: DeliveredDocumentInput[];
  notes?: string;
};

type ListServiceOrderFilters = {
  code?: number;
  projectCode?: number;
  estimateCode?: number;
  diexCode?: number;
  emergency?: boolean;
  search?: string;
};

const serviceOrderInclude = {
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
  diexRequest: {
    select: {
      id: true,
      diexCode: true,
      diexNumber: true,
      issuedAt: true,
    },
  },
  items: {
    select: {
      id: true,
      serviceOrderItemCode: true,
      itemCode: true,
      description: true,
      supplyUnit: true,
      quantityOrdered: true,
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
      serviceOrderItemCode: "asc",
    },
  },
  scheduleItems: {
    select: {
      id: true,
      orderIndex: true,
      taskStep: true,
      scheduleText: true,
    },
    orderBy: {
      orderIndex: "asc",
    },
  },
  deliveredDocuments: {
    select: {
      id: true,
      description: true,
      isChecked: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
} satisfies Prisma.ServiceOrderInclude;

export class ServiceOrdersService {
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

  private isStageBefore(current: ProjectStageValue, target: ProjectStageValue) {
    return this.stageOrder.indexOf(current) < this.stageOrder.indexOf(target);
  }

  private assertProjectStageAllowsServiceOrderCreation(stage: ProjectStageValue) {
    const allowedStages: ProjectStageValue[] = [
      "AGUARDANDO_NOTA_EMPENHO",
      "OS_LIBERADA",
    ];

    if (!allowedStages.includes(stage)) {
      throw new AppError(
        "A Ordem de Serviço só pode ser criada quando o projeto estiver em AGUARDANDO_NOTA_EMPENHO ou OS_LIBERADA",
        409
      );
    }
  }

  private canManageProject(
    project: { ownerId: string; members: { userId: string }[] },
    user: CurrentUser
  ) {
    if (this.isPrivileged(user.role)) return true;
    if (project.ownerId === user.id) return true;

    const isMember = project.members.some((member) => member.userId === user.id);
    return isMember && user.role !== "CONSULTA";
  }

  private canViewProject(
    project: { ownerId: string; members: { userId: string }[] },
    user: CurrentUser
  ) {
    if (this.isPrivileged(user.role)) return true;
    if (project.ownerId === user.id) return true;
    return project.members.some((member) => member.userId === user.id);
  }

  private assertScheduleDates(startDate?: Date, endDate?: Date) {
    if (startDate && endDate && endDate < startDate) {
      throw new AppError(
        "A data prevista de entrega não pode ser menor que a data prevista de início",
        409
      );
    }
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
          commitmentNoteNumber: true,
          commitmentNoteReceivedAt: true,
          members: { select: { userId: true } },
        },
      });

      if (!project) throw new AppError("Projeto não encontrado", 404);

      if (projectCode && project.projectCode !== projectCode) {
        throw new AppError(
          "projectId e projectCode não correspondem ao mesmo projeto",
          400
        );
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
          commitmentNoteNumber: true,
          commitmentNoteReceivedAt: true,
          members: { select: { userId: true } },
        },
      });

      if (!project) throw new AppError("Projeto não encontrado", 404);
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
          omName: true,
          destinationCityName: true,
          destinationStateUf: true,
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
            orderBy: { estimateItemCode: "asc" },
          },
          ata: {
            select: {
              vendorName: true,
            },
          },
        },
      });

      if (!estimate) throw new AppError("Estimativa não encontrada", 404);

      if (estimateCode && estimate.estimateCode !== estimateCode) {
        throw new AppError(
          "estimateId e estimateCode não correspondem à mesma estimativa",
          400
        );
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
          omName: true,
          destinationCityName: true,
          destinationStateUf: true,
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
            orderBy: { estimateItemCode: "asc" },
          },
          ata: {
            select: {
              vendorName: true,
            },
          },
        },
      });

      if (!estimate) throw new AppError("Estimativa não encontrada", 404);
      return estimate;
    }

    throw new AppError("Estimativa não informada", 400);
  }

  private async resolveDiexForServiceOrder(
    projectId: string,
    estimateId: string,
    diexId?: string,
    diexCode?: number
  ) {
    if (diexId) {
      const diex = await prisma.diexRequest.findUnique({
        where: { id: diexId },
        select: {
          id: true,
          diexCode: true,
          projectId: true,
          estimateId: true,
        },
      });

      if (!diex) {
        throw new AppError("DIEx não encontrado", 404);
      }

      if (diexCode && diex.diexCode !== diexCode) {
        throw new AppError("diexId e diexCode não correspondem ao mesmo DIEx", 400);
      }

      if (diex.projectId !== projectId || diex.estimateId !== estimateId) {
        throw new AppError(
          "O DIEx informado não pertence ao mesmo projeto/estimativa",
          409
        );
      }

      return diex;
    }

    if (diexCode) {
      const diex = await prisma.diexRequest.findUnique({
        where: { diexCode },
        select: {
          id: true,
          diexCode: true,
          projectId: true,
          estimateId: true,
        },
      });

      if (!diex) {
        throw new AppError("DIEx não encontrado", 404);
      }

      if (diex.projectId !== projectId || diex.estimateId !== estimateId) {
        throw new AppError(
          "O DIEx informado não pertence ao mesmo projeto/estimativa",
          409
        );
      }

      return diex;
    }

    const diex = await prisma.diexRequest.findUnique({
      where: { estimateId },
      select: {
        id: true,
        diexCode: true,
        projectId: true,
        estimateId: true,
      },
    });

    if (!diex) {
      throw new AppError(
        "Não é possível gerar a OS sem um DIEx requisitório vinculado à estimativa",
        409
      );
    }

    if (diex.projectId !== projectId || diex.estimateId !== estimateId) {
      throw new AppError(
        "O DIEx encontrado não pertence ao mesmo projeto/estimativa",
        409
      );
    }

    return diex;
  }

  private async getServiceOrderAccessData(serviceOrderId: string) {
    const serviceOrder = await prisma.serviceOrder.findUnique({
      where: { id: serviceOrderId },
      select: {
        id: true,
        serviceOrderCode: true,
        project: {
          select: {
            id: true,
            ownerId: true,
            stage: true,
            members: { select: { userId: true } },
          },
        },
      },
    });

    if (!serviceOrder) throw new AppError("OS não encontrada", 404);
    return serviceOrder;
  }

  private async getServiceOrderAccessDataByCode(serviceOrderCode: number) {
    const serviceOrder = await prisma.serviceOrder.findUnique({
      where: { serviceOrderCode },
      select: {
        id: true,
        serviceOrderCode: true,
        project: {
          select: {
            id: true,
            ownerId: true,
            stage: true,
            members: { select: { userId: true } },
          },
        },
      },
    });

    if (!serviceOrder) throw new AppError("OS não encontrada", 404);
    return serviceOrder;
  }

  private async ensureCanView(serviceOrderId: string, user: CurrentUser) {
    const serviceOrder = await this.getServiceOrderAccessData(serviceOrderId);

    if (!this.canViewProject(serviceOrder.project, user)) {
      throw new AppError("Você não tem acesso a esta OS", 403);
    }

    return serviceOrder;
  }

  private async ensureCanManage(serviceOrderId: string, user: CurrentUser) {
    const serviceOrder = await this.getServiceOrderAccessData(serviceOrderId);

    if (!this.canManageProject(serviceOrder.project, user)) {
      throw new AppError("Você não tem permissão para gerenciar esta OS", 403);
    }

    return serviceOrder;
  }

  async create(data: CreateServiceOrderInput, user: CurrentUser) {
    this.assertScheduleDates(data.plannedStartDate, data.plannedEndDate);

    const project = await this.resolveProject(data.projectId, data.projectCode);

    if (!this.canManageProject(project, user)) {
      throw new AppError("Você não tem permissão para criar OS neste projeto", 403);
    }

    this.assertProjectStageAllowsServiceOrderCreation(project.stage);

    const estimate = await this.resolveEstimate(data.estimateId, data.estimateCode);

    if (estimate.projectId !== project.id) {
      throw new AppError("A estimativa informada não pertence ao projeto selecionado", 409);
    }

    if (estimate.status !== "FINALIZADA") {
      throw new AppError("Só é possível gerar OS a partir de uma estimativa finalizada", 409);
    }

    if (!project.commitmentNoteNumber && !project.commitmentNoteReceivedAt) {
      throw new AppError(
        "Para gerar a OS, o projeto precisa ter Nota/Empenho informada",
        409
      );
    }

    const alreadyExists = await prisma.serviceOrder.findUnique({
      where: { estimateId: estimate.id },
      select: { id: true },
    });

    if (alreadyExists) {
      throw new AppError("Já existe uma OS vinculada a esta estimativa", 409);
    }

    const diex = await this.resolveDiexForServiceOrder(
      project.id,
      estimate.id,
      data.diexId,
      data.diexCode
    );

    const serviceOrder = await prisma.serviceOrder.create({
      data: {
        projectId: project.id,
        estimateId: estimate.id,
        diexRequestId: diex.id,
        serviceOrderNumber: data.serviceOrderNumber.trim(),
        issuedAt: data.issuedAt,
        contractorName: estimate.ata.vendorName,
        contractorCnpj: data.contractorCnpj.trim(),
        commitmentNoteNumber: project.commitmentNoteNumber || "",
        requesterName: data.requesterName.trim(),
        requesterRank: data.requesterRank.trim(),
        requesterRole: data.requesterRole?.trim() || "Fiscal do Contrato",
        issuingOrganization: data.issuingOrganization?.trim() || "4º CTA",
        isEmergency: data.isEmergency ?? false,
        plannedStartDate: data.plannedStartDate,
        plannedEndDate: data.plannedEndDate,
        requestingArea:
          data.requestingArea?.trim() || "Seção de Projetos - Divisão Técnica 4º CTA",
        projectDisplayName: data.projectDisplayName?.trim() || project.title,
        projectAcronym: data.projectAcronym?.trim(),
        contractNumber: data.contractNumber?.trim(),
        executionLocation:
          data.executionLocation?.trim() ||
          `${estimate.destinationCityName}/${estimate.destinationStateUf} - 4º CTA`,
        executionHours: data.executionHours?.trim(),
        contactName: data.contactName?.trim(),
        contactPhone: data.contactPhone?.trim(),
        contactExtension: data.contactExtension?.trim(),
        contractTotalTerm: data.contractTotalTerm?.trim(),
        originProcess: data.originProcess?.trim() || "Pregão nº 90004/2025-CMA",
        requesterCpf: data.requesterCpf?.trim(),
        contractorRepresentativeName: data.contractorRepresentativeName?.trim(),
        contractorRepresentativeRole:
          data.contractorRepresentativeRole?.trim() ||
          "Responsável pela Contratada",
        notes: data.notes?.trim(),
        totalAmount: estimate.totalAmount,
        items: {
          create: estimate.items.map((item) => ({
            estimateItemId: item.id,
            itemCode: item.referenceCode,
            description: item.description,
            supplyUnit: item.unit,
            quantityOrdered: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.subtotal,
            notes: item.notes,
          })),
        },
        scheduleItems: {
          create: (data.scheduleItems ?? []).map((item) => ({
            orderIndex: item.orderIndex,
            taskStep: item.taskStep.trim(),
            scheduleText: item.scheduleText.trim(),
          })),
        },
        deliveredDocuments: {
          create: (data.deliveredDocuments ?? []).map((doc) => ({
            description: doc.description.trim(),
            isChecked: doc.isChecked ?? false,
          })),
        },
      },
      include: serviceOrderInclude,
    });

    await prisma.project.update({
      where: { id: project.id },
      data: {
        ...(project.stage === "AGUARDANDO_NOTA_EMPENHO"
          ? {
              stage: "OS_LIBERADA",
              status: "EM_ANDAMENTO",
            }
          : {}),
        serviceOrderNumber: serviceOrder.serviceOrderNumber,
        serviceOrderIssuedAt: serviceOrder.issuedAt,
      },
    });

    return prisma.serviceOrder.findUniqueOrThrow({
      where: { id: serviceOrder.id },
      include: serviceOrderInclude,
    });
  }

  async list(filters: ListServiceOrderFilters, user: CurrentUser) {
    const andConditions: Prisma.ServiceOrderWhereInput[] = [];

    if (!this.isPrivileged(user.role)) {
      andConditions.push({
        OR: [
          { project: { ownerId: user.id } },
          { project: { members: { some: { userId: user.id } } } },
        ],
      });
    }

    if (filters.code) {
      andConditions.push({ serviceOrderCode: filters.code });
    }

    if (filters.projectCode) {
      andConditions.push({ project: { projectCode: filters.projectCode } });
    }

    if (filters.estimateCode) {
      andConditions.push({ estimate: { estimateCode: filters.estimateCode } });
    }

    if (filters.diexCode) {
      andConditions.push({ diexRequest: { diexCode: filters.diexCode } });
    }

    if (filters.emergency !== undefined) {
      andConditions.push({ isEmergency: filters.emergency });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          { serviceOrderNumber: { contains: filters.search, mode: "insensitive" } },
          { contractorName: { contains: filters.search, mode: "insensitive" } },
          { contractorCnpj: { contains: filters.search, mode: "insensitive" } },
          { requesterName: { contains: filters.search, mode: "insensitive" } },
          { projectDisplayName: { contains: filters.search, mode: "insensitive" } },
        ],
      });
    }

    const where = andConditions.length ? { AND: andConditions } : undefined;

    return prisma.serviceOrder.findMany({
      where,
      include: serviceOrderInclude,
      orderBy: { serviceOrderCode: "asc" },
    });
  }

  async findById(serviceOrderId: string, user: CurrentUser) {
    await this.ensureCanView(serviceOrderId, user);

    const serviceOrder = await prisma.serviceOrder.findUnique({
      where: { id: serviceOrderId },
      include: serviceOrderInclude,
    });

    if (!serviceOrder) throw new AppError("OS não encontrada", 404);
    return serviceOrder;
  }

  async findByCode(serviceOrderCode: number, user: CurrentUser) {
    const accessData = await this.getServiceOrderAccessDataByCode(serviceOrderCode);

    if (!this.canViewProject(accessData.project, user)) {
      throw new AppError("Você não tem acesso a esta OS", 403);
    }

    const serviceOrder = await prisma.serviceOrder.findUnique({
      where: { serviceOrderCode },
      include: serviceOrderInclude,
    });

    if (!serviceOrder) throw new AppError("OS não encontrada", 404);
    return serviceOrder;
  }

  async update(serviceOrderId: string, data: UpdateServiceOrderInput, user: CurrentUser) {
    await this.ensureCanManage(serviceOrderId, user);

    const current = await prisma.serviceOrder.findUnique({
      where: { id: serviceOrderId },
      select: {
        plannedStartDate: true,
        plannedEndDate: true,
      },
    });

    if (!current) {
      throw new AppError("OS não encontrada", 404);
    }

    const nextStart = data.plannedStartDate ?? current.plannedStartDate ?? undefined;
    const nextEnd = data.plannedEndDate ?? current.plannedEndDate ?? undefined;

    this.assertScheduleDates(nextStart, nextEnd);

    const serviceOrder = await prisma.serviceOrder.update({
      where: { id: serviceOrderId },
      data: {
        ...(data.serviceOrderNumber !== undefined && {
          serviceOrderNumber: data.serviceOrderNumber.trim(),
        }),
        ...(data.issuedAt !== undefined && { issuedAt: data.issuedAt }),
        ...(data.contractorCnpj !== undefined && {
          contractorCnpj: data.contractorCnpj.trim(),
        }),
        ...(data.requesterName !== undefined && {
          requesterName: data.requesterName.trim(),
        }),
        ...(data.requesterRank !== undefined && {
          requesterRank: data.requesterRank.trim(),
        }),
        ...(data.requesterRole !== undefined && {
          requesterRole: data.requesterRole?.trim(),
        }),
        ...(data.issuingOrganization !== undefined && {
          issuingOrganization: data.issuingOrganization?.trim(),
        }),
        ...(data.isEmergency !== undefined && {
          isEmergency: data.isEmergency,
        }),
        ...(data.plannedStartDate !== undefined && {
          plannedStartDate: data.plannedStartDate,
        }),
        ...(data.plannedEndDate !== undefined && {
          plannedEndDate: data.plannedEndDate,
        }),
        ...(data.requestingArea !== undefined && {
          requestingArea: data.requestingArea?.trim(),
        }),
        ...(data.projectDisplayName !== undefined && {
          projectDisplayName: data.projectDisplayName?.trim(),
        }),
        ...(data.projectAcronym !== undefined && {
          projectAcronym: data.projectAcronym?.trim(),
        }),
        ...(data.contractNumber !== undefined && {
          contractNumber: data.contractNumber?.trim(),
        }),
        ...(data.executionLocation !== undefined && {
          executionLocation: data.executionLocation?.trim(),
        }),
        ...(data.executionHours !== undefined && {
          executionHours: data.executionHours?.trim(),
        }),
        ...(data.contactName !== undefined && {
          contactName: data.contactName?.trim(),
        }),
        ...(data.contactPhone !== undefined && {
          contactPhone: data.contactPhone?.trim(),
        }),
        ...(data.contactExtension !== undefined && {
          contactExtension: data.contactExtension?.trim(),
        }),
        ...(data.contractTotalTerm !== undefined && {
          contractTotalTerm: data.contractTotalTerm?.trim(),
        }),
        ...(data.originProcess !== undefined && {
          originProcess: data.originProcess?.trim(),
        }),
        ...(data.requesterCpf !== undefined && {
          requesterCpf: data.requesterCpf?.trim(),
        }),
        ...(data.contractorRepresentativeName !== undefined && {
          contractorRepresentativeName:
            data.contractorRepresentativeName?.trim(),
        }),
        ...(data.contractorRepresentativeRole !== undefined && {
          contractorRepresentativeRole:
            data.contractorRepresentativeRole?.trim(),
        }),
        ...(data.notes !== undefined && {
          notes: data.notes?.trim(),
        }),
        ...(data.scheduleItems !== undefined && {
          scheduleItems: {
            deleteMany: {},
            create: data.scheduleItems.map((item) => ({
              orderIndex: item.orderIndex,
              taskStep: item.taskStep.trim(),
              scheduleText: item.scheduleText.trim(),
            })),
          },
        }),
        ...(data.deliveredDocuments !== undefined && {
          deliveredDocuments: {
            deleteMany: {},
            create: data.deliveredDocuments.map((doc) => ({
              description: doc.description.trim(),
              isChecked: doc.isChecked ?? false,
            })),
          },
        }),
      },
      include: serviceOrderInclude,
    });

    await prisma.project.update({
      where: { id: serviceOrder.project.id },
      data: {
        serviceOrderNumber: serviceOrder.serviceOrderNumber,
        serviceOrderIssuedAt: serviceOrder.issuedAt,
      },
    });

    return serviceOrder;
  }

  async remove(serviceOrderId: string, user: CurrentUser) {
    const accessData = await this.ensureCanManage(serviceOrderId, user);

    if (!this.isStageBefore(accessData.project.stage, "SERVICO_EM_EXECUCAO")) {
      throw new AppError(
        "Não é possível excluir a OS quando o projeto já entrou em execução",
        409
      );
    }

    const serviceOrder = await prisma.serviceOrder.findUnique({
      where: { id: serviceOrderId },
      select: {
        id: true,
        projectId: true,
      },
    });

    if (!serviceOrder) throw new AppError("OS não encontrada", 404);

    await prisma.serviceOrder.delete({
      where: { id: serviceOrderId },
    });

    await prisma.project.update({
      where: { id: serviceOrder.projectId },
      data: {
        serviceOrderNumber: null,
        serviceOrderIssuedAt: null,
        stage: "AGUARDANDO_NOTA_EMPENHO",
        status: "PLANEJAMENTO",
      },
    });

    return {
      message: "OS excluída com sucesso",
    };
  }
}