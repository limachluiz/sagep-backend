import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { workflowService } from "../workflow/workflow.service.js";
import { type ProjectStageValue } from "../workflow/workflow.types.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";
import { permissionsService } from "../permissions/permissions.service.js";
import { auditService } from "../audit/audit.service.js";
import { AppError } from "../../shared/app-error.js";
import { getDeploymentCertificateStatus } from "../deployment/deployment.service.js";

type CurrentUser = {
  id: string;
  role: string;
  name?: string;
  email?: string;
  permissions?: string[];
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
  | "AGUARDANDO_OS_ASSINADA"
  | "SEM_AVANCO"
  | "AGUARDANDO_INICIO_EXECUCAO"
  | "AGUARDANDO_AS_BUILT"
  | "AGUARDANDO_ATESTO_NF"
  | "NE_DIVERGENTE"
  | "NE_SYNC_ERRO"
  | "NE_AGUARDANDO_LIQUIDACAO"
  | "NE_AGUARDANDO_PAGAMENTO"
  | "PROJETO_CONCLUIDO_NAO_PAGO"
  | "NE_PAGA_PROJETO_ABERTO"
  | "CERTIFICADO_HTTPS_VENCENDO"
  | "CERTIFICADO_HTTPS_VENCIDO";

type AlertItem = {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  project?: {
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
  nextAction?: ReturnType<typeof workflowService.getNextAction>;
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
  sourceUpdatedAt?: Date;
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
  AGUARDANDO_OS_ASSINADA: [],
  SEM_AVANCO: [],
  AGUARDANDO_INICIO_EXECUCAO: [],
  AGUARDANDO_AS_BUILT: [],
  AGUARDANDO_ATESTO_NF: [],
  NE_DIVERGENTE: [],
  NE_SYNC_ERRO: [],
  NE_AGUARDANDO_LIQUIDACAO: [],
  NE_AGUARDANDO_PAGAMENTO: [],
  PROJETO_CONCLUIDO_NAO_PAGO: [],
  NE_PAGA_PROJETO_ABERTO: [],
  CERTIFICADO_HTTPS_VENCENDO: [],
  CERTIFICADO_HTTPS_VENCIDO: [],
};

export class OperationalAlertsService {
  private isPrivileged(user: CurrentUser) {
    return permissionsService.hasPermission(user, "projects.view_all");
  }

  private getProjectAccessWhere(user: CurrentUser): Prisma.ProjectWhereInput {
    if (this.isPrivileged(user)) {
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
    serviceOrderSignatureRequired?: boolean;
    signedServiceOrderLink?: string | null;
    signedServiceOrderReceivedAt?: Date | null;
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
      serviceOrderSignatureRequired: project.serviceOrderSignatureRequired ?? false,
      signedServiceOrderLink: project.signedServiceOrderLink ?? null,
      signedServiceOrderReceivedAt: project.signedServiceOrderReceivedAt ?? null,
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
        serviceOrderSignatureRequired: true,
        signedServiceOrderLink: true,
        signedServiceOrderReceivedAt: true,
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

    let alerts: AlertItem[] = [];

    for (const project of projects) {
      const workflowSnapshot = this.buildWorkflowSnapshot(project);
      const nextAction = workflowService.getNextAction(workflowSnapshot);
      const projectSummary = this.buildProjectSummary(project);
      const detailsPath = `/projects/${project.id}`;
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

      if (
        project.stage === "AGUARDANDO_OS_ASSINADA" &&
        latestServiceOrder &&
        (!project.signedServiceOrderLink || !project.signedServiceOrderReceivedAt)
      ) {
        alerts.push({
          id: `${project.id}:AGUARDANDO_OS_ASSINADA`,
          category: "AGUARDANDO_OS_ASSINADA",
          severity: "CRITICAL",
          title: `PRJ-${project.projectCode} aguardando OS assinada`,
          description:
            "A Ordem de Serviço foi emitida, mas a versão assinada pela contratada ainda não foi vinculada.",
          project: projectSummary,
          nextAction,
          detailsPath,
          document: {
            type: "SERVICE_ORDER",
            id: latestServiceOrder.id,
            code: `OS-${latestServiceOrder.serviceOrderCode}`,
            number: latestServiceOrder.serviceOrderNumber,
            status: latestServiceOrder.documentStatus,
            issuedAt: latestServiceOrder.issuedAt,
          },
        });
      }

      if (
        (project.stage === "OS_LIBERADA" ||
          project.stage === "AGUARDANDO_INICIO_EXECUCAO") &&
        latestServiceOrder &&
        !project.executionStartedAt
      ) {
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

    if (permissionsService.hasPermission(user, "financial_execution.view")) {
      const commitmentNotes = await prisma.commitmentNote.findMany({
        where: {
          active: true,
          project: this.getProjectAccessWhere(user),
        },
        include: {
          project: {
            include: {
              owner: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
      });

      for (const note of commitmentNotes) {
        const projectSummary = this.buildProjectSummary(note.project);
        const nextAction = workflowService.getNextAction(this.buildWorkflowSnapshot(note.project));
        const common = {
          project: projectSummary,
          nextAction,
          detailsPath: `/financial-execution?note=${note.id}`,
          sourceUpdatedAt: note.updatedAt,
          metadata: {
            commitmentNoteId: note.id,
            commitmentNoteNumber: note.number,
            financialStatus: note.financialStatus,
            syncStatus: note.syncStatus,
            currentAmount: Number(note.currentAmount),
            liquidatedAmount: Number(note.liquidatedAmount),
            paidAmount: Number(note.paidAmount),
          },
        };

        if (note.syncStatus === "DIVERGENTE") {
          alerts.push({
            id: `${note.id}:NE_DIVERGENTE`, category: "NE_DIVERGENTE", severity: "CRITICAL",
            title: `NE ${note.number} com divergência`,
            description: note.divergenceReason ?? "Os dados oficiais diferem do fornecedor ou valor registrado no projeto.",
            ...common,
          });
        }
        if (note.syncStatus === "ERRO") {
          alerts.push({
            id: `${note.id}:NE_SYNC_ERRO`, category: "NE_SYNC_ERRO", severity: "WARNING",
            title: `Falha ao atualizar a NE ${note.number}`,
            description: note.lastSyncError ?? "Não foi possível consultar a situação atual no Portal da Transparência.",
            ...common,
          });
        }

        const requiresSettlement = Boolean(note.project.invoiceAttestedAt) || ["ATESTAR_NF", "SERVICO_CONCLUIDO"].includes(note.project.stage);
        if (requiresSettlement && note.financialStatus === "NAO_LIQUIDADA") {
          alerts.push({
            id: `${note.id}:NE_AGUARDANDO_LIQUIDACAO`, category: "NE_AGUARDANDO_LIQUIDACAO", severity: note.project.stage === "SERVICO_CONCLUIDO" ? "CRITICAL" : "WARNING",
            title: `NE ${note.number} ainda não liquidada`,
            description: `O projeto PRJ-${note.project.projectCode} já chegou à etapa de atesto/conclusão, mas não há liquidação localizada.`,
            ...common,
          });
        }
        if (["LIQUIDADA", "PARCIALMENTE_LIQUIDADA", "PARCIALMENTE_PAGA"].includes(note.financialStatus)) {
          alerts.push({
            id: `${note.id}:NE_AGUARDANDO_PAGAMENTO`, category: "NE_AGUARDANDO_PAGAMENTO", severity: "WARNING",
            title: `NE ${note.number} possui saldo a pagar`,
            description: `Liquidado: R$ ${Number(note.liquidatedAmount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · pago: R$ ${Number(note.paidAmount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
            ...common,
          });
        }
        if (note.project.stage === "SERVICO_CONCLUIDO" && note.financialStatus !== "PAGA") {
          alerts.push({
            id: `${note.id}:PROJETO_CONCLUIDO_NAO_PAGO`, category: "PROJETO_CONCLUIDO_NAO_PAGO", severity: "CRITICAL",
            title: `Projeto PRJ-${note.project.projectCode} concluído e não pago`,
            description: `A NE ${note.number} permanece em ${note.financialStatus.toLowerCase().replaceAll("_", " ")}.`,
            ...common,
          });
        }
        if (note.financialStatus === "PAGA" && note.project.stage !== "SERVICO_CONCLUIDO") {
          alerts.push({
            id: `${note.id}:NE_PAGA_PROJETO_ABERTO`, category: "NE_PAGA_PROJETO_ABERTO", severity: "INFO",
            title: `NE ${note.number} paga com projeto ainda aberto`,
            description: `O pagamento foi localizado, mas o projeto PRJ-${note.project.projectCode} está em ${note.project.stage.toLowerCase().replaceAll("_", " ")}.`,
            ...common,
          });
        }
      }
    }

    if (permissionsService.hasPermission(user, "settings.view")) {
      const certificate = await getDeploymentCertificateStatus();
      if (certificate.configured && certificate.renewalAlert) {
        const expired = certificate.status === "EXPIRED";
        alerts.push({
          id: `deployment:certificate:${certificate.renewalAlert.thresholdDays}`,
          category: expired ? "CERTIFICADO_HTTPS_VENCIDO" : "CERTIFICADO_HTTPS_VENCENDO",
          severity: certificate.renewalAlert.severity,
          title: expired ? "Certificado HTTPS vencido" : `Certificado HTTPS vence em ${certificate.daysRemaining} dia(s)`,
          description: expired
            ? "O proxy HTTPS precisa receber um novo certificado assinado pela autoridade interna da OM."
            : "Renove somente o certificado do servidor para preservar a confiança já instalada nas estações.",
          detailsPath: "/settings/network",
          sourceUpdatedAt: certificate.validFrom ? new Date(certificate.validFrom) : now,
          metadata: {
            daysRemaining: certificate.daysRemaining,
            expiresAt: certificate.expiresAt,
            renewalThresholdDays: certificate.renewalAlert.thresholdDays,
            rootRotationRequired: false,
          },
        });
      }
    }

    const projectUpdatedAt = new Map(projects.map((project) => [project.id, project.updatedAt]));
    const dismissals = await prisma.notificationDismissal.findMany({ where: { userId: user.id } });
    const dismissalByKey = new Map(dismissals.map((item) => [item.notificationKey, item]));
    alerts = alerts.filter((alert) => {
      const sourceUpdatedAt = alert.sourceUpdatedAt ?? (alert.project ? projectUpdatedAt.get(alert.project.id) : undefined) ?? now;
      alert.sourceUpdatedAt = sourceUpdatedAt;
      const dismissal = dismissalByKey.get(alert.id);
      return !dismissal || dismissal.sourceUpdatedAt < sourceUpdatedAt;
    });

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
      AGUARDANDO_OS_ASSINADA: [...emptyCategoryGroups.AGUARDANDO_OS_ASSINADA],
      SEM_AVANCO: [...emptyCategoryGroups.SEM_AVANCO],
      AGUARDANDO_INICIO_EXECUCAO: [...emptyCategoryGroups.AGUARDANDO_INICIO_EXECUCAO],
      AGUARDANDO_AS_BUILT: [...emptyCategoryGroups.AGUARDANDO_AS_BUILT],
      AGUARDANDO_ATESTO_NF: [...emptyCategoryGroups.AGUARDANDO_ATESTO_NF],
      NE_DIVERGENTE: [...emptyCategoryGroups.NE_DIVERGENTE],
      NE_SYNC_ERRO: [...emptyCategoryGroups.NE_SYNC_ERRO],
      NE_AGUARDANDO_LIQUIDACAO: [...emptyCategoryGroups.NE_AGUARDANDO_LIQUIDACAO],
      NE_AGUARDANDO_PAGAMENTO: [...emptyCategoryGroups.NE_AGUARDANDO_PAGAMENTO],
      PROJETO_CONCLUIDO_NAO_PAGO: [...emptyCategoryGroups.PROJETO_CONCLUIDO_NAO_PAGO],
      NE_PAGA_PROJETO_ABERTO: [...emptyCategoryGroups.NE_PAGA_PROJETO_ABERTO],
      CERTIFICADO_HTTPS_VENCENDO: [...emptyCategoryGroups.CERTIFICADO_HTTPS_VENCENDO],
      CERTIFICADO_HTTPS_VENCIDO: [...emptyCategoryGroups.CERTIFICADO_HTTPS_VENCIDO],
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

  async dismissAll(filters: OperationalAlertsFilters, user: CurrentUser) {
    const current = await this.list(filters, user);
    if (current.alerts.length) {
      await prisma.$transaction(current.alerts.map((alert) => prisma.notificationDismissal.upsert({
        where: { userId_notificationKey: { userId: user.id, notificationKey: alert.id } },
        create: { userId: user.id, notificationKey: alert.id, sourceUpdatedAt: alert.sourceUpdatedAt ?? current.generatedAt },
        update: { sourceUpdatedAt: alert.sourceUpdatedAt ?? current.generatedAt, dismissedAt: new Date() },
      })));
    }
    await auditService.log({
      entityType: "NOTIFICATION",
      entityId: user.id,
      action: "DISMISS",
      actor: { id: user.id, name: user.name ?? user.email },
      summary: `${current.alerts.length} notificação(ões) limpa(s) pelo usuário`,
      metadata: { notificationKeys: current.alerts.map((alert) => alert.id) },
    });
    return { message: "Notificações limpas", dismissed: current.alerts.length };
  }

  async dismissOne(notificationKey: string, user: CurrentUser) {
    const current = await this.list({ limit: 200 }, user);
    const alert = current.alerts.find((item) => item.id === notificationKey);
    if (!alert) throw new AppError("Notificação não encontrada ou já limpa", 404);
    await prisma.notificationDismissal.upsert({
      where: { userId_notificationKey: { userId: user.id, notificationKey } },
      create: { userId: user.id, notificationKey, sourceUpdatedAt: alert.sourceUpdatedAt ?? current.generatedAt },
      update: { sourceUpdatedAt: alert.sourceUpdatedAt ?? current.generatedAt, dismissedAt: new Date() },
    });
    return { message: "Notificação limpa", dismissed: 1 };
  }
}
