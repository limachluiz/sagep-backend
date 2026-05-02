import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { withArchiveContext } from "../../shared/archive-context.js";
import type { RestoreOptions } from "../../shared/restore.schemas.js";
import { auditService } from "../audit/audit.service.js";
import type { AuditEntityType, AuditSnapshot } from "../audit/audit.types.js";
import { DiexService } from "../diex/diex.service.js";
import { EstimatesService } from "../estimates/estimates.service.js";
import { permissionsService } from "../permissions/permissions.service.js";
import { ServiceOrdersService } from "../service-orders/service-orders.service.js";
import { TasksService } from "../tasks/tasks.service.js";
import { workflowService } from "../workflow/workflow.service.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";

type CurrentUser = {
  id: string;
  name?: string;
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

type CancelCommitmentNoteInput = {
  reason: string;
};

type ListProjectsFilters = {
  code?: number;
  status?: "PLANEJAMENTO" | "EM_ANDAMENTO" | "PAUSADO" | "CONCLUIDO" | "CANCELADO";
  stage?: ProjectStageValue;
  search?: string;
  includeArchived?: boolean;
  onlyArchived?: boolean;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  archivedFrom?: Date;
  archivedUntil?: Date;
};

type PendingAction = {
  code: string;
  label: string;
  severity: "INFO" | "WARNING" | "BLOCKER";
  targetStage?: ProjectStageValue;
};

type TimelineEntityInput = {
  entityType: AuditEntityType;
  entityId: string;
  context: AuditSnapshot;
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
      tasks: {
        where: {
          deletedAt: null,
        },
      },
      estimates: {
        where: {
          deletedAt: null,
        },
      },
    },
  },
} satisfies Prisma.ProjectInclude;

const tasksService = new TasksService();
const estimatesService = new EstimatesService();
const diexService = new DiexService();
const serviceOrdersService = new ServiceOrdersService();

export class ProjectsService {
  private isAdmin(role: string) {
    return role === "ADMIN";
  }

  private buildLifecycleVisibilityWhere(
    includeArchived = false,
    includeDeleted = false,
  ): Prisma.ProjectWhereInput {
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

  private canIncludeArchived(user: CurrentUser, includeArchived?: boolean) {
    return Boolean(includeArchived && this.isPrivileged(user.role));
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
      throw new AppError("Apenas ADMIN pode consultar itens arquivados", 403);
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

  private isPrivileged(role: string) {
    return permissionsService.hasPermission({ role }, "projects.view_all");
  }

  private async getProjectAccessData(projectId: string, includeArchived = false) {
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
            tasks: {
              where: {
                deletedAt: null,
              },
            },
            estimates: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
        archivedAt: true,
        deletedAt: true,
      },
    });

    if (!project || project.deletedAt || (!includeArchived && project.archivedAt)) {
      throw new AppError("Projeto não encontrado", 404);
    }

    return project;
  }

  private async getProjectAccessDataByCode(projectCode: number, includeArchived = false) {
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
        archivedAt: true,
        deletedAt: true,
      },
    });

    if (!project || project.deletedAt || (!includeArchived && project.archivedAt)) {
      throw new AppError("Projeto não encontrado", 404);
    }

    return project;
  }

  private async ensureCanView(projectId: string, user: CurrentUser, includeArchived = false) {
    const project = await this.getProjectAccessData(projectId, includeArchived);

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

  private async ensureCanViewByCode(projectCode: number, user: CurrentUser, includeArchived = false) {
    const project = await this.getProjectAccessDataByCode(projectCode, includeArchived);

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

  private async ensureCanManage(projectId: string, user: CurrentUser, includeArchived = false) {
    const project = await this.getProjectAccessData(projectId, includeArchived);

    if (permissionsService.hasPermission(user, "projects.edit_all")) {
      return project;
    }

    if (
      permissionsService.hasPermission(user, "projects.edit_own") &&
      project.ownerId === user.id
    ) {
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

  private amountToNumber(value: { toString(): string } | string | number | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private sumAmounts(items: { totalAmount: { toString(): string } | string | number }[]) {
    return items
      .reduce((sum, item) => sum + this.amountToNumber(item.totalAmount), 0)
      .toFixed(2);
  }

  private buildPendingActions(project: {
    status?: string | null;
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
    estimates: { status: string }[];
    diexRequests: unknown[];
    serviceOrders: unknown[];
    tasks: { status: string }[];
  }): PendingAction[] {
    const pendingActions: PendingAction[] = [];
    const hasFinalizedEstimate = project.estimates.some(
      (estimate) => estimate.status === "FINALIZADA",
    );
    const openTasksCount = project.tasks.filter(
      (task) => task.status !== "CONCLUIDA" && task.status !== "CANCELADA",
    ).length;
    const isProjectCompleted =
      project.status === "CONCLUIDO" || project.stage === "SERVICO_CONCLUIDO";

    if (!hasFinalizedEstimate) {
      pendingActions.push({
        code: "FINALIZAR_ESTIMATIVA",
        label: "Finalizar pelo menos uma estimativa",
        severity: "BLOCKER",
        targetStage: "AGUARDANDO_NOTA_CREDITO",
      });
    }

    if (
      workflowService.isStageAtOrBeyond(project.stage, "AGUARDANDO_NOTA_CREDITO") &&
      !project.creditNoteNumber &&
      !project.creditNoteReceivedAt
    ) {
      pendingActions.push({
        code: "INFORMAR_NOTA_CREDITO",
        label: "Informar Nota de Crédito",
        severity: project.stage === "AGUARDANDO_NOTA_CREDITO" ? "BLOCKER" : "WARNING",
        targetStage: "DIEX_REQUISITORIO",
      });
    }

    if (
      workflowService.isStageAtOrBeyond(project.stage, "AGUARDANDO_NOTA_CREDITO") &&
      hasFinalizedEstimate &&
      project.diexRequests.length === 0
    ) {
      pendingActions.push({
        code: "EMITIR_DIEX",
        label: "Emitir DIEx requisitório",
        severity: project.stage === "AGUARDANDO_NOTA_CREDITO" ? "BLOCKER" : "WARNING",
        targetStage: "DIEX_REQUISITORIO",
      });
    }

    if (
      workflowService.isStageAtOrBeyond(project.stage, "DIEX_REQUISITORIO") &&
      !project.diexNumber &&
      !project.diexIssuedAt &&
      project.diexRequests.length > 0
    ) {
      pendingActions.push({
        code: "COMPLETAR_DADOS_DIEX",
        label: "Completar número ou data do DIEx",
        severity: "WARNING",
        targetStage: "DIEX_REQUISITORIO",
      });
    }

    if (
      workflowService.isStageAtOrBeyond(project.stage, "DIEX_REQUISITORIO") &&
      !project.commitmentNoteNumber &&
      !project.commitmentNoteReceivedAt
    ) {
      pendingActions.push({
        code: "INFORMAR_NOTA_EMPENHO",
        label: "Informar Nota de Empenho",
        severity: project.stage === "DIEX_REQUISITORIO" ? "BLOCKER" : "WARNING",
        targetStage: "AGUARDANDO_NOTA_EMPENHO",
      });
    }

    if (
      workflowService.isStageAtOrBeyond(project.stage, "AGUARDANDO_NOTA_EMPENHO") &&
      project.serviceOrders.length === 0
    ) {
      pendingActions.push({
        code: "EMITIR_OS",
        label: "Emitir Ordem de Serviço",
        severity: project.stage === "AGUARDANDO_NOTA_EMPENHO" ? "BLOCKER" : "WARNING",
        targetStage: "OS_LIBERADA",
      });
    }

    if (
      workflowService.isStageAtOrBeyond(project.stage, "OS_LIBERADA") &&
      !project.serviceOrderNumber &&
      !project.serviceOrderIssuedAt &&
      project.serviceOrders.length > 0
    ) {
      pendingActions.push({
        code: "COMPLETAR_DADOS_OS",
        label: "Completar número ou data da Ordem de Serviço",
        severity: "WARNING",
        targetStage: "OS_LIBERADA",
      });
    }

    if (project.stage === "OS_LIBERADA" && !project.executionStartedAt) {
      pendingActions.push({
        code: "INICIAR_EXECUCAO",
        label: "Registrar início da execução",
        severity: "BLOCKER",
        targetStage: "SERVICO_EM_EXECUCAO",
      });
    }

    if (project.stage === "SERVICO_EM_EXECUCAO" && !project.asBuiltReceivedAt) {
      pendingActions.push({
        code: "ANEXAR_AS_BUILT",
        label: "Registrar recebimento do As-Built",
        severity: "BLOCKER",
        targetStage: "ANALISANDO_AS_BUILT",
      });
    }

    if (project.stage === "ATESTAR_NF") {
      if (!project.invoiceAttestedAt) {
        pendingActions.push({
          code: "ATESTAR_NF",
          label: "Registrar atesto da NF",
          severity: "BLOCKER",
          targetStage: "SERVICO_CONCLUIDO",
        });
      }

      if (!project.serviceCompletedAt) {
        pendingActions.push({
          code: "CONCLUIR_SERVICO",
          label: "Registrar conclusão do serviço",
          severity: "BLOCKER",
          targetStage: "SERVICO_CONCLUIDO",
        });
      }
    }

    if (openTasksCount > 0 && isProjectCompleted) {
      pendingActions.push({
        code: "TAREFAS_ABERTAS_POS_CONCLUSAO",
        label: `Projeto concluído com ${openTasksCount} tarefa(s) aberta(s)`,
        severity: "WARNING",
      });
    } else if (openTasksCount > 0) {
      pendingActions.push({
        code: "RESOLVER_TAREFAS_ABERTAS",
        label: `Resolver ${openTasksCount} tarefa(s) aberta(s)`,
        severity: "INFO",
      });
    }

    return pendingActions;
  }

  private buildTimelineEntities(project: {
    id: string;
    projectCode: number;
    title: string;
    estimates?: Array<{
      id: string;
      estimateCode: number;
      status?: string;
      totalAmount?: unknown;
      destinationCityName?: string;
      destinationStateUf?: string;
    }>;
    diexRequests?: Array<{
      id: string;
      diexCode: number;
      diexNumber?: string | null;
      documentStatus?: string;
      totalAmount?: unknown;
      estimate?: { id: string; estimateCode: number } | null;
    }>;
    serviceOrders?: Array<{
      id: string;
      serviceOrderCode: number;
      serviceOrderNumber?: string | null;
      documentStatus?: string;
      totalAmount?: unknown;
      estimate?: { id: string; estimateCode: number } | null;
      diexRequest?: { id: string; diexCode: number; diexNumber?: string | null } | null;
    }>;
    tasks?: Array<{
      id: string;
      taskCode: number;
      title: string;
      status?: string;
      priority?: number | string;
    }>;
  }): TimelineEntityInput[] {
    const baseProjectContext: AuditSnapshot = {
      projectId: project.id,
      projectCode: project.projectCode,
      projectTitle: project.title,
    };

    const entities: TimelineEntityInput[] = [
      {
        entityType: "PROJECT",
        entityId: project.id,
        context: {
          ...baseProjectContext,
          resourceType: "PROJECT",
          resourceCode: `PRJ-${project.projectCode}`,
          resourceLabel: project.title,
        },
      },
    ];

    for (const estimate of project.estimates ?? []) {
      entities.push({
        entityType: "ESTIMATE",
        entityId: estimate.id,
        context: {
          ...baseProjectContext,
          resourceType: "ESTIMATE",
          resourceCode: `EST-${estimate.estimateCode}`,
          resourceLabel: `Estimativa EST-${estimate.estimateCode}`,
          status: estimate.status ?? null,
          totalAmount: estimate.totalAmount?.toString() ?? null,
          destination: estimate.destinationCityName && estimate.destinationStateUf
            ? `${estimate.destinationCityName}/${estimate.destinationStateUf}`
            : null,
        },
      });
    }

    for (const diex of project.diexRequests ?? []) {
      entities.push({
        entityType: "DIEX_REQUEST",
        entityId: diex.id,
        context: {
          ...baseProjectContext,
          resourceType: "DIEX_REQUEST",
          resourceCode: diex.diexNumber ?? `DIEX-${diex.diexCode}`,
          resourceLabel: `DIEx ${diex.diexNumber ?? `#${diex.diexCode}`}`,
          documentStatus: diex.documentStatus ?? null,
          totalAmount: diex.totalAmount?.toString() ?? null,
          estimateId: diex.estimate?.id ?? null,
          estimateCode: diex.estimate ? `EST-${diex.estimate.estimateCode}` : null,
        },
      });
    }

    for (const serviceOrder of project.serviceOrders ?? []) {
      entities.push({
        entityType: "SERVICE_ORDER",
        entityId: serviceOrder.id,
        context: {
          ...baseProjectContext,
          resourceType: "SERVICE_ORDER",
          resourceCode: serviceOrder.serviceOrderNumber ?? `OS-${serviceOrder.serviceOrderCode}`,
          resourceLabel: `OS ${serviceOrder.serviceOrderNumber ?? `#${serviceOrder.serviceOrderCode}`}`,
          documentStatus: serviceOrder.documentStatus ?? null,
          totalAmount: serviceOrder.totalAmount?.toString() ?? null,
          estimateId: serviceOrder.estimate?.id ?? null,
          estimateCode: serviceOrder.estimate
            ? `EST-${serviceOrder.estimate.estimateCode}`
            : null,
          diexRequestId: serviceOrder.diexRequest?.id ?? null,
          diexCode: serviceOrder.diexRequest
            ? serviceOrder.diexRequest.diexNumber ??
              `DIEX-${serviceOrder.diexRequest.diexCode}`
            : null,
        },
      });
    }

    for (const task of project.tasks ?? []) {
      entities.push({
        entityType: "TASK",
        entityId: task.id,
        context: {
          ...baseProjectContext,
          resourceType: "TASK",
          resourceCode: `TSK-${task.taskCode}`,
          resourceLabel: task.title,
          status: task.status ?? null,
          priority: task.priority ?? null,
        },
      });
    }

    return entities;
  }

  private async buildUnifiedTimeline(project: {
    id: string;
    projectCode: number;
    title: string;
  }) {
    const related = await prisma.project.findUnique({
      where: { id: project.id },
      select: {
        estimates: {
          where: { deletedAt: null },
          select: {
            id: true,
            estimateCode: true,
            status: true,
            totalAmount: true,
            destinationCityName: true,
            destinationStateUf: true,
          },
        },
        diexRequests: {
          where: { deletedAt: null },
          select: {
            id: true,
            diexCode: true,
            diexNumber: true,
            documentStatus: true,
            totalAmount: true,
            estimate: {
              select: {
                id: true,
                estimateCode: true,
              },
            },
          },
        },
        serviceOrders: {
          where: { deletedAt: null },
          select: {
            id: true,
            serviceOrderCode: true,
            serviceOrderNumber: true,
            documentStatus: true,
            totalAmount: true,
            estimate: {
              select: {
                id: true,
                estimateCode: true,
              },
            },
            diexRequest: {
              select: {
                id: true,
                diexCode: true,
                diexNumber: true,
              },
            },
          },
        },
        tasks: {
          where: { deletedAt: null },
          select: {
            id: true,
            taskCode: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });

    return auditService.listTimelineForEntities(
      this.buildTimelineEntities({
        ...project,
        estimates: related?.estimates ?? [],
        diexRequests: related?.diexRequests ?? [],
        serviceOrders: related?.serviceOrders ?? [],
        tasks: related?.tasks ?? [],
      }),
    );
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
    const { includeArchived, onlyArchived, includeDeleted, onlyDeleted } =
      this.resolveArchivedAccess(user, filters);
    const andConditions: Prisma.ProjectWhereInput[] = [];
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

    if (includeArchived || onlyArchived || hasArchivedPeriod) {
      return withArchiveContext("PROJECT", projects);
    }

    return projects;
  }

  async findById(
    projectId: string,
    user: CurrentUser,
    filters: { includeArchived?: boolean } = {},
  ) {
    const { includeArchived } = this.resolveArchivedAccess(user, filters);
    await this.ensureCanView(projectId, user, includeArchived);

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
          where: includeArchived
            ? {
                deletedAt: null,
              }
            : {
                archivedAt: null,
                deletedAt: null,
              },
          select: {
            id: true,
            taskCode: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            archivedAt: true,
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
          where: includeArchived
            ? {
                deletedAt: null,
              }
            : {
                archivedAt: null,
                deletedAt: null,
              },
          select: {
            id: true,
            estimateCode: true,
            status: true,
            destinationCityName: true,
            destinationStateUf: true,
            totalAmount: true,
            archivedAt: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            members: true,
            tasks: {
              where: includeArchived
                ? {
                    deletedAt: null,
                  }
                : {
                    archivedAt: null,
                    deletedAt: null,
                  },
            },
            estimates: {
              where: includeArchived
                ? {
                    deletedAt: null,
                  }
                : {
                    archivedAt: null,
                    deletedAt: null,
                  },
            },
          },
        },
      },
    });

    if (!project) {
      throw new AppError("Projeto não encontrado", 404);
    }

    return project;
  }

  async getDetails(
    projectId: string,
    user: CurrentUser,
    filters: { includeArchived?: boolean } = {},
  ) {
    const { includeArchived } = this.resolveArchivedAccess(user, filters);
    await this.ensureCanView(projectId, user, includeArchived);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        title: true,
        description: true,
        status: true,
        stage: true,
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
        archivedAt: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
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
          where: includeArchived
            ? {
                deletedAt: null,
              }
            : {
                archivedAt: null,
                deletedAt: null,
              },
          select: {
            id: true,
            taskCode: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            archivedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        estimates: {
          where: includeArchived
            ? {
                deletedAt: null,
              }
            : {
                archivedAt: null,
                deletedAt: null,
              },
          select: {
            id: true,
            estimateCode: true,
            status: true,
            destinationCityName: true,
            destinationStateUf: true,
            totalAmount: true,
            archivedAt: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        diexRequests: {
          where: includeArchived
            ? {
                deletedAt: null,
              }
            : {
                archivedAt: null,
                deletedAt: null,
              },
          select: {
            id: true,
            diexCode: true,
            diexNumber: true,
            issuedAt: true,
            documentStatus: true,
            totalAmount: true,
            supplierName: true,
            archivedAt: true,
            createdAt: true,
            estimate: {
              select: {
                id: true,
                estimateCode: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        serviceOrders: {
          where: includeArchived
            ? {
                deletedAt: null,
              }
            : {
                archivedAt: null,
                deletedAt: null,
              },
          select: {
            id: true,
            serviceOrderCode: true,
            serviceOrderNumber: true,
            issuedAt: true,
            documentStatus: true,
            totalAmount: true,
            contractorName: true,
            archivedAt: true,
            createdAt: true,
            estimate: {
              select: {
                id: true,
                estimateCode: true,
              },
            },
            diexRequest: {
              select: {
                id: true,
                diexCode: true,
                diexNumber: true,
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
            tasks: {
              where: includeArchived
                ? {
                    deletedAt: null,
                  }
                : {
                    archivedAt: null,
                    deletedAt: null,
                  },
            },
            estimates: {
              where: includeArchived
                ? {
                    deletedAt: null,
                  }
                : {
                    archivedAt: null,
                    deletedAt: null,
                  },
            },
          },
        },
      },
    });

    if (!project) {
      throw new AppError("Projeto nÃ£o encontrado", 404);
    }

    const workflowSnapshot = this.buildWorkflowSnapshot(project);
    const nextAction = workflowService.getNextAction(workflowSnapshot);
    const timeline = await this.buildUnifiedTimeline(project);
    const finalizedEstimates = project.estimates.filter(
      (estimate) => estimate.status === "FINALIZADA",
    );
    const openTasks = project.tasks.filter(
      (task) => task.status !== "CONCLUIDA" && task.status !== "CANCELADA",
    );

    return {
      project: {
        id: project.id,
        projectCode: project.projectCode,
        title: project.title,
        description: project.description,
        owner: project.owner,
        members: project.members,
        startDate: project.startDate,
        endDate: project.endDate,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        archivedAt: project.archivedAt,
        deletedAt: project.deletedAt,
      },
      workflow: {
        status: project.status,
        stage: project.stage,
        nextAction,
        milestones: {
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
        },
      },
      pendingActions: this.buildPendingActions(project),
      timeline,
      documents: {
        estimates: project.estimates.slice(0, 5),
        diexRequests: project.diexRequests.slice(0, 5),
        serviceOrders: project.serviceOrders.slice(0, 5),
      },
      financialSummary: {
        estimatesCount: project.estimates.length,
        finalizedEstimatesCount: finalizedEstimates.length,
        diexRequestsCount: project.diexRequests.length,
        serviceOrdersCount: project.serviceOrders.length,
        estimatedTotalAmount: this.sumAmounts(project.estimates),
        finalizedEstimatedTotalAmount: this.sumAmounts(finalizedEstimates),
        diexTotalAmount: this.sumAmounts(project.diexRequests),
        serviceOrderTotalAmount: this.sumAmounts(project.serviceOrders),
      },
      operationalSummary: {
        membersCount: project._count.members,
        tasksCount: project._count.tasks,
        openTasksCount: openTasks.length,
        estimatesCount: project._count.estimates,
        diexRequestsCount: project.diexRequests.length,
        serviceOrdersCount: project.serviceOrders.length,
      },
    };
  }

  async findByCode(
    projectCode: number,
    user: CurrentUser,
    filters: { includeArchived?: boolean } = {},
  ) {
    const { includeArchived } = this.resolveArchivedAccess(user, filters);
    await this.ensureCanViewByCode(projectCode, user, includeArchived);

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

    if (
      data.stage === "SERVICO_CONCLUIDO" &&
      !permissionsService.hasPermission(user, "projects.complete")
    ) {
      throw new AppError("Você não tem permissão para concluir projetos", 403);
    }

    if (
      currentProject.stage === "SERVICO_CONCLUIDO" &&
      data.stage !== "SERVICO_CONCLUIDO" &&
      !permissionsService.hasPermission(user, "projects.reopen")
    ) {
      throw new AppError("Você não tem permissão para reabrir projetos", 403);
    }

    const finalizedEstimateCount = await prisma.estimate.count({
      where: {
        projectId,
        status: "FINALIZADA",
        archivedAt: null,
        deletedAt: null,
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
    const isFirstCommitmentNoteRegistration =
      !currentProject.commitmentNoteNumber &&
      !currentProject.commitmentNoteReceivedAt &&
      (!!nextSnapshot.commitmentNoteNumber || !!nextSnapshot.commitmentNoteReceivedAt);

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

    const project = await prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({
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

      if (isFirstCommitmentNoteRegistration) {
        await ataItemBalanceService.consumeForProjectCommitmentNote(
          projectId,
          this.getAuditActor(user),
          updatedProject.commitmentNoteNumber ?? "sem-numero",
          tx,
        );
      }

      return updatedProject;
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

  async cancelCommitmentNote(projectId: string, data: CancelCommitmentNoteInput, user: CurrentUser) {
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

    if (!currentProject.commitmentNoteNumber && !currentProject.commitmentNoteReceivedAt) {
      throw new AppError("O projeto não possui Nota de Empenho ativa para cancelamento", 409);
    }

    const reason = data.reason.trim();

    const rollbackResult = await prisma.$transaction(async (tx) => {
      const diex = await tx.diexRequest.findFirst({
        where: {
          projectId,
          archivedAt: null,
          deletedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          diexCode: true,
          diexNumber: true,
          issuedAt: true,
          documentStatus: true,
          estimateId: true,
          totalAmount: true,
          archivedAt: true,
          deletedAt: true,
        },
      });

      if (!diex) {
        throw new AppError("Nenhum DIEx ativo foi encontrado para rollback da NE", 409);
      }

      const estimate = await tx.estimate.findUnique({
        where: { id: diex.estimateId },
        select: {
          id: true,
          estimateCode: true,
          status: true,
          totalAmount: true,
          archivedAt: true,
          deletedAt: true,
        },
      });

      if (!estimate || estimate.deletedAt || estimate.archivedAt) {
        throw new AppError("Nenhuma estimativa ativa foi encontrada para rollback da NE", 409);
      }

      const serviceOrder = await tx.serviceOrder.findFirst({
        where: {
          projectId,
          archivedAt: null,
          deletedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          serviceOrderCode: true,
          serviceOrderNumber: true,
          issuedAt: true,
          documentStatus: true,
          estimateId: true,
          diexRequestId: true,
          totalAmount: true,
          archivedAt: true,
          deletedAt: true,
        },
      });

      await ataItemBalanceService.reverseConsumedForProject(
        projectId,
        this.getAuditActor(user),
        reason,
        serviceOrder?.id,
        tx,
      );

      const archivedAt = new Date();

      const cancelledEstimate = await tx.estimate.update({
        where: { id: estimate.id },
        data: {
          status: "CANCELADA",
          archivedAt,
        },
        select: {
          id: true,
          estimateCode: true,
          status: true,
          totalAmount: true,
          archivedAt: true,
          deletedAt: true,
        },
      });

      const cancelledDiex = await tx.diexRequest.update({
        where: { id: diex.id },
        data: {
          documentStatus: "CANCELADO",
          archivedAt,
        },
        select: {
          id: true,
          diexCode: true,
          diexNumber: true,
          issuedAt: true,
          documentStatus: true,
          estimateId: true,
          totalAmount: true,
          archivedAt: true,
          deletedAt: true,
        },
      });

      const cancelledServiceOrder = serviceOrder
        ? await tx.serviceOrder.update({
            where: { id: serviceOrder.id },
            data: {
              documentStatus: "CANCELADO",
              archivedAt,
            },
            select: {
              id: true,
              serviceOrderCode: true,
              serviceOrderNumber: true,
              issuedAt: true,
              documentStatus: true,
              estimateId: true,
              diexRequestId: true,
              totalAmount: true,
              archivedAt: true,
              deletedAt: true,
            },
          })
        : null;

      const resetProject = await tx.project.update({
        where: { id: projectId },
        data: {
          stage: "ESTIMATIVA_PRECO",
          status: workflowService.getMacroStatusFromStage("ESTIMATIVA_PRECO"),
          diexNumber: null,
          diexIssuedAt: null,
          commitmentNoteNumber: null,
          commitmentNoteReceivedAt: null,
          serviceOrderNumber: null,
          serviceOrderIssuedAt: null,
          executionStartedAt: null,
          asBuiltReceivedAt: null,
          invoiceAttestedAt: null,
          serviceCompletedAt: null,
        },
        include: projectInclude,
      });

      return {
        estimateBefore: estimate,
        estimateAfter: cancelledEstimate,
        diexBefore: diex,
        diexAfter: cancelledDiex,
        serviceOrderBefore: serviceOrder,
        serviceOrderAfter: cancelledServiceOrder,
        projectAfter: resetProject,
      };
    });

    await auditService.log({
      entityType: "PROJECT",
      entityId: projectId,
      action: "STAGE_CHANGE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${currentProject.projectCode} retornou para ESTIMATIVA_PRECO após cancelamento da Nota de Empenho`,
      before: this.buildProjectAuditSnapshot(currentProject),
      after: this.buildProjectAuditSnapshot(rollbackResult.projectAfter),
      metadata: {
        source: "project.commitment-note.cancel",
        reason,
        rollback: {
          estimateId: rollbackResult.estimateAfter.id,
          diexId: rollbackResult.diexAfter.id,
          serviceOrderId: rollbackResult.serviceOrderAfter?.id ?? null,
        },
      },
    });

    await auditService.log({
      entityType: "ESTIMATE",
      entityId: rollbackResult.estimateAfter.id,
      action: "ARCHIVE",
      actor: this.getAuditActor(user),
      summary: `Estimativa #${rollbackResult.estimateAfter.estimateCode} cancelada por rollback da Nota de Empenho`,
      before: {
        ...rollbackResult.estimateBefore,
        totalAmount: rollbackResult.estimateBefore.totalAmount.toString(),
      },
      after: {
        ...rollbackResult.estimateAfter,
        totalAmount: rollbackResult.estimateAfter.totalAmount.toString(),
      },
      metadata: {
        source: "project.commitment-note.cancel",
        reason,
        origin: "NE_ROLLBACK",
      },
    });

    await auditService.log({
      entityType: "DIEX_REQUEST",
      entityId: rollbackResult.diexAfter.id,
      action: "ARCHIVE",
      actor: this.getAuditActor(user),
      summary: `DIEx ${rollbackResult.diexAfter.diexNumber ?? `#${rollbackResult.diexAfter.diexCode}`} cancelado por rollback da Nota de Empenho`,
      before: {
        ...rollbackResult.diexBefore,
        totalAmount: rollbackResult.diexBefore.totalAmount.toString(),
      },
      after: {
        ...rollbackResult.diexAfter,
        totalAmount: rollbackResult.diexAfter.totalAmount.toString(),
      },
      metadata: {
        source: "project.commitment-note.cancel",
        reason,
        origin: "NE_ROLLBACK",
      },
    });

    if (rollbackResult.serviceOrderAfter && rollbackResult.serviceOrderBefore) {
      await auditService.log({
        entityType: "SERVICE_ORDER",
        entityId: rollbackResult.serviceOrderAfter.id,
        action: "ARCHIVE",
        actor: this.getAuditActor(user),
        summary: `OS ${rollbackResult.serviceOrderAfter.serviceOrderNumber ?? `#${rollbackResult.serviceOrderAfter.serviceOrderCode}`} cancelada por rollback da Nota de Empenho`,
        before: {
          ...rollbackResult.serviceOrderBefore,
          totalAmount: rollbackResult.serviceOrderBefore.totalAmount.toString(),
        },
        after: {
          ...rollbackResult.serviceOrderAfter,
          totalAmount: rollbackResult.serviceOrderAfter.totalAmount.toString(),
        },
        metadata: {
          source: "project.commitment-note.cancel",
          reason,
          origin: "NE_ROLLBACK",
        },
      });
    }

    return {
      message: "Nota de Empenho cancelada com rollback documental e financeiro",
      project: rollbackResult.projectAfter,
      rollback: {
        estimateId: rollbackResult.estimateAfter.id,
        diexRequestId: rollbackResult.diexAfter.id,
        serviceOrderId: rollbackResult.serviceOrderAfter?.id ?? null,
        reason,
      },
    };
  }

  async remove(projectId: string, user: CurrentUser) {
    const projectAccess = await this.ensureCanManage(projectId, user);

    if (
      projectAccess._count.members > 0 ||
      projectAccess._count.tasks > 0 ||
      projectAccess._count.estimates > 0
    ) {
      throw new AppError(
        "Não é possível arquivar um projeto que já possui membros, tarefas ou estimativas vinculadas",
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
        archivedAt: true,
        deletedAt: true,
      },
    });

    if (!before || before.deletedAt) {
      throw new AppError("Projeto não encontrado", 404);
    }

    if (before.archivedAt) {
      throw new AppError("Projeto já está arquivado", 409);
    }

    await auditService.log({
      entityType: "PROJECT",
      entityId: before.id,
      action: "ARCHIVE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${before.projectCode} arquivado`,
      before: this.buildProjectAuditSnapshot(before),
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        archivedAt: new Date(),
      },
    });

    return {
      message: "Projeto arquivado com sucesso",
    };
  }

  async restore(projectId: string, user: CurrentUser, options: RestoreOptions = {}) {
    if (!permissionsService.hasPermission(user, "projects.restore")) {
      throw new AppError("Você não tem permissão para restaurar este projeto", 403);
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
        archivedAt: true,
        deletedAt: true,
      },
    });

    if (!before || before.deletedAt) {
      throw new AppError("Projeto não encontrado", 404);
    }

    if (!before.archivedAt) {
      throw new AppError("Projeto não está arquivado", 409);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        archivedAt: null,
      },
      include: projectInclude,
    });

    let project = await prisma.project.findUnique({
      where: { id: projectId },
      include: projectInclude,
    });

    if (!project) {
      throw new AppError("Projeto não encontrado", 404);
    }

    await auditService.log({
      entityType: "PROJECT",
      entityId: project.id,
      action: "RESTORE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${project.projectCode} restaurado`,
      before: this.buildProjectAuditSnapshot(before),
      after: this.buildProjectAuditSnapshot(project),
      metadata: {
        permissionUsed: "projects.restore",
        cascade: Boolean(options.cascade),
      },
    });

    const cascade = {
      restored: {
        tasks: 0,
        estimates: 0,
        diexRequests: 0,
        serviceOrders: 0,
      },
      skipped: {
        tasksDeleted: 0,
        estimatesDeleted: 0,
        diexDeleted: 0,
        serviceOrdersDeleted: 0,
      },
    };

    if (options.cascade) {
      const [archivedTasks, archivedEstimates, archivedDiex, archivedServiceOrders] =
        await Promise.all([
          prisma.task.findMany({
            where: {
              projectId,
              archivedAt: {
                not: null,
              },
            },
            select: {
              id: true,
              deletedAt: true,
            },
            orderBy: {
              taskCode: "asc",
            },
          }),
          prisma.estimate.findMany({
            where: {
              projectId,
              archivedAt: {
                not: null,
              },
            },
            select: {
              id: true,
              deletedAt: true,
            },
            orderBy: {
              estimateCode: "asc",
            },
          }),
          prisma.diexRequest.findMany({
            where: {
              projectId,
              archivedAt: {
                not: null,
              },
            },
            select: {
              id: true,
              deletedAt: true,
              estimate: {
                select: {
                  deletedAt: true,
                },
              },
            },
            orderBy: {
              diexCode: "asc",
            },
          }),
          prisma.serviceOrder.findMany({
            where: {
              projectId,
              archivedAt: {
                not: null,
              },
            },
            select: {
              id: true,
              deletedAt: true,
              estimate: {
                select: {
                  deletedAt: true,
                },
              },
              diexRequest: {
                select: {
                  deletedAt: true,
                },
              },
            },
            orderBy: {
              serviceOrderCode: "asc",
            },
          }),
        ]);

      const taskIds = archivedTasks.filter((item) => !item.deletedAt).map((item) => item.id);
      const estimateIds = archivedEstimates
        .filter((item) => !item.deletedAt)
        .map((item) => item.id);
      const diexIds = archivedDiex
        .filter((item) => !item.deletedAt && !item.estimate.deletedAt)
        .map((item) => item.id);
      const serviceOrderIds = archivedServiceOrders
        .filter(
          (item) =>
            !item.deletedAt &&
            !item.estimate.deletedAt &&
            (!item.diexRequest || !item.diexRequest.deletedAt),
        )
        .map((item) => item.id);

      cascade.skipped.tasksDeleted = archivedTasks.length - taskIds.length;
      cascade.skipped.estimatesDeleted = archivedEstimates.length - estimateIds.length;
      cascade.skipped.diexDeleted =
        archivedDiex.length - diexIds.length;
      cascade.skipped.serviceOrdersDeleted =
        archivedServiceOrders.length - serviceOrderIds.length;

      for (const estimateId of estimateIds) {
        await estimatesService.restore(estimateId, user);
        cascade.restored.estimates += 1;
      }

      for (const taskId of taskIds) {
        await tasksService.restore(taskId, user);
        cascade.restored.tasks += 1;
      }

      for (const diexId of diexIds) {
        await diexService.restore(diexId, user);
        cascade.restored.diexRequests += 1;
      }

      for (const serviceOrderId of serviceOrderIds) {
        await serviceOrdersService.restore(serviceOrderId, user);
        cascade.restored.serviceOrders += 1;
      }

      project = await prisma.project.findUnique({
        where: { id: projectId },
        include: projectInclude,
      });

      if (!project) {
        throw new AppError("Projeto não encontrado", 404);
      }
    }

    return {
      message: "Projeto restaurado com sucesso",
      permissionUsed: "projects.restore" as const,
      cascadeApplied: Boolean(options.cascade),
      ...(options.cascade && { cascade }),
      project,
    };
  }

  async getTimeline(projectId: string, user: CurrentUser) {
    await this.ensureCanView(projectId, user);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        title: true,
      },
    });

    if (!project) {
      throw new AppError("Projeto nÃ£o encontrado", 404);
    }

    return this.buildUnifiedTimeline(project);
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
