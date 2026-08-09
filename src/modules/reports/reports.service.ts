import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../config/prisma.js";
import { pdfService } from "../../shared/pdf.service.js";
import {
  buildDashboardFilterContext,
  type FilterContext,
} from "../dashboard/dashboard.service.js";
import type { DashboardExecutiveQuery } from "../dashboard/dashboard.schemas.js";
import { ProjectsService } from "../projects/projects.service.js";
import { workflowService } from "../workflow/workflow.service.js";
import { renderExecutiveProjectsReportHtml } from "./executive-projects-report.template.js";
import {
  renderConsolidatedProjectsReportHtml,
  type ConsolidatedReportType,
} from "./consolidated-projects-report.template.js";
import { renderProjectDossierHtml } from "./project-dossier.template.js";

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  rank?: string | null;
  warName?: string | null;
  cpf?: string | null;
};

const projectsService = new ProjectsService();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

const ACTIVE_TASK_STATUSES = ["PENDENTE", "EM_ANDAMENTO", "REVISAO"] as const;
const EXECUTION_STAGES = new Set([
  "AGUARDANDO_INICIO_EXECUCAO",
  "SERVICO_EM_EXECUCAO",
  "ANALISANDO_AS_BUILT",
  "ATESTAR_NF",
]);
const STAGE_PROGRESS: Record<string, number> = {
  ESTIMATIVA_PRECO: 10,
  AGUARDANDO_NOTA_CREDITO: 20,
  DIEX_REQUISITORIO: 30,
  AGUARDANDO_NOTA_EMPENHO: 40,
  OS_LIBERADA: 50,
  AGUARDANDO_OS_ASSINADA: 60,
  AGUARDANDO_INICIO_EXECUCAO: 70,
  SERVICO_EM_EXECUCAO: 80,
  ANALISANDO_AS_BUILT: 90,
  ATESTAR_NF: 95,
};

type ExecutiveProjectsReportFilters = DashboardExecutiveQuery & {
  staleDays?: number;
};

type TimelineSummaryItem = {
  id: string;
  at: Date | string;
  action: string;
  label: string;
  summary: string;
  actorName?: string | null;
  source: "AUDIT" | "FALLBACK";
};

export class ReportsService {
  private async fileToDataUrl(relativePath: string) {
    const fileBuffer = await fs.readFile(path.resolve(projectRoot, relativePath));
    return `data:image/png;base64,${fileBuffer.toString("base64")}`;
  }

  private daysBetween(start: Date, end: Date) {
    return Math.max(
      0,
      Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
    );
  }

  private reportCreatedAtWhere(filter: FilterContext) {
    if (filter.mode === "interval") {
      return {
        gte: filter.startDate,
        lte: filter.endDate,
      };
    }

    if (filter.mode === "as_of") {
      return { lte: filter.asOfDate };
    }

    return undefined;
  }

  async getExecutiveProjectsReport(
    filters: ExecutiveProjectsReportFilters,
    user: CurrentUser,
  ) {
    const staleDays = filters.staleDays ?? 15;
    const { staleDays: _staleDays, ...dashboardFilters } = filters;
    const filterContext = buildDashboardFilterContext(dashboardFilters);
    const createdAt = this.reportCreatedAtWhere(filterContext);
    const now = new Date();

    const [portfolioProjects, reportUser] = await Promise.all([
      prisma.project.findMany({
        where: {
          archivedAt: null,
          deletedAt: null,
          stage: {
            not: "CANCELADO",
          },
          status: {
            not: "CANCELADO",
          },
          ...(createdAt && { createdAt }),
          ...(filters.stateUf && { om: { stateUf: filters.stateUf } }),
          ...(filters.omId && { omId: filters.omId }),
          ...(filters.projectType && { projectType: filters.projectType }),
          ...(filters.ownerId && { ownerId: filters.ownerId }),
        },
        select: {
        id: true,
        projectCode: true,
        title: true,
        description: true,
        projectType: true,
        status: true,
        stage: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
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
        om: {
          select: {
            id: true,
            sigla: true,
            name: true,
            cityName: true,
            stateUf: true,
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            warName: true,
            rank: true,
            email: true,
          },
        },
        estimates: {
          where: {
            archivedAt: null,
            deletedAt: null,
          },
          select: {
            status: true,
            totalAmount: true,
          },
        },
        serviceOrders: {
          where: {
            archivedAt: null,
            deletedAt: null,
          },
          select: {
            plannedStartDate: true,
            plannedEndDate: true,
            totalAmount: true,
          },
          orderBy: {
            issuedAt: "desc",
          },
          take: 1,
        },
        tasks: {
          where: {
            archivedAt: null,
            deletedAt: null,
          },
          select: {
            status: true,
            dueDate: true,
          },
        },
        },
        orderBy: [{ stage: "asc" }, { updatedAt: "asc" }],
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          name: true,
          rank: true,
          warName: true,
        },
      }),
    ]);

    const activeProjects = portfolioProjects.filter(
      (project) =>
        project.status !== "CONCLUIDO" &&
        project.stage !== "SERVICO_CONCLUIDO",
    );
    const completedProjects = portfolioProjects.filter(
      (project) =>
        project.status === "CONCLUIDO" ||
        project.stage === "SERVICO_CONCLUIDO",
    );
    const projectAmount = (project: (typeof portfolioProjects)[number]) => {
      const finalizedAmount = project.estimates
        .filter((estimate) => estimate.status === "FINALIZADA")
        .reduce((sum, estimate) => sum + Number(estimate.totalAmount), 0);
      return (
        finalizedAmount ||
        project.estimates.reduce(
          (sum, estimate) => sum + Number(estimate.totalAmount),
          0,
        )
      );
    };
    const projectCommittedAmount = (project: (typeof portfolioProjects)[number]) => {
      return project.commitmentNoteNumber || project.commitmentNoteReceivedAt
        ? projectAmount(project)
        : 0;
    };
    const projectOrderedAmount = (project: (typeof portfolioProjects)[number]) =>
      Number(project.serviceOrders[0]?.totalAmount ?? 0);

    const items = activeProjects.map((project) => {
      const estimatedAmount = projectAmount(project);
      const latestServiceOrder = project.serviceOrders[0] ?? null;
      const plannedEndDate = latestServiceOrder?.plannedEndDate ?? project.endDate;
      const openTasks = project.tasks.filter((task) =>
        ACTIVE_TASK_STATUSES.includes(
          task.status as (typeof ACTIVE_TASK_STATUSES)[number],
        ),
      );
      const overdueTasks = openTasks.filter(
        (task) => task.dueDate && task.dueDate < now,
      );
      const daysSinceUpdate = this.daysBetween(project.updatedAt, now);
      const overdue =
        Boolean(plannedEndDate && plannedEndDate < now) || overdueTasks.length > 0;
      const stale = daysSinceUpdate >= staleDays;
      const nextAction = workflowService.getNextAction(project);
      const attentionLevel = overdue ? "CRITICAL" : stale ? "WARNING" : "NORMAL";

      return {
        id: project.id,
        projectCode: project.projectCode,
        title: project.title,
        description: project.description,
        projectType: project.projectType,
        status: project.status,
        stage: project.stage,
        progress: STAGE_PROGRESS[project.stage] ?? 0,
        estimatedAmount: estimatedAmount.toFixed(2),
        committedAmount:
          projectCommittedAmount(project).toFixed(2),
        orderedAmount: projectOrderedAmount(project).toFixed(2),
        om: project.om,
        owner: {
          ...project.owner,
          displayName:
            [project.owner.rank, project.owner.warName].filter(Boolean).join(" ") ||
            project.owner.name,
        },
        dates: {
          startDate: project.startDate,
          plannedEndDate,
          updatedAt: project.updatedAt,
          daysSinceUpdate,
        },
        tasks: {
          open: openTasks.length,
          overdue: overdueTasks.length,
        },
        nextAction,
        attention: {
          level: attentionLevel,
          overdue,
          stale,
          label: overdue
            ? "Prazo vencido"
            : stale
              ? `Sem atualização há ${daysSinceUpdate} dias`
              : "Fluxo regular",
        },
      };
    });

    const totalInProgressAmount = items.reduce(
      (sum, project) => sum + Number(project.estimatedAmount),
      0,
    );
    const totalCompletedAmount = completedProjects.reduce(
      (sum, project) => sum + projectAmount(project),
      0,
    );
    const totalCommittedAmount = portfolioProjects.reduce(
      (sum, project) => sum + projectCommittedAmount(project),
      0,
    );
    const totalOrderedAmount = portfolioProjects.reduce(
      (sum, project) => sum + projectOrderedAmount(project),
      0,
    );
    const criticalProjects = items.filter(
      (project) => project.attention.level === "CRITICAL",
    );
    const warningProjects = items.filter(
      (project) => project.attention.level === "WARNING",
    );
    const byStage = Object.entries(
      items.reduce<Record<string, number>>((counts, project) => {
        counts[project.stage] = (counts[project.stage] ?? 0) + 1;
        return counts;
      }, {}),
    ).map(([label, count]) => ({
      label,
      count,
      percentage: items.length ? Number(((count / items.length) * 100).toFixed(1)) : 0,
    }));
    const byRegion = Object.entries(
      items.reduce<Record<string, { count: number; totalAmount: number }>>(
        (counts, project) => {
          const label = project.om?.stateUf ?? "Não informada";
          const current = counts[label] ?? { count: 0, totalAmount: 0 };
          current.count += 1;
          current.totalAmount += Number(project.estimatedAmount);
          counts[label] = current;
          return counts;
        },
        {},
      ),
    )
      .map(([label, value]) => ({
        label,
        count: value.count,
        totalAmount: value.totalAmount.toFixed(2),
        percentage: totalInProgressAmount
          ? Number(((value.totalAmount / totalInProgressAmount) * 100).toFixed(1))
          : 0,
      }))
      .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount));
    const byOwner = Object.entries(
      items.reduce<Record<string, { count: number; critical: number; overdueTasks: number }>>(
        (counts, project) => {
          const label = project.owner.displayName;
          const current = counts[label] ?? { count: 0, critical: 0, overdueTasks: 0 };
          current.count += 1;
          current.critical += project.attention.level === "CRITICAL" ? 1 : 0;
          current.overdueTasks += project.tasks.overdue;
          counts[label] = current;
          return counts;
        },
        {},
      ),
    )
      .map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.count - a.count || b.critical - a.critical);
    const byType = Object.entries(
      portfolioProjects.reduce<Record<string, { count: number; totalAmount: number }>>(
        (counts, project) => {
          const label = project.projectType ?? "NAO_INFORMADO";
          const current = counts[label] ?? { count: 0, totalAmount: 0 };
          current.count += 1;
          current.totalAmount += projectAmount(project);
          counts[label] = current;
          return counts;
        },
        {},
      ),
    ).map(([label, value]) => ({
      label,
      count: value.count,
      totalAmount: value.totalAmount.toFixed(2),
    }));
    const totalPortfolioAmount = totalInProgressAmount + totalCompletedAmount;
    const totalOpenTasks = items.reduce((sum, project) => sum + project.tasks.open, 0);
    const totalOverdueTasks = items.reduce((sum, project) => sum + project.tasks.overdue, 0);

    return {
      generatedAt: new Date().toISOString(),
      generatedBy: {
        name: reportUser?.name ?? user.name,
        displayName:
          [reportUser?.rank ?? user.rank, reportUser?.warName]
            .filter(Boolean)
            .join(" ") ||
          reportUser?.name ||
          user.name,
      },
      filter: {
        mode: filterContext.mode,
        label: filterContext.label,
        periodType: filterContext.periodType,
        referenceDate: filterContext.referenceDate?.toISOString() ?? null,
        startDate: filterContext.startDate?.toISOString() ?? null,
        endDate: filterContext.endDate?.toISOString() ?? null,
        asOfDate: filterContext.asOfDate?.toISOString() ?? null,
        stateUf: filters.stateUf ?? null,
        omId: filters.omId ?? null,
        projectType: filters.projectType ?? null,
        ownerId: filters.ownerId ?? null,
        staleDays,
        scope:
          filters.projectType === "CFTV"
            ? "Projetos de CFTV"
            : filters.projectType === "FIBRA_OPTICA_PONTO_LOGICO"
              ? "Projetos de Fibra Óptica"
              : "Visão geral da Seção de Projetos",
      },
      summary: {
        projectsTotal: portfolioProjects.length,
        projectsOpen: items.length,
        projectsCompleted: completedProjects.length,
        projectsInExecution: items.filter((project) =>
          EXECUTION_STAGES.has(project.stage),
        ).length,
        projectsCritical: criticalProjects.length,
        projectsWarning: warningProjects.length,
        totalInProgressAmount: totalInProgressAmount.toFixed(2),
        totalCompletedAmount: totalCompletedAmount.toFixed(2),
        totalCommittedAmount: totalCommittedAmount.toFixed(2),
        totalOrderedAmount: totalOrderedAmount.toFixed(2),
        totalPortfolioAmount: totalPortfolioAmount.toFixed(2),
        totalUncommittedAmount: Math.max(
          totalPortfolioAmount - totalCommittedAmount,
          0,
        ).toFixed(2),
        commitmentRate: totalInProgressAmount + totalCompletedAmount
          ? Number(
              (
                (totalCommittedAmount /
                  (totalInProgressAmount + totalCompletedAmount)) *
                100
              ).toFixed(1),
            )
          : 0,
        averageProgress: items.length
          ? Number(
              (
                items.reduce((sum, project) => sum + project.progress, 0) /
                items.length
              ).toFixed(1),
            )
          : 0,
      },
      charts: {
        byStage,
        byRegion,
        byOwner,
        byType,
        attention: [
          { label: "Críticos", count: criticalProjects.length },
          { label: "Atenção", count: warningProjects.length },
          {
            label: "Regulares",
            count: items.length - criticalProjects.length - warningProjects.length,
          },
        ],
      },
      commandAttention: [...criticalProjects, ...warningProjects].slice(0, 12),
      operationalSummary: {
        openTasks: totalOpenTasks,
        overdueTasks: totalOverdueTasks,
        overdueProjects: items.filter((project) => project.attention.overdue).length,
        staleProjects: items.filter((project) => project.attention.stale).length,
        projectsWithoutOpenTasks: items.filter((project) => project.tasks.open === 0).length,
      },
      completedProjects: completedProjects.map((project) => ({
        id: project.id,
        projectCode: project.projectCode,
        title: project.title,
        projectType: project.projectType,
        amount: projectAmount(project).toFixed(2),
        committedAmount: projectCommittedAmount(project).toFixed(2),
        orderedAmount: projectOrderedAmount(project).toFixed(2),
        completedAt: project.serviceCompletedAt,
        om: project.om,
        owner: {
          displayName:
            [project.owner.rank, project.owner.warName].filter(Boolean).join(" ") ||
            project.owner.name,
        },
      })),
      projects: items,
    };
  }

  async generateConsolidatedProjectsReportHtml(
    reportType: ConsolidatedReportType,
    filters: ExecutiveProjectsReportFilters,
    user: CurrentUser,
  ) {
    const [report, ctaLogo] = await Promise.all([
      this.getExecutiveProjectsReport(filters, user),
      this.fileToDataUrl("src/assets/logos/cta-logo.png"),
    ]);

    return renderConsolidatedProjectsReportHtml({
      ...report,
      reportType,
      branding: { ctaLogo },
    });
  }

  async generateConsolidatedProjectsReportPdf(
    reportType: ConsolidatedReportType,
    filters: ExecutiveProjectsReportFilters,
    user: CurrentUser,
  ) {
    const reportLabels: Record<ConsolidatedReportType, string> = {
      executive: "Executivo",
      operational: "Operacional",
      financial: "Financeiro",
    };

    return pdfService.renderPdf({
      label: `consolidated-${reportType}-projects-report`,
      buildHtml: () =>
        this.generateConsolidatedProjectsReportHtml(reportType, filters, user),
      pdfOptions: {
        format: "A4",
        landscape: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `
          <div style="width:100%;padding:0 10mm;color:#737b6c;font-family:Arial,sans-serif;font-size:7px;display:flex;justify-content:space-between;">
            <span>SAGEP · Relatório ${reportLabels[reportType]} de Projetos</span>
            <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
          </div>
        `,
        margin: {
          top: "9mm",
          right: "9mm",
          bottom: "14mm",
          left: "9mm",
        },
      },
    });
  }

  async generateExecutiveProjectsReportHtml(
    filters: ExecutiveProjectsReportFilters,
    user: CurrentUser,
  ) {
    const [report, ctaLogo] = await Promise.all([
      this.getExecutiveProjectsReport(filters, user),
      this.fileToDataUrl("src/assets/logos/cta-logo.png"),
    ]);
    return renderExecutiveProjectsReportHtml({
      ...report,
      branding: { ctaLogo },
    });
  }

  async generateExecutiveProjectsReportPdf(
    filters: ExecutiveProjectsReportFilters,
    user: CurrentUser,
  ) {
    return pdfService.renderPdf({
      label: "executive-projects-report",
      buildHtml: () => this.generateExecutiveProjectsReportHtml(filters, user),
      pdfOptions: {
        format: "A4",
        landscape: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `
          <div style="width:100%;padding:0 10mm;color:#737b6c;font-family:Arial,sans-serif;font-size:7px;display:flex;justify-content:space-between;">
            <span>SAGEP · Relatório Executivo de Projetos</span>
            <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
          </div>
        `,
        margin: {
          top: "10mm",
          right: "9mm",
          bottom: "14mm",
          left: "9mm",
        },
      },
    });
  }

  private inferTimelineCode(item: { action?: string; summary?: string; label?: string }) {
    const text = `${item.action ?? ""} ${item.summary ?? ""} ${item.label ?? ""}`
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

    if (text.includes("criad")) return "PROJETO_CRIADO";
    if (text.includes("estimativa") && text.includes("finaliz")) return "ESTIMATIVA_FINALIZADA";
    if (text.includes("credito")) return "NOTA_CREDITO_RECEBIDA";
    if (text.includes("diex")) return "DIEX_EMITIDO";
    if (text.includes("empenho")) return "NOTA_EMPENHO_INFORMADA";
    if (text.includes("ordem") || text.includes(" os ")) return "OS_EMITIDA";
    if (text.includes("execu")) return "EXECUCAO_INICIADA";
    if (text.includes("as-built") || text.includes("as built")) return "AS_BUILT_RECEBIDO";
    if (text.includes("atest")) return "NF_ATESTADA";
    if (text.includes("conclu")) return "SERVICO_CONCLUIDO";

    return null;
  }

  private buildFallbackTimeline(details: any): TimelineSummaryItem[] {
    const events: TimelineSummaryItem[] = [];
    const add = (
      code: string,
      at: Date | string | null | undefined,
      label: string,
      summary: string,
    ) => {
      if (!at) return;
      events.push({
        id: `fallback:${code}`,
        at,
        action: code,
        label,
        summary,
        actorName: null,
        source: "FALLBACK",
      });
    };

    add(
      "PROJETO_CRIADO",
      details.project.createdAt,
      "Projeto criado",
      `Projeto PRJ-${details.project.projectCode} criado`,
    );

    const finalizedEstimate = [...(details.documents.estimates ?? [])]
      .filter((estimate) => estimate.status === "FINALIZADA")
      .sort(
        (a, b) =>
          new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
      )[0];

    add(
      "ESTIMATIVA_FINALIZADA",
      finalizedEstimate?.createdAt,
      "Estimativa finalizada",
      finalizedEstimate
        ? `Estimativa EST-${finalizedEstimate.estimateCode} finalizada`
        : "Estimativa finalizada",
    );
    add(
      "NOTA_CREDITO_RECEBIDA",
      details.workflow.milestones.creditNoteReceivedAt,
      "Nota de Crédito recebida",
      `Nota de Crédito ${details.workflow.milestones.creditNoteNumber ?? ""} recebida`.trim(),
    );
    add(
      "DIEX_EMITIDO",
      details.workflow.milestones.diexIssuedAt ??
        details.documents.diexRequests?.[0]?.issuedAt ??
        details.documents.diexRequests?.[0]?.createdAt,
      "DIEx emitido",
      `DIEx ${details.workflow.milestones.diexNumber ?? details.documents.diexRequests?.[0]?.diexNumber ?? ""} emitido`.trim(),
    );
    add(
      "NOTA_EMPENHO_INFORMADA",
      details.workflow.milestones.commitmentNoteReceivedAt,
      "Nota de Empenho informada",
      `Nota de Empenho ${details.workflow.milestones.commitmentNoteNumber ?? ""} informada`.trim(),
    );
    add(
      "OS_EMITIDA",
      details.workflow.milestones.serviceOrderIssuedAt ??
        details.documents.serviceOrders?.[0]?.issuedAt ??
        details.documents.serviceOrders?.[0]?.createdAt,
      "Ordem de Serviço emitida",
      `OS ${details.workflow.milestones.serviceOrderNumber ?? details.documents.serviceOrders?.[0]?.serviceOrderNumber ?? ""} emitida`.trim(),
    );
    add(
      "OS_ASSINADA_RECEBIDA",
      details.workflow.milestones.signedServiceOrderReceivedAt,
      "OS assinada recebida",
      "Ordem de Serviço assinada pela contratada recebida e vinculada",
    );
    add(
      "EXECUCAO_INICIADA",
      details.workflow.milestones.executionStartedAt,
      "Execução iniciada",
      "Execução do serviço iniciada",
    );
    add(
      "AS_BUILT_RECEBIDO",
      details.workflow.milestones.asBuiltReceivedAt,
      "As-Built recebido",
      "As-Built recebido para análise",
    );
    add(
      "NF_ATESTADA",
      details.workflow.milestones.invoiceAttestedAt,
      "NF atestada",
      "Nota fiscal atestada",
    );
    add(
      "SERVICO_CONCLUIDO",
      details.workflow.milestones.serviceCompletedAt,
      "Serviço concluído",
      "Serviço concluído",
    );

    return events;
  }

  private buildTimelineSummary(details: any): TimelineSummaryItem[] {
    const relevantAuditEvents = ((details.timeline ?? []) as Array<{
      id: string;
      at: Date | string;
      action?: string;
      label?: string;
      summary?: string;
      actorName?: string | null;
    }>)
      .map((item) => ({
        ...item,
        flowCode: this.inferTimelineCode(item),
      }))
      .filter((item) => item.flowCode)
      .map((item) => ({
        id: item.id,
        at: item.at,
        action: item.flowCode as string,
        label: item.label ?? item.summary ?? item.flowCode ?? "Evento do fluxo",
        summary: item.summary ?? item.label ?? item.flowCode ?? "Evento do fluxo",
        actorName: item.actorName,
        source: "AUDIT" as const,
      }));
    const eventsByCode = new Map<string, TimelineSummaryItem>();

    for (const event of relevantAuditEvents) {
      if (!eventsByCode.has(event.action)) {
        eventsByCode.set(event.action, event);
      }
    }

    for (const event of this.buildFallbackTimeline(details)) {
      if (!eventsByCode.has(event.action)) {
        eventsByCode.set(event.action, event);
      }
    }

    return Array.from(eventsByCode.values())
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(0, 12);
  }

  async getProjectDossier(projectId: string, user: CurrentUser) {
    const details = await projectsService.getDetails(projectId, user);

    return {
      generatedAt: new Date().toISOString(),
      project: details.project,
      workflow: details.workflow,
      pendingActions: details.pendingActions,
      documents: details.documents,
      financialSummary: details.financialSummary,
      operationalSummary: details.operationalSummary,
      timelineSummary: this.buildTimelineSummary(details),
    };
  }

  async generateProjectDossierHtml(projectId: string, user: CurrentUser) {
    const dossier = await this.getProjectDossier(projectId, user);
    return renderProjectDossierHtml(dossier);
  }

  async generateProjectDossierPdf(projectId: string, user: CurrentUser) {
    return pdfService.renderPdf({
      label: `project-dossier:${projectId}`,
      buildHtml: () => this.generateProjectDossierHtml(projectId, user),
      pdfOptions: {
        format: "A4",
        landscape: false,
        printBackground: true,
        margin: {
          top: "12mm",
          right: "10mm",
          bottom: "12mm",
          left: "10mm",
        },
      },
    });
  }
}
