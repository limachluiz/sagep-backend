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
import type { CommitmentNoteSnapshot } from "../financial-execution/portal-transparencia.client.js";
import {
  inferDeliveryUnit,
  parseDeliveryReportDraft,
  type DeliveryReportDraft,
} from "./delivery-report-draft.js";

type CurrentUser = {
  id: string;
  name?: string;
  email: string;
  role: string;
  permissions?: string[];
  rank?: string | null;
  cpf?: string | null;
};

type ProjectStageValue =
  | "ESTIMATIVA_PRECO"
  | "AGUARDANDO_NOTA_CREDITO"
  | "DIEX_REQUISITORIO"
  | "AGUARDANDO_NOTA_EMPENHO"
  | "OS_LIBERADA"
  | "AGUARDANDO_OS_ASSINADA"
  | "AGUARDANDO_INICIO_EXECUCAO"
  | "SERVICO_EM_EXECUCAO"
  | "ANALISANDO_AS_BUILT"
  | "ATESTAR_NF"
  | "ENTREGA_TECNICA"
  | "SERVICO_CONCLUIDO"
  | "CANCELADO";

type ProjectTypeValue = "CFTV" | "FIBRA_OPTICA_PONTO_LOGICO";

type CreateProjectInput = {
  title: string;
  description?: string;
  projectType?: ProjectTypeValue;
  omId?: string;
  startDate?: Date;
  endDate?: Date;
};

type UpdateProjectInput = {
  title?: string;
  description?: string;
  projectType?: ProjectTypeValue;
  omId?: string;
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

type ReviewAsBuiltInput =
  | {
      approved: true;
      reviewedAt: Date;
      asBuiltLink: string;
    }
  | {
      approved: false;
      reviewedAt: Date;
      rejectionReason: string;
    };

type RegisterSignedServiceOrderInput = {
  signedServiceOrderLink: string;
  signedServiceOrderReceivedAt: Date;
  signedServiceOrderNotes?: string;
};

type RegisterDeliveryReportSignatureInput = { signedAt: Date; signedLink?: string };

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
  om: {
    select: {
      id: true,
      omCode: true,
      sigla: true,
      name: true,
      cityName: true,
      stateUf: true,
      isActive: true,
    },
  },
  owner: {
    select: {
      id: true,
      userCode: true,
      name: true,
      avatarDataUrl: true,
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
  private async validateProjectClassification(projectType?: ProjectTypeValue | null, omId?: string | null) {
    if (!projectType && !omId) return null;

    if (!projectType || !omId) {
      throw new AppError("Informe o tipo do projeto e a OM de destino", 400);
    }

    const om = await prisma.militaryOrganization.findUnique({
      where: { id: omId },
      select: {
        id: true,
        sigla: true,
        cityName: true,
        stateUf: true,
        isActive: true,
      },
    });

    if (!om) {
      throw new AppError("OM não encontrada", 404);
    }

    if (!om.isActive) {
      throw new AppError("Não é possível vincular uma OM inativa ao projeto", 409);
    }

    if (projectType === "CFTV" && (om.stateUf !== "AM" || om.cityName.trim().toLocaleLowerCase("pt-BR") !== "manaus")) {
      throw new AppError("Projetos de CFTV estão restritos às OMs de Manaus/AM", 400);
    }

    return om;
  }

  async kanban(
    filters: {
      ownerId?: string;
      stage?: ProjectStageValue;
      projectType?: ProjectTypeValue;
      omId?: string;
      stateUf?: "AM" | "RO" | "RR" | "AC";
      search?: string;
      onlyMine?: boolean;
    },
    user: CurrentUser,
  ) {
    const where: Prisma.ProjectWhereInput = {
      archivedAt: null,
      deletedAt: null,
      ...(filters.ownerId && { ownerId: filters.ownerId }),
      ...(filters.onlyMine && { ownerId: user.id }),
      ...(filters.stage && { stage: filters.stage }),
      ...(filters.projectType && { projectType: filters.projectType }),
      ...(filters.omId && { omId: filters.omId }),
      ...(filters.stateUf && { om: { stateUf: filters.stateUf } }),
      ...(filters.search && {
        OR: [
          { title: { contains: filters.search, mode: "insensitive" } },
          { description: { contains: filters.search, mode: "insensitive" } },
        ],
      }),
      ...(!this.isPrivileged(user) && {
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
      }),
    };
    const projects = await prisma.project.findMany({
      where,
      orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
      include: {
        owner: { select: { id: true, name: true, avatarDataUrl: true, email: true } },
        om: { select: { id: true, sigla: true, cityName: true, stateUf: true } },
        serviceOrders: {
          where: { archivedAt: null, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, serviceOrderNumber: true, plannedEndDate: true },
        },
      },
    });
    const labels: Record<ProjectStageValue, string> = {
      ESTIMATIVA_PRECO: "Estimativa de preço", AGUARDANDO_NOTA_CREDITO: "Aguardando nota de crédito",
      DIEX_REQUISITORIO: "DIEx requisitório", AGUARDANDO_NOTA_EMPENHO: "Aguardando nota de empenho",
      OS_LIBERADA: "OS liberada",
      AGUARDANDO_OS_ASSINADA: "Aguardando OS assinada",
      AGUARDANDO_INICIO_EXECUCAO: "Aguardando início da execução",
      SERVICO_EM_EXECUCAO: "Serviço em execução",
      ANALISANDO_AS_BUILT: "Analisando As-Built", ATESTAR_NF: "Atestar NF",
      ENTREGA_TECNICA: "Entrega técnica",
      SERVICO_CONCLUIDO: "Serviço concluído", CANCELADO: "Cancelado",
    };
    return {
      generatedAt: new Date().toISOString(),
      columns: (Object.keys(labels) as ProjectStageValue[]).map((stage) => {
        const cards = projects.filter((project) => project.stage === stage).map((project) => {
          const os = project.serviceOrders[0];
          return {
            id: project.id, projectCode: project.projectCode, title: project.title,
            status: project.status, stage: project.stage, projectType: project.projectType,
            om: project.om, owner: project.owner,
            updatedAt: project.updatedAt, plannedEndDate: os?.plannedEndDate ?? project.endDate,
            serviceOrder: os ?? null,
          };
        });
        return { stage, label: labels[stage], count: cards.length, cards };
      }),
    };
  }
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
    return Boolean(
      includeArchived &&
      (permissionsService.hasPermission(user, "projects.restore") ||
        permissionsService.hasPermission(user, "projects.delete")),
    );
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
    const canAccessArchived =
      permissionsService.hasPermission(user, "projects.restore") ||
      permissionsService.hasPermission(user, "projects.delete");
    const requestsArchived = Boolean(
      filters.includeArchived ||
      filters.onlyArchived ||
      filters.archivedFrom ||
      filters.archivedUntil,
    );
    const requestsDeleted = Boolean(filters.includeDeleted || filters.onlyDeleted);

    if (requestsArchived && !canAccessArchived) {
      throw new AppError("Você não tem permissão para consultar projetos arquivados", 403);
    }

    if (requestsDeleted && !this.isAdmin(user.role)) {
      throw new AppError("Apenas ADMIN pode consultar projetos excluídos", 403);
    }

    if (filters.onlyArchived && filters.onlyDeleted) {
      throw new AppError("Use onlyArchived ou onlyDeleted, não ambos", 400);
    }

    return {
      includeArchived: Boolean(filters.includeArchived && canAccessArchived),
      onlyArchived: Boolean(filters.onlyArchived && canAccessArchived),
      includeDeleted: Boolean(filters.includeDeleted && this.isAdmin(user.role)),
      onlyDeleted: Boolean(filters.onlyDeleted && this.isAdmin(user.role)),
    };
  }

  private isPrivileged(user: CurrentUser) {
    return permissionsService.hasPermission(user, "projects.view_all");
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

    if (this.isPrivileged(user)) {
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

    if (this.isPrivileged(user)) {
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
    projectType?: ProjectTypeValue | null;
    omId?: string | null;
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
    serviceOrderSignatureRequired?: boolean;
    signedServiceOrderLink?: string | null;
    signedServiceOrderReceivedAt?: Date | null;
    signedServiceOrderNotes?: string | null;
    signedServiceOrderRegisteredById?: string | null;
    executionStartedAt?: Date | null;
    asBuiltReceivedAt?: Date | null;
    asBuiltReviewedAt?: Date | null;
    asBuiltApprovedAt?: Date | null;
    asBuiltLink?: string | null;
    asBuiltRejectedAt?: Date | null;
    asBuiltRejectionReason?: string | null;
    invoiceAttestedAt?: Date | null;
    serviceCompletedAt?: Date | null;
    deliveryReportGeneratedAt?: Date | null;
    deliveryReportSignedAt?: Date | null;
  }) {
    return {
      id: project.id,
      projectCode: project.projectCode ?? null,
      title: project.title ?? null,
      description: project.description ?? null,
      projectType: project.projectType ?? null,
      omId: project.omId ?? null,
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
      serviceOrderSignatureRequired: project.serviceOrderSignatureRequired ?? false,
      signedServiceOrderLink: project.signedServiceOrderLink ?? null,
      signedServiceOrderReceivedAt: project.signedServiceOrderReceivedAt ?? null,
      signedServiceOrderNotes: project.signedServiceOrderNotes ?? null,
      signedServiceOrderRegisteredById:
        project.signedServiceOrderRegisteredById ?? null,
      executionStartedAt: project.executionStartedAt ?? null,
      asBuiltReceivedAt: project.asBuiltReceivedAt ?? null,
      asBuiltReviewedAt: project.asBuiltReviewedAt ?? null,
      asBuiltApprovedAt: project.asBuiltApprovedAt ?? null,
      asBuiltLink: project.asBuiltLink ?? null,
      asBuiltRejectedAt: project.asBuiltRejectedAt ?? null,
      asBuiltRejectionReason: project.asBuiltRejectionReason ?? null,
      invoiceAttestedAt: project.invoiceAttestedAt ?? null,
      serviceCompletedAt: project.serviceCompletedAt ?? null,
      deliveryReportGeneratedAt: project.deliveryReportGeneratedAt ?? null,
      deliveryReportSignedAt: project.deliveryReportSignedAt ?? null,
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
    serviceOrderSignatureRequired?: boolean;
    signedServiceOrderLink?: string | null;
    signedServiceOrderReceivedAt?: Date | null;
    executionStartedAt?: Date | null;
    asBuiltReceivedAt?: Date | null;
    asBuiltReviewedAt?: Date | null;
    asBuiltApprovedAt?: Date | null;
    asBuiltLink?: string | null;
    asBuiltRejectedAt?: Date | null;
    asBuiltRejectionReason?: string | null;
    invoiceAttestedAt?: Date | null;
    serviceCompletedAt?: Date | null;
    deliveryReportGeneratedAt?: Date | null;
    deliveryReportSignedAt?: Date | null;
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
      serviceOrderSignatureRequired: project.serviceOrderSignatureRequired ?? false,
      signedServiceOrderLink: project.signedServiceOrderLink ?? null,
      signedServiceOrderReceivedAt: project.signedServiceOrderReceivedAt ?? null,
      executionStartedAt: project.executionStartedAt ?? null,
      asBuiltReceivedAt: project.asBuiltReceivedAt ?? null,
      asBuiltReviewedAt: project.asBuiltReviewedAt ?? null,
      asBuiltApprovedAt: project.asBuiltApprovedAt ?? null,
      asBuiltLink: project.asBuiltLink ?? null,
      asBuiltRejectedAt: project.asBuiltRejectedAt ?? null,
      asBuiltRejectionReason: project.asBuiltRejectionReason ?? null,
      invoiceAttestedAt: project.invoiceAttestedAt ?? null,
      serviceCompletedAt: project.serviceCompletedAt ?? null,
      deliveryReportGeneratedAt: project.deliveryReportGeneratedAt ?? null,
      deliveryReportSignedAt: project.deliveryReportSignedAt ?? null,
    };
  }

  private amountToNumber(value: { toString(): string } | string | number | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private getAsBuiltLink(project: object) {
    return (project as { asBuiltLink?: string | null }).asBuiltLink ?? null;
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
    serviceOrderSignatureRequired?: boolean;
    signedServiceOrderLink?: string | null;
    signedServiceOrderReceivedAt?: Date | null;
    executionStartedAt?: Date | null;
    asBuiltReceivedAt?: Date | null;
    asBuiltReviewedAt?: Date | null;
    asBuiltApprovedAt?: Date | null;
    asBuiltRejectedAt?: Date | null;
    asBuiltRejectionReason?: string | null;
    invoiceAttestedAt?: Date | null;
    serviceCompletedAt?: Date | null;
    deliveryReportGeneratedAt?: Date | null;
    deliveryReportSignedAt?: Date | null;
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
      project.stage === "AGUARDANDO_OS_ASSINADA" &&
      project.serviceOrderSignatureRequired &&
      (!project.signedServiceOrderLink || !project.signedServiceOrderReceivedAt)
    ) {
      pendingActions.push({
        code: "REGISTRAR_OS_ASSINADA",
        label: "Registrar recebimento da OS assinada",
        severity: "BLOCKER",
        targetStage: "AGUARDANDO_INICIO_EXECUCAO",
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

    if (
      (project.stage === "OS_LIBERADA" ||
        project.stage === "AGUARDANDO_INICIO_EXECUCAO") &&
      project.serviceOrders.length > 0 &&
      !project.executionStartedAt
    ) {
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

    if (project.stage === "ANALISANDO_AS_BUILT") {
      pendingActions.push({
        code: "VALIDAR_AS_BUILT",
        label: "Validar As-Built",
        severity: "BLOCKER",
        targetStage: "ATESTAR_NF",
      });
    }

    if (project.stage === "ATESTAR_NF") {
      if (!project.invoiceAttestedAt) {
        pendingActions.push({
          code: "ATESTAR_NF",
          label: "Registrar atesto da NF",
          severity: "BLOCKER",
          targetStage: "ENTREGA_TECNICA",
        });
      }

      if (!project.serviceCompletedAt) {
        pendingActions.push({
          code: "CONCLUIR_SERVICO",
          label: "Registrar conclusão do serviço",
          severity: "BLOCKER",
          targetStage: "ENTREGA_TECNICA",
        });
      }
    }

    if (project.stage === "ENTREGA_TECNICA") {
      if (!project.deliveryReportGeneratedAt) {
        pendingActions.push({ code: "GERAR_RELATORIO_ENTREGA", label: "Gerar relatório técnico de entrega", severity: "BLOCKER", targetStage: "ENTREGA_TECNICA" });
      } else if (!project.deliveryReportSignedAt) {
        pendingActions.push({ code: "REGISTRAR_RELATORIO_ASSINADO", label: "Confirmar revisão e assinatura do relatório", severity: "BLOCKER", targetStage: "ENTREGA_TECNICA" });
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

  private toPublicTimelineItem(item: Awaited<ReturnType<typeof auditService.listTimelineForEntities>>[number]) {
    return {
      id: item.id,
      at: item.at,
      entityType: item.entityType,
      entityId: item.entityId,
      action: item.action,
      label: item.label,
      actorName: item.actorName,
      summary: item.summary,
      source: item.source,
      context: item.context ?? null,
    };
  }

  async create(data: CreateProjectInput, user: CurrentUser) {
    await this.validateProjectClassification(data.projectType, data.omId);

    const project = await prisma.project.create({
      data: {
        title: data.title,
        description: data.description,
        projectType: data.projectType,
        omId: data.omId,
        status: workflowService.getMacroStatusFromStage("ESTIMATIVA_PRECO"),
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
        projectType: project.projectType,
        omId: project.omId,
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

    if (!this.isPrivileged(user)) {
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
        om: {
          select: {
            id: true,
            omCode: true,
            sigla: true,
            name: true,
            cityName: true,
            stateUf: true,
            isActive: true,
          },
        },
        owner: {
          select: {
            id: true,
            userCode: true,
            name: true,
            avatarDataUrl: true,
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
                avatarDataUrl: true,
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
                avatarDataUrl: true,
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
        projectType: true,
        omId: true,
        om: {
          select: {
            id: true,
            omCode: true,
            sigla: true,
            name: true,
            cityName: true,
            stateUf: true,
            isActive: true,
          },
        },
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
        serviceOrderSignatureRequired: true,
        signedServiceOrderLink: true,
        signedServiceOrderReceivedAt: true,
        signedServiceOrderNotes: true,
        signedServiceOrderRegisteredById: true,
        signedServiceOrderRegisteredBy: {
          select: {
            id: true,
            userCode: true,
            name: true,
            avatarDataUrl: true,
            email: true,
            role: true,
          },
        },
        executionStartedAt: true,
        asBuiltReceivedAt: true,
        asBuiltReviewedAt: true,
        asBuiltApprovedAt: true,
        asBuiltLink: true,
        asBuiltRejectedAt: true,
        asBuiltRejectionReason: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
        deliveryReportGeneratedAt: true,
        deliveryReportSignedAt: true,
        deliveryReportSignedLink: true,
        archivedAt: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            userCode: true,
            name: true,
            avatarDataUrl: true,
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
                avatarDataUrl: true,
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
            createdAt: true,
            updatedAt: true,
            assignee: {
              select: {
                id: true,
                userCode: true,
                name: true,
                avatarDataUrl: true,
                email: true,
                role: true,
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
      throw new AppError("Projeto não encontrado", 404);
    }

    const workflowSnapshot = this.buildWorkflowSnapshot(project);
    const validDeliveryReportSignedAt = workflowService.isDeliveryReportSignatureValid(workflowSnapshot)
      ? project.deliveryReportSignedAt
      : null;
    const effectiveWorkflowSnapshot = { ...workflowSnapshot, deliveryReportSignedAt: validDeliveryReportSignedAt };
    const nextAction = workflowService.getNextAction(effectiveWorkflowSnapshot);
    const auditTrail = await this.buildUnifiedTimeline(project);
    const canViewAudit = permissionsService.hasPermission(user, "audit.view");
    const timeline = auditTrail.map((item) => this.toPublicTimelineItem(item));
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
        projectType: project.projectType,
        omId: project.omId,
        om: project.om,
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
          signedServiceOrderLink: project.signedServiceOrderLink,
          signedServiceOrderReceivedAt: project.signedServiceOrderReceivedAt,
          executionStartedAt: project.executionStartedAt,
          asBuiltReceivedAt: project.asBuiltReceivedAt,
          asBuiltReviewedAt: project.asBuiltReviewedAt,
          asBuiltApprovedAt: project.asBuiltApprovedAt,
          asBuiltLink: project.asBuiltLink,
          asBuiltRejectedAt: project.asBuiltRejectedAt,
          asBuiltRejectionReason: project.asBuiltRejectionReason,
          invoiceAttestedAt: project.invoiceAttestedAt,
          serviceCompletedAt: project.serviceCompletedAt,
          deliveryReportGeneratedAt: project.deliveryReportGeneratedAt,
          deliveryReportSignedAt: validDeliveryReportSignedAt,
          deliveryReportSignedLink: project.deliveryReportSignedLink,
        },
        serviceOrderSignature: {
          required: project.serviceOrderSignatureRequired,
          link: project.signedServiceOrderLink,
          receivedAt: project.signedServiceOrderReceivedAt,
          notes: project.signedServiceOrderNotes,
          registeredBy: project.signedServiceOrderRegisteredBy,
        },
      },
      pendingActions: this.buildPendingActions({ ...project, deliveryReportSignedAt: validDeliveryReportSignedAt }),
      timeline,
      auditTrail: canViewAudit ? auditTrail : null,
      tasks: project.tasks,
      documents: {
        estimates: project.estimates,
        diexRequests: project.diexRequests,
        serviceOrders: project.serviceOrders,
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
        om: {
          select: {
            id: true,
            omCode: true,
            sigla: true,
            name: true,
            cityName: true,
            stateUf: true,
            isActive: true,
          },
        },
        owner: {
          select: {
            id: true,
            userCode: true,
            name: true,
            avatarDataUrl: true,
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
                avatarDataUrl: true,
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
                avatarDataUrl: true,
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
        projectType: true,
        omId: true,
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
        serviceOrderSignatureRequired: true,
        signedServiceOrderLink: true,
        signedServiceOrderReceivedAt: true,
        signedServiceOrderNotes: true,
        signedServiceOrderRegisteredById: true,
        executionStartedAt: true,
        asBuiltReceivedAt: true,
        asBuiltReviewedAt: true,
        asBuiltApprovedAt: true,
        asBuiltLink: true,
        asBuiltRejectedAt: true,
        asBuiltRejectionReason: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
        deliveryReportGeneratedAt: true,
        deliveryReportSignedAt: true,
        deliveryReportSignedLink: true,
      },
    });

    if (!before) {
      throw new AppError("Projeto não encontrado", 404);
    }

    if (data.projectType !== undefined || data.omId !== undefined) {
      await this.validateProjectClassification(
        data.projectType ?? before.projectType,
        data.omId ?? before.omId,
      );
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.projectType !== undefined && { projectType: data.projectType }),
        ...(data.omId !== undefined && { omId: data.omId }),
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
        projectType: project.projectType,
        omId: project.omId,
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
        asBuiltReviewedAt: project.asBuiltReviewedAt,
        asBuiltApprovedAt: project.asBuiltApprovedAt,
        asBuiltRejectedAt: project.asBuiltRejectedAt,
        asBuiltRejectionReason: project.asBuiltRejectionReason,
        invoiceAttestedAt: project.invoiceAttestedAt,
        serviceCompletedAt: project.serviceCompletedAt,
      }),
    });

    return project;
  }
  
  async updateFlow(
    projectId: string,
    data: UpdateProjectFlowInput,
    user: CurrentUser,
    options?: {
      commitmentNoteSnapshot?: CommitmentNoteSnapshot;
      commitmentNoteSyncStatus?: "VALIDADO" | "DIVERGENTE" | "NAO_VALIDADO";
      commitmentNoteDivergenceReason?: string | null;
    },
  ) {
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
        serviceOrderSignatureRequired: true,
        signedServiceOrderLink: true,
        signedServiceOrderReceivedAt: true,
        signedServiceOrderNotes: true,
        signedServiceOrderRegisteredById: true,
        executionStartedAt: true,
        asBuiltReceivedAt: true,
        asBuiltReviewedAt: true,
        asBuiltApprovedAt: true,
        asBuiltLink: true,
        asBuiltRejectedAt: true,
        asBuiltRejectionReason: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
        deliveryReportGeneratedAt: true,
        deliveryReportSignedAt: true,
        deliveryReportSignedLink: true,
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

    if (
      currentProject.stage === "ANALISANDO_AS_BUILT" &&
      (data.stage === "ATESTAR_NF" || data.stage === "SERVICO_EM_EXECUCAO")
    ) {
      throw new AppError(
        "Use o endpoint de revisão do As-Built para aprovar ou reprovar esta etapa",
        409,
      );
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
      serviceOrderSignatureRequired: currentProject.serviceOrderSignatureRequired,
      signedServiceOrderLink: currentProject.signedServiceOrderLink,
      signedServiceOrderReceivedAt: currentProject.signedServiceOrderReceivedAt,
      executionStartedAt: data.executionStartedAt ?? currentProject.executionStartedAt,
      asBuiltReceivedAt: data.asBuiltReceivedAt ?? currentProject.asBuiltReceivedAt,
      asBuiltReviewedAt: currentProject.asBuiltReviewedAt,
      asBuiltApprovedAt: currentProject.asBuiltApprovedAt,
      asBuiltLink: this.getAsBuiltLink(currentProject),
      asBuiltRejectedAt: currentProject.asBuiltRejectedAt,
      asBuiltRejectionReason: currentProject.asBuiltRejectionReason,
      invoiceAttestedAt: data.invoiceAttestedAt ?? currentProject.invoiceAttestedAt,
      serviceCompletedAt: data.serviceCompletedAt ?? currentProject.serviceCompletedAt,
      deliveryReportGeneratedAt: currentProject.deliveryReportGeneratedAt,
      deliveryReportSignedAt: currentProject.deliveryReportSignedAt,
    };
    const effectiveCurrentStage =
      currentProject.stage === "DIEX_REQUISITORIO" &&
      (!!currentProject.diexNumber || !!currentProject.diexIssuedAt)
        ? "AGUARDANDO_NOTA_EMPENHO"
        : currentProject.stage;
    const hasCommitmentNote =
      !!nextSnapshot.commitmentNoteNumber || !!nextSnapshot.commitmentNoteReceivedAt;
    const targetStage =
      effectiveCurrentStage === "AGUARDANDO_NOTA_EMPENHO" &&
      data.stage === "AGUARDANDO_NOTA_EMPENHO" &&
      hasCommitmentNote
        ? "OS_LIBERADA"
        : data.stage;
    const isFirstCommitmentNoteRegistration =
      !currentProject.commitmentNoteNumber &&
      !currentProject.commitmentNoteReceivedAt &&
      (!!nextSnapshot.commitmentNoteNumber || !!nextSnapshot.commitmentNoteReceivedAt);

    workflowService.assertStageTransition(effectiveCurrentStage, targetStage);
    workflowService.validateStageRequirements(
      targetStage,
      this.buildWorkflowSnapshot({
        id: currentProject.id,
        projectCode: currentProject.projectCode,
        stage: targetStage,
        ...nextSnapshot,
      }),
      finalizedEstimateCount,
    );

    const project = await prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({
        where: { id: projectId },
        data: {
          stage: targetStage,
          status: workflowService.getMacroStatusFromStage(targetStage),
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

      if (options?.commitmentNoteSnapshot) {
        const snapshot = options.commitmentNoteSnapshot;
        await tx.commitmentNote.updateMany({
          where: {
            projectId,
            active: true,
            externalCode: { not: snapshot.externalCode },
          },
          data: { active: false },
        });

        const commitmentNote = await tx.commitmentNote.upsert({
          where: { externalCode: snapshot.externalCode },
          create: {
            projectId,
            number: snapshot.number,
            externalCode: snapshot.externalCode,
            managementUnit: snapshot.managementUnit,
            management: snapshot.management,
            source: snapshot.source,
            supplierName: snapshot.supplierName,
            supplierCnpj: snapshot.supplierCnpj,
            issuedAt: snapshot.issuedAt,
            originalAmount: snapshot.originalAmount,
            currentAmount: snapshot.currentAmount,
            liquidatedAmount: snapshot.liquidatedAmount,
            paidAmount: snapshot.paidAmount,
            cancelledAmount: snapshot.cancelledAmount,
            financialStatus: snapshot.financialStatus,
            syncStatus: options.commitmentNoteSyncStatus ?? "VALIDADO",
            divergenceReason: options.commitmentNoteDivergenceReason,
            rawSnapshot: snapshot.rawSnapshot as Prisma.InputJsonValue,
            lastSyncAt: snapshot.fetchedAt,
            active: true,
          },
          update: {
            projectId,
            number: snapshot.number,
            supplierName: snapshot.supplierName,
            supplierCnpj: snapshot.supplierCnpj,
            issuedAt: snapshot.issuedAt,
            originalAmount: snapshot.originalAmount,
            currentAmount: snapshot.currentAmount,
            liquidatedAmount: snapshot.liquidatedAmount,
            paidAmount: snapshot.paidAmount,
            cancelledAmount: snapshot.cancelledAmount,
            financialStatus: snapshot.financialStatus,
            syncStatus: options.commitmentNoteSyncStatus ?? "VALIDADO",
            divergenceReason: options.commitmentNoteDivergenceReason,
            rawSnapshot: snapshot.rawSnapshot as Prisma.InputJsonValue,
            lastSyncAt: snapshot.fetchedAt,
            lastSyncError: null,
            active: true,
          },
        });

        await tx.financialDocument.deleteMany({ where: { commitmentNoteId: commitmentNote.id } });
        if (snapshot.documents.length) {
          await tx.financialDocument.createMany({
            data: snapshot.documents.map((document) => ({
              commitmentNoteId: commitmentNote.id,
              externalCode: document.externalCode,
              number: document.number,
              phase: document.phase,
              species: document.species,
              issuedAt: document.issuedAt,
              amount: document.amount,
              supplierName: document.supplierName,
              supplierCnpj: document.supplierCnpj,
              rawSnapshot: document.rawSnapshot as Prisma.InputJsonValue,
            })),
          });
        }
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
      asBuiltReviewedAt: project.asBuiltReviewedAt,
      asBuiltApprovedAt: project.asBuiltApprovedAt,
      asBuiltLink: this.getAsBuiltLink(project),
      asBuiltRejectedAt: project.asBuiltRejectedAt,
      asBuiltRejectionReason: project.asBuiltRejectionReason,
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
            asBuiltReviewedAt: project.asBuiltReviewedAt,
            asBuiltApprovedAt: project.asBuiltApprovedAt,
            asBuiltLink: this.getAsBuiltLink(project),
            asBuiltRejectedAt: project.asBuiltRejectedAt,
            asBuiltRejectionReason: project.asBuiltRejectionReason,
            invoiceAttestedAt: project.invoiceAttestedAt,
            serviceCompletedAt: project.serviceCompletedAt,
          }),
        ).code,
      },
    });

    return project;
  }

  async registerSignedServiceOrder(
    projectId: string,
    data: RegisterSignedServiceOrderInput,
    user: CurrentUser,
  ) {
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
        serviceOrderSignatureRequired: true,
        signedServiceOrderLink: true,
        signedServiceOrderReceivedAt: true,
        signedServiceOrderNotes: true,
        signedServiceOrderRegisteredById: true,
        executionStartedAt: true,
        asBuiltReceivedAt: true,
        asBuiltReviewedAt: true,
        asBuiltApprovedAt: true,
        asBuiltLink: true,
        asBuiltRejectedAt: true,
        asBuiltRejectionReason: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
        serviceOrders: {
          where: { archivedAt: null, deletedAt: null },
          select: { id: true, issuedAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!currentProject) {
      throw new AppError("Projeto não encontrado", 404);
    }

    if (currentProject.stage !== "AGUARDANDO_OS_ASSINADA") {
      throw new AppError(
        "A OS assinada só pode ser registrada quando o projeto estiver aguardando sua devolução",
        409,
      );
    }

    const activeServiceOrder = currentProject.serviceOrders[0];
    if (!activeServiceOrder) {
      throw new AppError("O projeto não possui Ordem de Serviço ativa", 409);
    }

    if (data.signedServiceOrderReceivedAt < activeServiceOrder.issuedAt) {
      throw new AppError(
        "A data de recebimento da OS assinada não pode ser anterior à emissão",
        400,
      );
    }

    if (data.signedServiceOrderReceivedAt > new Date()) {
      throw new AppError(
        "A data de recebimento da OS assinada não pode estar no futuro",
        400,
      );
    }

    const targetStage = "AGUARDANDO_INICIO_EXECUCAO" as const;
    workflowService.assertStageTransition(currentProject.stage, targetStage);
    const finalizedEstimateCount = await prisma.estimate.count({
      where: {
        projectId,
        status: "FINALIZADA",
        archivedAt: null,
        deletedAt: null,
      },
    });
    workflowService.validateStageRequirements(
      targetStage,
      this.buildWorkflowSnapshot({
        ...currentProject,
        stage: targetStage,
        signedServiceOrderLink: data.signedServiceOrderLink.trim(),
        signedServiceOrderReceivedAt: data.signedServiceOrderReceivedAt,
      }),
      finalizedEstimateCount,
    );

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        stage: targetStage,
        status: workflowService.getMacroStatusFromStage(targetStage),
        signedServiceOrderLink: data.signedServiceOrderLink.trim(),
        signedServiceOrderReceivedAt: data.signedServiceOrderReceivedAt,
        signedServiceOrderNotes: data.signedServiceOrderNotes?.trim() || null,
        signedServiceOrderRegisteredById: user.id,
      },
      include: projectInclude,
    });

    const beforeSnapshot = this.buildProjectAuditSnapshot(currentProject);
    const afterSnapshot = this.buildProjectAuditSnapshot(project);

    await auditService.log({
      entityType: "SERVICE_ORDER",
      entityId: activeServiceOrder.id,
      action: "UPDATE",
      actor: this.getAuditActor(user),
      summary: `OS do projeto PRJ-${project.projectCode} recebida assinada pela contratada`,
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: {
        source: "project.service-order.signature",
        projectId,
        receivedAt: data.signedServiceOrderReceivedAt,
        signedServiceOrderLink: data.signedServiceOrderLink.trim(),
        notes: data.signedServiceOrderNotes?.trim() || null,
      },
    });

    await auditService.log({
      entityType: "PROJECT",
      entityId: project.id,
      action: "STAGE_CHANGE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${project.projectCode} liberado para início após recebimento da OS assinada`,
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: {
        source: "project.service-order.signature",
        previousStage: currentProject.stage,
        newStage: project.stage,
        serviceOrderId: activeServiceOrder.id,
        nextActionCode: "INICIAR_EXECUCAO",
      },
    });

    return project;
  }

  async registerDeliveryReportSignature(projectId: string, data: RegisterDeliveryReportSignatureInput, user: CurrentUser) {
    await this.ensureCanManage(projectId, user);
    const current = await prisma.project.findUnique({ where: { id: projectId } });
    if (!current) throw new AppError("Projeto não encontrado", 404);
    if (current.stage !== "ENTREGA_TECNICA") throw new AppError("A assinatura do relatório só pode ser registrada na etapa de Entrega Técnica", 409);
    if (!current.deliveryReportGeneratedAt) throw new AppError("Gere o relatório antes de registrar sua assinatura", 409);
    if (data.signedAt > new Date()) throw new AppError("A data da assinatura não pode estar no futuro", 400);
    const generatedDay = new Date(current.deliveryReportGeneratedAt); generatedDay.setUTCHours(0, 0, 0, 0);
    const signedDay = new Date(data.signedAt); signedDay.setUTCHours(0, 0, 0, 0);
    if (signedDay < generatedDay) throw new AppError("A assinatura não pode ser anterior à geração do relatório", 400);
    const project = await prisma.project.update({ where: { id: projectId }, data: { deliveryReportSignedAt: data.signedAt, deliveryReportSignedLink: data.signedLink?.trim() || null }, include: projectInclude });
    await auditService.log({ entityType: "PROJECT", entityId: projectId, action: "UPDATE", actor: this.getAuditActor(user), summary: `Relatório de entrega do projeto PRJ-${project.projectCode} revisado e assinado`, before: this.buildProjectAuditSnapshot(current), after: this.buildProjectAuditSnapshot(project), metadata: { source: "project.delivery-report.signature", signedAt: data.signedAt, signedLink: data.signedLink ?? null } });
    return project;
  }

  async getDeliveryReportDraft(projectId: string, user: CurrentUser) {
    await this.ensureCanView(projectId, user);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        title: true,
        description: true,
        projectType: true,
        deliveryReportDraft: true,
        estimates: {
          where: { status: "FINALIZADA", archivedAt: null, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { items: { orderBy: { referenceCode: "asc" }, select: { id: true, referenceCode: true, description: true, unit: true, quantity: true, subtotal: true } } },
        },
        serviceOrders: {
          where: { archivedAt: null, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { items: { orderBy: { itemCode: "asc" }, select: { estimateItemId: true, itemCode: true, description: true, supplyUnit: true, quantityOrdered: true, totalPrice: true } } },
        },
      },
    });
    if (!project) throw new AppError("Projeto não encontrado", 404);

    const sourceItems = project.serviceOrders[0]?.items.length
      ? project.serviceOrders[0].items.map((item) => ({
        itemId: item.estimateItemId,
        itemCode: item.itemCode,
        description: item.description,
        sourceUnit: item.supplyUnit,
        sourceQuantity: item.quantityOrdered.toString(),
        totalPrice: item.totalPrice.toString(),
      }))
      : (project.estimates[0]?.items ?? []).map((item) => ({
        itemId: item.id,
        itemCode: item.referenceCode,
        description: item.description,
        sourceUnit: item.unit,
        sourceQuantity: item.quantity.toString(),
        totalPrice: item.subtotal.toString(),
      }));
    const draft = parseDeliveryReportDraft(project.deliveryReportDraft, project.projectType);
    const details = new Map(draft.itemDetails.map((item) => [item.itemId, item]));
    const itemDetails = sourceItems.map((item) => details.get(item.itemId) ?? {
      itemId: item.itemId,
      unit: inferDeliveryUnit(item.description, item.sourceUnit),
      quantity: item.sourceQuantity,
      technicalDescription: "",
    });
    if (!project.deliveryReportDraft && project.description) {
      const purpose = draft.sections.find((section) => section.key === "purpose-scope");
      if (purpose) purpose.content = project.description;
    }
    return {
      project: { id: project.id, projectCode: project.projectCode, title: project.title, projectType: project.projectType },
      draft: { ...draft, itemDetails },
      items: sourceItems,
      readiness: {
        sectionsIncluded: draft.sections.filter((section) => section.included).length,
        sectionsReviewed: draft.sections.filter((section) => section.included && section.reviewed && section.content.trim()).length,
        itemsDocumented: itemDetails.filter((item) => item.technicalDescription.trim()).length,
        totalItems: itemDetails.length,
      },
    };
  }

  async updateDeliveryReportDraft(projectId: string, draft: DeliveryReportDraft, user: CurrentUser) {
    await this.ensureCanManage(projectId, user);
    const current = await prisma.project.findUnique({ where: { id: projectId }, select: { projectCode: true, stage: true, deliveryReportDraft: true } });
    if (!current) throw new AppError("Projeto não encontrado", 404);
    if (current.stage !== "ENTREGA_TECNICA") throw new AppError("A memória técnica só pode ser alterada durante a etapa de Entrega Técnica", 409, "DELIVERY_REPORT_DRAFT_LOCKED");
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        deliveryReportDraft: draft as unknown as Prisma.InputJsonValue,
        deliveryReportGeneratedAt: null,
        deliveryReportSignedAt: null,
        deliveryReportSignedLink: null,
      },
      select: { deliveryReportDraft: true },
    });
    await auditService.log({
      entityType: "PROJECT",
      entityId: projectId,
      action: "UPDATE",
      actor: this.getAuditActor(user),
      summary: `Memória técnica do relatório PRJ-${current.projectCode} atualizada`,
      before: { deliveryReportDraft: current.deliveryReportDraft ? JSON.stringify(current.deliveryReportDraft) : null },
      after: { deliveryReportDraft: updated.deliveryReportDraft ? JSON.stringify(updated.deliveryReportDraft) : null },
      metadata: { source: "project.delivery-report.draft", generatedReportInvalidated: true },
    });
    return this.getDeliveryReportDraft(projectId, user);
  }

  async reviewAsBuilt(projectId: string, data: ReviewAsBuiltInput, user: CurrentUser) {
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
        asBuiltReviewedAt: true,
        asBuiltApprovedAt: true,
        asBuiltRejectedAt: true,
        asBuiltRejectionReason: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
      },
    });

    if (!currentProject) {
      throw new AppError("Projeto não encontrado", 404);
    }

    if (currentProject.stage !== "ANALISANDO_AS_BUILT") {
      throw new AppError(
        "O As-Built só pode ser validado quando o projeto estiver em ANALISANDO_AS_BUILT",
        409,
      );
    }

    if (!currentProject.asBuiltReceivedAt) {
      throw new AppError(
        "O projeto não possui As-Built recebido para análise",
        409,
      );
    }

    const targetStage = data.approved ? "ATESTAR_NF" : "SERVICO_EM_EXECUCAO";
    const reviewedAt = data.reviewedAt;
    const rejectionReason = data.approved ? null : data.rejectionReason.trim();

    const finalizedEstimateCount = await prisma.estimate.count({
      where: {
        projectId,
        status: "FINALIZADA",
        archivedAt: null,
        deletedAt: null,
      },
    });

    const nextSnapshot = {
      creditNoteNumber: currentProject.creditNoteNumber,
      creditNoteReceivedAt: currentProject.creditNoteReceivedAt,
      diexNumber: currentProject.diexNumber,
      diexIssuedAt: currentProject.diexIssuedAt,
      commitmentNoteNumber: currentProject.commitmentNoteNumber,
      commitmentNoteReceivedAt: currentProject.commitmentNoteReceivedAt,
      serviceOrderNumber: currentProject.serviceOrderNumber,
      serviceOrderIssuedAt: currentProject.serviceOrderIssuedAt,
      executionStartedAt: currentProject.executionStartedAt,
      asBuiltReceivedAt: data.approved ? currentProject.asBuiltReceivedAt : null,
      asBuiltReviewedAt: reviewedAt,
      asBuiltApprovedAt: data.approved ? reviewedAt : null,
      asBuiltLink: data.approved ? data.asBuiltLink : null,
      asBuiltRejectedAt: data.approved ? null : reviewedAt,
      asBuiltRejectionReason: rejectionReason,
      invoiceAttestedAt: currentProject.invoiceAttestedAt,
      serviceCompletedAt: currentProject.serviceCompletedAt,
    };

    workflowService.assertStageTransition(currentProject.stage, targetStage);
    workflowService.validateStageRequirements(
      targetStage,
      this.buildWorkflowSnapshot({
        id: currentProject.id,
        projectCode: currentProject.projectCode,
        stage: targetStage,
        ...nextSnapshot,
      }),
      finalizedEstimateCount,
    );

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        stage: targetStage,
        status: workflowService.getMacroStatusFromStage(targetStage),
        asBuiltReviewedAt: reviewedAt,
        asBuiltApprovedAt: data.approved ? reviewedAt : null,
        asBuiltLink: data.approved ? data.asBuiltLink : null,
        asBuiltRejectedAt: data.approved ? null : reviewedAt,
        asBuiltRejectionReason: rejectionReason,
        ...(data.approved ? {} : { asBuiltReceivedAt: null, asBuiltLink: null }),
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
      asBuiltReviewedAt: project.asBuiltReviewedAt,
      asBuiltApprovedAt: project.asBuiltApprovedAt,
      asBuiltLink: this.getAsBuiltLink(project),
      asBuiltRejectedAt: project.asBuiltRejectedAt,
      asBuiltRejectionReason: project.asBuiltRejectionReason,
      invoiceAttestedAt: project.invoiceAttestedAt,
      serviceCompletedAt: project.serviceCompletedAt,
    });

    await auditService.log({
      entityType: "PROJECT",
      entityId: project.id,
      action: "UPDATE",
      actor: this.getAuditActor(user),
      summary: data.approved
        ? `As-Built do projeto PRJ-${project.projectCode} aprovado`
        : `As-Built do projeto PRJ-${project.projectCode} reprovado`,
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: {
        source: "project.as-built.review",
        approved: data.approved,
        reviewedAt,
        asBuiltLink: data.approved ? data.asBuiltLink : null,
        rejectionReason,
      },
    });

    await auditService.log({
      entityType: "PROJECT",
      entityId: project.id,
      action: "STAGE_CHANGE",
      actor: this.getAuditActor(user),
      summary: data.approved
        ? `Projeto PRJ-${project.projectCode} avançou de ANALISANDO_AS_BUILT para ATESTAR_NF após aprovação do As-Built`
        : `Projeto PRJ-${project.projectCode} retornou de ANALISANDO_AS_BUILT para SERVICO_EM_EXECUCAO após reprovação do As-Built`,
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: {
        source: "project.as-built.review",
        approved: data.approved,
        previousStage: currentProject.stage,
        newStage: project.stage,
        reviewedAt,
        asBuiltLink: data.approved ? data.asBuiltLink : null,
        rejectionReason,
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
            asBuiltReviewedAt: project.asBuiltReviewedAt,
            asBuiltApprovedAt: project.asBuiltApprovedAt,
            asBuiltLink: this.getAsBuiltLink(project),
            asBuiltRejectedAt: project.asBuiltRejectedAt,
            asBuiltRejectionReason: project.asBuiltRejectionReason,
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
          status: workflowService.getMacroStatusFromStage(
            "ESTIMATIVA_PRECO",
            currentProject.status,
          ),
          diexNumber: null,
          diexIssuedAt: null,
          commitmentNoteNumber: null,
          commitmentNoteReceivedAt: null,
          serviceOrderNumber: null,
          serviceOrderIssuedAt: null,
          serviceOrderSignatureRequired: false,
          signedServiceOrderLink: null,
          signedServiceOrderReceivedAt: null,
          signedServiceOrderNotes: null,
          signedServiceOrderRegisteredById: null,
          executionStartedAt: null,
          asBuiltReceivedAt: null,
          invoiceAttestedAt: null,
          serviceCompletedAt: null,
        },
        include: projectInclude,
      });

      await tx.commitmentNote.updateMany({
        where: { projectId, active: true },
        data: { active: false },
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

    workflowService.assertCanArchiveProject(
      this.buildWorkflowSnapshot(projectAccess),
    );

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

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        archivedAt: new Date(),
      },
      include: projectInclude,
    });

    return {
      message: "Projeto arquivado com sucesso",
      project,
    };
  }

  async softDelete(projectId: string, user: CurrentUser) {
    if (!permissionsService.hasPermission(user, "projects.delete")) {
      throw new AppError("Você não tem permissão para excluir este projeto", 403);
    }

    const projectAccess = await this.ensureCanManage(projectId, user, true);
    workflowService.assertCanArchiveProject(this.buildWorkflowSnapshot(projectAccess));

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
        archivedAt: true,
        deletedAt: true,
      },
    });

    if (!before || before.deletedAt) {
      throw new AppError("Projeto não encontrado", 404);
    }

    if (!before.archivedAt) {
      throw new AppError("O projeto precisa estar arquivado antes da exclusão", 409);
    }

    const deletedAt = new Date();
    const deleted = await prisma.$transaction(async (tx) => {
      const [tasks, estimates, diexRequests, serviceOrders] = await Promise.all([
        tx.task.updateMany({
          where: { projectId, deletedAt: null },
          data: { deletedAt },
        }),
        tx.estimate.updateMany({
          where: { projectId, deletedAt: null },
          data: { deletedAt },
        }),
        tx.diexRequest.updateMany({
          where: { projectId, deletedAt: null },
          data: { deletedAt },
        }),
        tx.serviceOrder.updateMany({
          where: { projectId, deletedAt: null },
          data: { deletedAt },
        }),
      ]);

      const project = await tx.project.update({
        where: { id: projectId },
        data: { deletedAt },
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
          archivedAt: true,
          deletedAt: true,
        },
      });

      return {
        project,
        dependents: {
          tasks: tasks.count,
          estimates: estimates.count,
          diexRequests: diexRequests.count,
          serviceOrders: serviceOrders.count,
        },
      };
    });

    await auditService.log({
      entityType: "PROJECT",
      entityId: before.id,
      action: "DELETE",
      actor: this.getAuditActor(user),
      summary: `Projeto PRJ-${before.projectCode} excluído logicamente`,
      before: this.buildProjectAuditSnapshot(before),
      after: this.buildProjectAuditSnapshot(deleted.project),
      metadata: {
        permissionUsed: "projects.delete",
        softDelete: true,
        dependents: deleted.dependents,
      },
    });

    return {
      message: "Projeto excluído com sucesso",
      permissionUsed: "projects.delete" as const,
      deletedAt,
      deleted: deleted.dependents,
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
      throw new AppError("Projeto não encontrado", 404);
    }

    const timeline = await this.buildUnifiedTimeline(project);
    return timeline.map((item) => this.toPublicTimelineItem(item));
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
