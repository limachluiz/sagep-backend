import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { workflowService } from "../workflow/workflow.service.js";
import { type ProjectStageValue } from "../workflow/workflow.types.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";

type CurrentUser = {
  id: string;
  role: string;
};

type OperationalAlertsFilters = {
  staleDays?: number;
  limit?: number;
};

type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

type AlertCategory =
  | "AGUARDANDO_NOTA_CREDITO"
  | "AGUARDANDO_DIEX"
  | "AGUARDANDO_NOTA_EMPENHO"
  | "AGUARDANDO_ORDEM_SERVICO"
  | "SEM_AVANCO"
  | "AGUARDANDO_INICIO_EXECUCAO"
  | "AGUARDANDO_AS_BUILT"
  | "AGUARDANDO_ATESTO_NF";

type AlertItem = {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  project: {
    id: string;
    projectCode: number;
    title: string;
    status: string;
    stage: ProjectStageValue;
    owner: {
      id: string;
      name: string;
      email: string;
    };
  };
  nextAction: ReturnType<typeof workflowService.getNextAction>;
  detailsPath: string;
  daysSinceUpdate?: number;
  document?: {
    type: "DIEX_REQUEST" | "SERVICE_ORDER";
    id: string;
    code: string;
    number: string | null;
    status: string | null;
    issuedAt: Date | null;
  };
  metadata?: Record<string, unknown>;
};

const emptyGroups = {
  CRITICAL: [] as AlertItem[],
  WARNING: [] as AlertItem[],
  INFO: [] as AlertItem[],
};

const emptyCategoryGroups: Record<AlertCategory, AlertItem[]> = {
  AGUARDANDO_NOTA_CREDITO: [],
  AGUARDANDO_DIEX: [],
  AGUARDANDO_NOTA_EMPENHO: [],
  AGUARDANDO_ORDEM_SERVICO: [],
  SEM_AVANCO: [],
  AGUARDANDO_INICIO_EXECUCAO: [],
  AGUARDANDO_AS_BUILT: [],
  AGUARDANDO_ATESTO_NF: [],
};

export class OperationalAlertsService {
  private isPrivileged(role: string) {
    return role === "ADMIN" || role === "GESTOR";
  }

  private getProjectAccessWhere(user: CurrentUser): Prisma.ProjectWhereInput {
    if (this.isPrivileged(user.role)) {
      return {};
    }

    return {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    };
  }

  private daysBetween(start: Date, end: Date) {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay);
  }

  private buildWorkflowSnapshot(project: {
    id: string;
    projectCode: number;
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
      projectCode: project.projectCode,
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

  private buildProjectSummary(project: {
    id: string;
    projectCode: number;
    title: string;
    status: string;
    stage: ProjectStageValue;
    owner: {
      id: string;
      name: string;
      email: string;
    };
  }) {
    return {
      id: project.id,
      projectCode: project.projectCode,
      title: project.title,
      status: project.status,
      stage: project.stage,
      owner: project.owner,
    };
  }

  async list(filters: OperationalAlertsFilters, user: CurrentUser) {
    const staleDays = filters.staleDays ?? 15;
    const limit = filters.limit ?? 100;
    const now = new Date();
    const projects = await prisma.project.findMany({
      where: {
        AND: [
          this.getProjectAccessWhere(user),
          {
            archivedAt: null,
            deletedAt: null,
            stage: {
              notIn: ["SERVICO_CONCLUIDO", "CANCELADO"],
            },
          },
        ],
      },
      select: {
        id: true,
        projectCode: true,
        title: true,
        status: true,
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
        updatedAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        estimates: {
          where: {
            archivedAt: null,
            deletedAt: null,
          },
          select: {
            id: true,
            status: true,
          },
        },
        diexRequests: {
          where: {
            archivedAt: null,
            deletedAt: null,
          },
          select: {
            id: true,
            diexCode: true,
            diexNumber: true,
            issuedAt: true,
            documentStatus: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
        serviceOrders: {
          where: {
            archivedAt: null,
            deletedAt: null,
          },
          select: {
            id: true,
            serviceOrderCode: true,
            serviceOrderNumber: true,
            issuedAt: true,
            documentStatus: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: limit,
    });

    const alerts: AlertItem[] = [];

    for (const project of projects) {
      const workflowSnapshot = this.buildWorkflowSnapshot(project);
      const nextAction = workflowService.getNextAction(workflowSnapshot);
      const projectSummary = this.buildProjectSummary(project);
      const detailsPath = `/api/projects/${project.id}/details`;
      const hasCreditNote = !!project.creditNoteNumber || !!project.creditNoteReceivedAt;
      const hasCommitmentNote =
        !!project.commitmentNoteNumber || !!project.commitmentNoteReceivedAt;
      const hasFinalizedEstimate = project.estimates.some(
        (estimate) => estimate.status === "FINALIZADA",
      );
      const latestDiex = project.diexRequests[0];
      const latestServiceOrder = project.serviceOrders[0];
      const daysSinceUpdate = this.daysBetween(project.updatedAt, now);

      if (project.stage === "AGUARDANDO_NOTA_CREDITO" && !hasCreditNote) {
        alerts.push({
          id: `${project.id}:AGUARDANDO_NOTA_CREDITO`,
          category: "AGUARDANDO_NOTA_CREDITO",
          severity: "CRITICAL",
          title: `PRJ-${project.projectCode} aguardando Nota de Crédito`,
          description: "Projeto está na etapa de Nota de Crédito e ainda não possui número ou data de recebimento informados.",
          project: projectSummary,
          nextAction,
          detailsPath,
          metadata: {
            hasFinalizedEstimate,
          },
        });
      }

      if (project.stage === "AGUARDANDO_NOTA_CREDITO" && hasCreditNote && !latestDiex) {
        alerts.push({
          id: `${project.id}:AGUARDANDO_DIEX`,
          category: "AGUARDANDO_DIEX",
          severity: "CRITICAL",
          title: `PRJ-${project.projectCode} aguardando DIEx`,
          description: "Projeto já possui Nota de Crédito, mas ainda não tem DIEx requisitório vinculado.",
          project: projectSummary,
          nextAction,
          detailsPath,
        });
      }

      if (
        (project.stage === "DIEX_REQUISITORIO" ||
          project.stage === "AGUARDANDO_NOTA_EMPENHO") &&
        !hasCommitmentNote
      ) {
        alerts.push({
          id: `${project.id}:AGUARDANDO_NOTA_EMPENHO`,
          category: "AGUARDANDO_NOTA_EMPENHO",
          severity: "CRITICAL",
          title: `PRJ-${project.projectCode} aguardando Nota de Empenho`,
          description:
            "Projeto está na etapa de Nota de Empenho e ainda não possui número ou data de recebimento informados.",
          project: projectSummary,
          nextAction,
          detailsPath,
          document: latestDiex
            ? {
                type: "DIEX_REQUEST",
                id: latestDiex.id,
                code: `DIEX-${latestDiex.diexCode}`,
                number: latestDiex.diexNumber,
                status: latestDiex.documentStatus,
                issuedAt: latestDiex.issuedAt,
              }
            : undefined,
        });
      }

      if (
        (project.stage === "AGUARDANDO_NOTA_EMPENHO" || project.stage === "OS_LIBERADA") &&
        hasCommitmentNote &&
        !latestServiceOrder
      ) {
        alerts.push({
          id: `${project.id}:AGUARDANDO_ORDEM_SERVICO`,
          category: "AGUARDANDO_ORDEM_SERVICO",
          severity: "CRITICAL",
          title: `PRJ-${project.projectCode} aguardando Ordem de Serviço`,
          description: "Projeto já possui Nota de Empenho, mas ainda não tem Ordem de Serviço vinculada.",
          project: projectSummary,
          nextAction,
          detailsPath,
        });
      }

      if (project.stage === "OS_LIBERADA" && latestServiceOrder && !project.executionStartedAt) {
        alerts.push({
          id: `${project.id}:AGUARDANDO_INICIO_EXECUCAO`,
          category: "AGUARDANDO_INICIO_EXECUCAO",
          severity: "CRITICAL",
          title: `PRJ-${project.projectCode} aguardando início de execução`,
          description: "Ordem de Serviço liberada, mas a data de início da execução ainda não foi registrada.",
          project: projectSummary,
          nextAction,
          detailsPath,
          document: latestServiceOrder
            ? {
                type: "SERVICE_ORDER",
                id: latestServiceOrder.id,
                code: `OS-${latestServiceOrder.serviceOrderCode}`,
                number: latestServiceOrder.serviceOrderNumber,
                status: latestServiceOrder.documentStatus,
                issuedAt: latestServiceOrder.issuedAt,
              }
            : undefined,
        });
      }

      if (project.stage === "SERVICO_EM_EXECUCAO" && !project.asBuiltReceivedAt) {
        alerts.push({
          id: `${project.id}:AGUARDANDO_AS_BUILT`,
          category: "AGUARDANDO_AS_BUILT",
          severity: "CRITICAL",
          title: `PRJ-${project.projectCode} aguardando As-Built`,
          description: "Serviço em execução sem registro de recebimento do As-Built.",
          project: projectSummary,
          nextAction,
          detailsPath,
        });
      }

      if (project.stage === "ATESTAR_NF" && !project.invoiceAttestedAt) {
        alerts.push({
          id: `${project.id}:AGUARDANDO_ATESTO_NF`,
          category: "AGUARDANDO_ATESTO_NF",
          severity: "CRITICAL",
          title: `PRJ-${project.projectCode} aguardando atesto de NF`,
          description: "Projeto está na etapa de atesto e ainda não possui data de atesto da nota fiscal.",
          project: projectSummary,
          nextAction,
          detailsPath,
        });
      }

      if (daysSinceUpdate >= staleDays) {
        alerts.push({
          id: `${project.id}:SEM_AVANCO`,
          category: "SEM_AVANCO",
          severity: daysSinceUpdate >= staleDays * 2 ? "CRITICAL" : "WARNING",
          title: `PRJ-${project.projectCode} sem avanço há ${daysSinceUpdate} dia(s)`,
          description: `Projeto não recebe atualização há pelo menos ${staleDays} dia(s).`,
          project: projectSummary,
          nextAction,
          detailsPath,
          daysSinceUpdate,
          metadata: {
            lastProjectUpdateAt: project.updatedAt,
            staleDays,
          },
        });
      }
    }

    const bySeverity = {
      CRITICAL: [...emptyGroups.CRITICAL],
      WARNING: [...emptyGroups.WARNING],
      INFO: [...emptyGroups.INFO],
    };
    const byCategory: Record<AlertCategory, AlertItem[]> = {
      AGUARDANDO_NOTA_CREDITO: [...emptyCategoryGroups.AGUARDANDO_NOTA_CREDITO],
      AGUARDANDO_DIEX: [...emptyCategoryGroups.AGUARDANDO_DIEX],
      AGUARDANDO_NOTA_EMPENHO: [...emptyCategoryGroups.AGUARDANDO_NOTA_EMPENHO],
      AGUARDANDO_ORDEM_SERVICO: [...emptyCategoryGroups.AGUARDANDO_ORDEM_SERVICO],
      SEM_AVANCO: [...emptyCategoryGroups.SEM_AVANCO],
      AGUARDANDO_INICIO_EXECUCAO: [...emptyCategoryGroups.AGUARDANDO_INICIO_EXECUCAO],
      AGUARDANDO_AS_BUILT: [...emptyCategoryGroups.AGUARDANDO_AS_BUILT],
      AGUARDANDO_ATESTO_NF: [...emptyCategoryGroups.AGUARDANDO_ATESTO_NF],
    };

    for (const alert of alerts) {
      bySeverity[alert.severity].push(alert);
      byCategory[alert.category].push(alert);
    }

    const balanceAlerts = await ataItemBalanceService.listBalanceAlerts();
    const recentReversals = await prisma.ataItemBalanceMovement.findMany({
      where: {
        movementType: "REVERSE_CONSUME",
      },
      select: {
        id: true,
        ataItemId: true,
        projectId: true,
        quantity: true,
        totalAmount: true,
        summary: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    });

    return {
      generatedAt: now,
      filters: {
        staleDays,
        limit,
      },
      summary: {
        total: alerts.length,
        bySeverity: {
          CRITICAL: bySeverity.CRITICAL.length,
          WARNING: bySeverity.WARNING.length,
          INFO: bySeverity.INFO.length,
        },
        byCategory: Object.fromEntries(
          Object.entries(byCategory).map(([category, items]) => [category, items.length]),
        ),
      },
      groups: {
        bySeverity,
        byCategory,
      },
      inventoryAlerts: {
        lowStock: balanceAlerts.lowStockItems.map(({ item, balance }) => ({
          ataItemId: item.id,
          ataItemCode: item.ataItemCode,
          referenceCode: item.referenceCode,
          description: item.description,
          balance,
        })),
        insufficient: balanceAlerts.lowStockItems
          .filter(({ balance }) => balance.insufficient)
          .map(({ item, balance }) => ({
            ataItemId: item.id,
            ataItemCode: item.ataItemCode,
            referenceCode: item.referenceCode,
            description: item.description,
            balance,
          })),
        staleReservations: balanceAlerts.staleReservations,
        reversals: recentReversals,
      },
      alerts,
    };
  }
}
