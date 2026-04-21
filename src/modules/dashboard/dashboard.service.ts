import { prisma } from "../../config/prisma.js";

type ProjectStage =
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

type AmountBreakdownItem = {
  label: string;
  count: number;
  totalAmount: string;
  percentage: number;
};

type CountBreakdownItem = {
  label: string;
  count: number;
  percentage: number;
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function formatAmount(value: number) {
  return value.toFixed(2);
}

function formatPercentage(value: number, total: number) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function aggregateAmounts<T>(
  items: T[],
  getLabel: (item: T) => string,
  getAmount: (item: T) => number
): AmountBreakdownItem[] {
  const map = new Map<string, { count: number; total: number }>();

  for (const item of items) {
    const label = getLabel(item);
    const amount = getAmount(item);

    const current = map.get(label) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += amount;
    map.set(label, current);
  }

  const grandTotal = Array.from(map.values()).reduce((sum, item) => sum + item.total, 0);

  return Array.from(map.entries())
    .map(([label, value]) => ({
      label,
      count: value.count,
      totalAmount: formatAmount(value.total),
      percentage: formatPercentage(value.total, grandTotal),
    }))
    .sort((a, b) => {
      const amountDiff = toNumber(b.totalAmount) - toNumber(a.totalAmount);
      if (amountDiff !== 0) return amountDiff;
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;
      return a.label.localeCompare(b.label);
    });
}

function aggregateCounts<T>(
  items: T[],
  getLabel: (item: T) => string
): CountBreakdownItem[] {
  const map = new Map<string, number>();

  for (const item of items) {
    const label = getLabel(item);
    map.set(label, (map.get(label) ?? 0) + 1);
  }

  const total = items.length;

  return Array.from(map.entries())
    .map(([label, count]) => ({
      label,
      count,
      percentage: formatPercentage(count, total),
    }))
    .sort((a, b) => {
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;
      return a.label.localeCompare(b.label);
    });
}

function mapAttentionReason(
  stage: ProjectStage,
  hasDraftDiex: boolean
) {
  if (stage === "ESTIMATIVA_PRECO") {
    return "Estimativa em elaboração";
  }

  if (stage === "AGUARDANDO_NOTA_CREDITO") {
    return "Aguardando Nota de Crédito";
  }

  if (stage === "DIEX_REQUISITORIO") {
    return hasDraftDiex
      ? "DIEx rascunho aguardando número/data da SALC"
      : "Aguardando Nota de Empenho";
  }

  if (stage === "AGUARDANDO_NOTA_EMPENHO") {
    return "Empenho informado, emitir Ordem de Serviço";
  }

  if (stage === "OS_LIBERADA") {
    return "OS emitida, aguardando início da execução";
  }

  if (stage === "SERVICO_EM_EXECUCAO") {
    return "Serviço em execução, aguardando As-Built";
  }

  if (stage === "ANALISANDO_AS_BUILT") {
    return "As-Built recebido, aguardando análise";
  }

  if (stage === "ATESTAR_NF") {
    return "Aguardando atesto da nota fiscal";
  }

  if (stage === "SERVICO_CONCLUIDO") {
    return "Serviço concluído";
  }

  return "Projeto cancelado";
}

export class DashboardService {
  async overview() {
    const [
      usersTotal,
      usersActive,
      usersInactive,
      atasTotal,
      ataItemsTotal,
      projects,
      tasks,
      estimates,
      diexRequests,
      serviceOrders,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.user.count({ where: { active: false } }),
      prisma.ata.count(),
      prisma.ataItem.count(),
      prisma.project.findMany({
        select: {
          id: true,
          projectCode: true,
          title: true,
          status: true,
          stage: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      prisma.task.findMany({
        select: {
          id: true,
          status: true,
        },
      }),
      prisma.estimate.findMany({
        select: {
          id: true,
          estimateCode: true,
          projectId: true,
          status: true,
          totalAmount: true,
          omName: true,
          destinationCityName: true,
          destinationStateUf: true,
          updatedAt: true,
          project: {
            select: {
              projectCode: true,
              title: true,
              stage: true,
              status: true,
            },
          },
          ata: {
            select: {
              ataCode: true,
              number: true,
              type: true,
              vendorName: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      prisma.diexRequest.findMany({
        select: {
          id: true,
          diexCode: true,
          projectId: true,
          diexNumber: true,
          issuedAt: true,
          totalAmount: true,
          updatedAt: true,
          project: {
            select: {
              projectCode: true,
              title: true,
              stage: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      prisma.serviceOrder.findMany({
        select: {
          id: true,
          serviceOrderCode: true,
          serviceOrderNumber: true,
          projectId: true,
          isEmergency: true,
          plannedStartDate: true,
          plannedEndDate: true,
          totalAmount: true,
          updatedAt: true,
          project: {
            select: {
              projectCode: true,
              title: true,
              stage: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
    ]);

    const totalEstimatedAmountNumber = estimates.reduce(
      (sum, estimate) => sum + toNumber(estimate.totalAmount),
      0
    );

    const totalWithDiexNumber = diexRequests.reduce(
      (sum, diex) => sum + toNumber(diex.totalAmount),
      0
    );

    const totalWithServiceOrderNumber = serviceOrders.reduce(
      (sum, serviceOrder) => sum + toNumber(serviceOrder.totalAmount),
      0
    );

    const projectAmountMap = new Map<string, number>();

    for (const estimate of estimates) {
      const current = projectAmountMap.get(estimate.projectId) ?? 0;
      projectAmountMap.set(
        estimate.projectId,
        current + toNumber(estimate.totalAmount)
      );
    }

    const openProjects = projects.filter(
      (project) =>
        project.status !== "CONCLUIDO" && project.stage !== "CANCELADO"
    );

    const completedProjects = projects.filter(
      (project) =>
        project.status === "CONCLUIDO" || project.stage === "SERVICO_CONCLUIDO"
    );

    const canceledProjects = projects.filter(
      (project) => project.stage === "CANCELADO" || project.status === "CANCELADO"
    );

    const completedProjectsAmountNumber = completedProjects.reduce(
      (sum, project) => sum + (projectAmountMap.get(project.id) ?? 0),
      0
    );

    const diexFormalized = diexRequests.filter(
      (diex) => Boolean(diex.diexNumber) && Boolean(diex.issuedAt)
    );

    const diexDrafts = diexRequests.filter(
      (diex) => !diex.diexNumber || !diex.issuedAt
    );

    const draftDiexProjectIds = new Set(diexDrafts.map((diex) => diex.projectId));

    const projectsByStage = projects
      .reduce<
        Array<{
          stage: string;
          count: number;
          percentage: number;
          totalEstimatedAmount: string;
        }>
      >((acc, project, _, source) => {
        const existing = acc.find((item) => item.stage === project.stage);

        if (existing) {
          existing.count += 1;
          existing.totalEstimatedAmount = formatAmount(
            toNumber(existing.totalEstimatedAmount) +
              (projectAmountMap.get(project.id) ?? 0)
          );
          existing.percentage = formatPercentage(existing.count, source.length);
          return acc;
        }

        acc.push({
          stage: project.stage,
          count: 1,
          percentage: formatPercentage(1, source.length),
          totalEstimatedAmount: formatAmount(projectAmountMap.get(project.id) ?? 0),
        });

        return acc;
      }, [])
      .sort((a, b) => {
        const countDiff = b.count - a.count;
        if (countDiff !== 0) return countDiff;
        return a.stage.localeCompare(b.stage);
      });

    const projectsByStatus = aggregateCounts(projects, (project) => project.status);
    const tasksByStatus = aggregateCounts(tasks, (task) => task.status);
    const estimatesByStatus = aggregateCounts(estimates, (estimate) => estimate.status);

    const byEstimateStatus = aggregateAmounts(
      estimates,
      (estimate) => estimate.status,
      (estimate) => toNumber(estimate.totalAmount)
    );

    const byAtaType = aggregateAmounts(
      estimates,
      (estimate) => estimate.ata.type,
      (estimate) => toNumber(estimate.totalAmount)
    );

    const byStateUf = aggregateAmounts(
      estimates,
      (estimate) => estimate.destinationStateUf,
      (estimate) => toNumber(estimate.totalAmount)
    );

    const byCity = aggregateAmounts(
      estimates,
      (estimate) =>
        `${estimate.destinationCityName}/${estimate.destinationStateUf}`,
      (estimate) => toNumber(estimate.totalAmount)
    );

    const byOm = aggregateAmounts(
      estimates,
      (estimate) => estimate.omName || "OM não informada",
      (estimate) => toNumber(estimate.totalAmount)
    );

    const attention = openProjects
      .map((project) => ({
        id: project.id,
        projectCode: project.projectCode,
        title: project.title,
        status: project.status,
        stage: project.stage,
        updatedAt: project.updatedAt,
        totalEstimatedAmount: formatAmount(projectAmountMap.get(project.id) ?? 0),
        reason: mapAttentionReason(
          project.stage as ProjectStage,
          draftDiexProjectIds.has(project.id)
        ),
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 10);

    return {
      generatedAt: new Date().toISOString(),

      summary: {
        projectsOpen: openProjects.length,
        projectsCompleted: completedProjects.length,
        projectsCanceled: canceledProjects.length,
        estimatesFinalized: estimates.filter(
          (estimate) => estimate.status === "FINALIZADA"
        ).length,
        diexIssued: diexFormalized.length,
        serviceOrdersIssued: serviceOrders.length,
        totalEstimatedAmount: formatAmount(totalEstimatedAmountNumber),
        projectsNeedingAttention: attention.length,
      },

      totals: {
        users: {
          total: usersTotal,
          active: usersActive,
          inactive: usersInactive,
        },
        projects: projects.length,
        tasks: tasks.length,
        estimates: estimates.length,
        atas: atasTotal,
        ataItems: ataItemsTotal,
      },

      documents: {
        diex: {
          total: diexRequests.length,
          withNumber: diexFormalized.length,
          draft: diexDrafts.length,
        },
        serviceOrders: {
          total: serviceOrders.length,
          emergency: serviceOrders.filter((item) => item.isEmergency).length,
          scheduled: serviceOrders.filter(
            (item) => item.plannedStartDate && item.plannedEndDate
          ).length,
        },
      },

      pendingActions: {
        awaitingCreditNote: projects.filter(
          (project) => project.stage === "AGUARDANDO_NOTA_CREDITO"
        ).length,
        awaitingDiexFormalization: diexDrafts.length,
        awaitingCommitmentNote: projects.filter(
          (project) => project.stage === "DIEX_REQUISITORIO"
        ).length,
        awaitingServiceOrder: projects.filter(
          (project) => project.stage === "AGUARDANDO_NOTA_EMPENHO"
        ).length,
        awaitingExecutionStart: projects.filter(
          (project) => project.stage === "OS_LIBERADA"
        ).length,
        awaitingAsBuiltAnalysis: projects.filter(
          (project) => project.stage === "ANALISANDO_AS_BUILT"
        ).length,
        awaitingInvoiceAttestation: projects.filter(
          (project) => project.stage === "ATESTAR_NF"
        ).length,
      },

      financial: {
        totalEstimatedAmount: formatAmount(totalEstimatedAmountNumber),
        totalWithDiex: formatAmount(totalWithDiexNumber),
        totalWithServiceOrder: formatAmount(totalWithServiceOrderNumber),
        totalCompletedProjectsAmount: formatAmount(completedProjectsAmountNumber),
        byEstimateStatus,
        byAtaType,
      },

      pipeline: {
        projectsByStage,
        projectsByStatus,
        tasksByStatus,
        estimatesByStatus,
      },

      attention,

      rankings: {
        byStateUf: byStateUf.slice(0, 5),
        byCity: byCity.slice(0, 5),
        byOm: byOm.slice(0, 5),
      },

      openProjects: {
        total: openProjects.length,
        recent: openProjects.slice(0, 5).map((project) => ({
          id: project.id,
          projectCode: project.projectCode,
          title: project.title,
          status: project.status,
          stage: project.stage,
          updatedAt: project.updatedAt,
        })),
      },

      completedProjects: {
        total: completedProjects.length,
        recent: completedProjects.slice(0, 5).map((project) => ({
          id: project.id,
          projectCode: project.projectCode,
          title: project.title,
          status: project.status,
          stage: project.stage,
          updatedAt: project.updatedAt,
        })),
      },

      canceledProjects: {
        total: canceledProjects.length,
        recent: canceledProjects.slice(0, 5).map((project) => ({
          id: project.id,
          projectCode: project.projectCode,
          title: project.title,
          status: project.status,
          stage: project.stage,
          updatedAt: project.updatedAt,
        })),
      },

      recent: {
        projects: projects.slice(0, 5).map((project) => ({
          id: project.id,
          projectCode: project.projectCode,
          title: project.title,
          status: project.status,
          stage: project.stage,
          updatedAt: project.updatedAt,
        })),
        estimates: estimates.slice(0, 5).map((estimate) => ({
          id: estimate.id,
          estimateCode: estimate.estimateCode,
          status: estimate.status,
          totalAmount: formatAmount(toNumber(estimate.totalAmount)),
          destinationCityName: estimate.destinationCityName,
          destinationStateUf: estimate.destinationStateUf,
          updatedAt: estimate.updatedAt,
          project: {
            projectCode: estimate.project.projectCode,
            title: estimate.project.title,
            stage: estimate.project.stage,
            status: estimate.project.status,
          },
          ata: {
            ataCode: estimate.ata.ataCode,
            number: estimate.ata.number,
            type: estimate.ata.type,
          },
        })),
        diex: diexRequests.slice(0, 5).map((diex) => ({
          id: diex.id,
          diexCode: diex.diexCode,
          diexNumber: diex.diexNumber,
          issuedAt: diex.issuedAt,
          totalAmount: formatAmount(toNumber(diex.totalAmount)),
          updatedAt: diex.updatedAt,
          isDraft: !diex.diexNumber || !diex.issuedAt,
          project: {
            projectCode: diex.project.projectCode,
            title: diex.project.title,
            stage: diex.project.stage,
          },
        })),
        serviceOrders: serviceOrders.slice(0, 5).map((serviceOrder) => ({
          id: serviceOrder.id,
          serviceOrderCode: serviceOrder.serviceOrderCode,
          serviceOrderNumber: serviceOrder.serviceOrderNumber,
          isEmergency: serviceOrder.isEmergency,
          plannedStartDate: serviceOrder.plannedStartDate,
          plannedEndDate: serviceOrder.plannedEndDate,
          totalAmount: formatAmount(toNumber(serviceOrder.totalAmount)),
          updatedAt: serviceOrder.updatedAt,
          project: {
            projectCode: serviceOrder.project.projectCode,
            title: serviceOrder.project.title,
            stage: serviceOrder.project.stage,
          },
        })),
      },
    };
  }
}