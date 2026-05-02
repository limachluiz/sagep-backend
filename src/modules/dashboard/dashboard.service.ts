import { prisma } from "../../config/prisma.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";
import { OperationalAlertsService } from "../operational-alerts/operational-alerts.service.js";
import { permissionsService } from "../permissions/permissions.service.js";
import { workflowService } from "../workflow/workflow.service.js";
import type {
  DashboardExecutiveQuery,
  DashboardOperationalQuery,
  DashboardOverviewQuery,
} from "./dashboard.schemas.js";

type CurrentUser = {
  id: string;
  role: string;
};

type DashboardPeriodType = "month" | "quarter" | "semester" | "year";

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

type DashboardProjectView = {
  id: string;
  projectCode: number;
  title: string;
  stage: ProjectStage;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

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

type DashboardAtaItemSnapshot = {
  id: string;
  ataItemCode: number;
  referenceCode: string;
  description: string;
  unitPrice: { toString(): string };
  initialQuantity: { toString(): string };
  isActive: boolean;
  deletedAt: Date | null;
  ata: {
    ataCode: number;
    number: string;
    type: string;
    vendorName: string;
  };
  balance: {
    initialQuantity: string;
    reservedQuantity: string;
    consumedQuantity: string;
    availableQuantity: string;
    initialAmount: string;
    reservedAmount: string;
    consumedAmount: string;
    availableAmount: string;
    lowStock: boolean;
    insufficient: boolean;
    lastMovementAt: Date | null;
  };
};

type FilterContext =
  | {
      mode: "all";
      label: string;
      periodType: null;
      referenceDate: null;
      startDate: null;
      endDate: null;
      asOfDate: null;
    }
  | {
      mode: "interval";
      label: string;
      periodType: DashboardPeriodType | null;
      referenceDate: Date | null;
      startDate: Date;
      endDate: Date;
      asOfDate: null;
    }
  | {
      mode: "as_of";
      label: string;
      periodType: null;
      referenceDate: null;
      startDate: null;
      endDate: null;
      asOfDate: Date;
    };

const STAGE_ORDER: ProjectStage[] = [
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

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function serializeDate(date: Date | null) {
  return date ? date.toISOString() : null;
}

function formatDateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPeriodRange(periodType: DashboardPeriodType, referenceDate: Date) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  if (periodType === "month") {
    const startDate = startOfDay(new Date(year, month, 1));
    const endDate = endOfDay(new Date(year, month + 1, 0));

    return {
      startDate,
      endDate,
      label: `Mês de referência: ${formatDateLabel(referenceDate)}`,
    };
  }

  if (periodType === "quarter") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    const startDate = startOfDay(new Date(year, quarterStartMonth, 1));
    const endDate = endOfDay(new Date(year, quarterStartMonth + 3, 0));

    return {
      startDate,
      endDate,
      label: `Trimestre de referência: ${formatDateLabel(referenceDate)}`,
    };
  }

  if (periodType === "semester") {
    const semesterStartMonth = month < 6 ? 0 : 6;
    const startDate = startOfDay(new Date(year, semesterStartMonth, 1));
    const endDate = endOfDay(new Date(year, semesterStartMonth + 6, 0));

    return {
      startDate,
      endDate,
      label: `Semestre de referência: ${formatDateLabel(referenceDate)}`,
    };
  }

  const startDate = startOfDay(new Date(year, 0, 1));
  const endDate = endOfDay(new Date(year, 11, 31));

  return {
    startDate,
    endDate,
    label: `Ano de referência: ${formatDateLabel(referenceDate)}`,
  };
}

function buildFilterContext(filters: DashboardOverviewQuery): FilterContext {
  if (filters.startDate && filters.endDate) {
    return {
      mode: "interval",
      label: `Intervalo manual: ${formatDateLabel(filters.startDate)} até ${formatDateLabel(filters.endDate)}`,
      periodType: null,
      referenceDate: null,
      startDate: startOfDay(filters.startDate),
      endDate: endOfDay(filters.endDate),
      asOfDate: null,
    };
  }

  if (filters.periodType) {
    const referenceDate = filters.referenceDate ?? new Date();
    const range = getPeriodRange(filters.periodType, referenceDate);

    return {
      mode: "interval",
      label: range.label,
      periodType: filters.periodType,
      referenceDate,
      startDate: range.startDate,
      endDate: range.endDate,
      asOfDate: null,
    };
  }

  if (filters.asOfDate) {
    return {
      mode: "as_of",
      label: `Posição acumulada até ${formatDateLabel(filters.asOfDate)}`,
      periodType: null,
      referenceDate: null,
      startDate: null,
      endDate: null,
      asOfDate: endOfDay(filters.asOfDate),
    };
  }

  return {
    mode: "all",
    label: "Visão geral acumulada",
    periodType: null,
    referenceDate: null,
    startDate: null,
    endDate: null,
    asOfDate: null,
  };
}

function isDateInScope(date: Date | null | undefined, filterContext: FilterContext) {
  if (!date) return false;

  if (filterContext.mode === "all") {
    return true;
  }

  if (filterContext.mode === "interval") {
    return date >= filterContext.startDate && date <= filterContext.endDate;
  }

  return date <= filterContext.asOfDate;
}

function filterByScope<T>(
  items: T[],
  getDate: (item: T) => Date | null | undefined,
  filterContext: FilterContext
) {
  if (filterContext.mode === "all") {
    return items;
  }

  return items.filter((item) => isDateInScope(getDate(item), filterContext));
}

function sortByUpdatedAtDesc<T extends { updatedAt: Date }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
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

function mapAttentionReason(stage: ProjectStage, hasDraftDiex: boolean) {
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

function mapStatusFromStage(stage: ProjectStage) {
  if (stage === "SERVICO_CONCLUIDO") return "CONCLUIDO";
  if (stage === "CANCELADO") return "CANCELADO";

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

function sumBalanceField(
  items: DashboardAtaItemSnapshot[],
  getValue: (item: DashboardAtaItemSnapshot) => string,
) {
  return items.reduce((sum, item) => sum + toNumber(getValue(item)), 0);
}

function getProjectSnapshotAsOf(
  project: {
    id: string;
    projectCode: number;
    title: string;
    stage: ProjectStage;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    creditNoteReceivedAt: Date | null;
    diexIssuedAt: Date | null;
    commitmentNoteReceivedAt: Date | null;
    serviceOrderIssuedAt: Date | null;
    executionStartedAt: Date | null;
    asBuiltReceivedAt: Date | null;
    invoiceAttestedAt: Date | null;
    serviceCompletedAt: Date | null;
    estimates: Array<{ createdAt: Date }>;
    diexRequests: Array<{ createdAt: Date }>;
  },
  asOfDate: Date
): DashboardProjectView | null {
  if (project.createdAt > asOfDate) {
    return null;
  }

  let snapshotStage: ProjectStage = "ESTIMATIVA_PRECO";

  if (
    (project.stage === "CANCELADO" || project.status === "CANCELADO") &&
    project.updatedAt <= asOfDate
  ) {
    snapshotStage = "CANCELADO";
  } else if (project.serviceCompletedAt && project.serviceCompletedAt <= asOfDate) {
    snapshotStage = "SERVICO_CONCLUIDO";
  } else if (project.invoiceAttestedAt && project.invoiceAttestedAt <= asOfDate) {
    snapshotStage = "ATESTAR_NF";
  } else if (project.asBuiltReceivedAt && project.asBuiltReceivedAt <= asOfDate) {
    snapshotStage = "ANALISANDO_AS_BUILT";
  } else if (project.executionStartedAt && project.executionStartedAt <= asOfDate) {
    snapshotStage = "SERVICO_EM_EXECUCAO";
  } else if (project.serviceOrderIssuedAt && project.serviceOrderIssuedAt <= asOfDate) {
    snapshotStage = "OS_LIBERADA";
  } else if (
    project.commitmentNoteReceivedAt &&
    project.commitmentNoteReceivedAt <= asOfDate
  ) {
    snapshotStage = "AGUARDANDO_NOTA_EMPENHO";
  } else if (project.diexRequests.some((diex) => diex.createdAt <= asOfDate)) {
    snapshotStage = "DIEX_REQUISITORIO";
  } else if (project.estimates.some((estimate) => estimate.createdAt <= asOfDate)) {
    snapshotStage = "AGUARDANDO_NOTA_CREDITO";
  }

  return {
    id: project.id,
    projectCode: project.projectCode,
    title: project.title,
    stage: snapshotStage,
    status: mapStatusFromStage(snapshotStage),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

const operationalAlertsService = new OperationalAlertsService();

export class DashboardService {
  private isPrivileged(role: string) {
    return permissionsService.hasPermission({ role }, "projects.view_all");
  }

  private getProjectAccessWhere(user: CurrentUser) {
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

  private async getAtaItemSnapshots() {
    const ataItems = await prisma.ataItem.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        ataItemCode: true,
        referenceCode: true,
        description: true,
        unitPrice: true,
        initialQuantity: true,
        isActive: true,
        deletedAt: true,
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
        ataItemCode: "asc",
      },
    });

    return ataItemBalanceService.enrichAtaItemsWithBalance(ataItems) as Promise<
      DashboardAtaItemSnapshot[]
    >;
  }

  private buildInventoryOperationalBlock(
    ataItems: DashboardAtaItemSnapshot[],
    alerts: Awaited<ReturnType<OperationalAlertsService["list"]>>,
  ) {
    const lowStockItems = ataItems.filter((item) => item.balance.lowStock);
    const insufficientItems = ataItems.filter((item) => item.balance.insufficient);
    const reservedItems = ataItems.filter(
      (item) => toNumber(item.balance.reservedQuantity) > 0,
    );
    const consumedItems = ataItems.filter(
      (item) => toNumber(item.balance.consumedQuantity) > 0,
    );
    const criticalItems = [...ataItems]
      .filter(
        (item) =>
          item.balance.insufficient ||
          item.balance.lowStock ||
          toNumber(item.balance.reservedQuantity) > 0,
      )
      .sort((a, b) => {
        const scoreA =
          (a.balance.insufficient ? 100 : 0) +
          (a.balance.lowStock ? 10 : 0) +
          toNumber(a.balance.reservedQuantity);
        const scoreB =
          (b.balance.insufficient ? 100 : 0) +
          (b.balance.lowStock ? 10 : 0) +
          toNumber(b.balance.reservedQuantity);

        if (scoreB !== scoreA) return scoreB - scoreA;

        return toNumber(a.balance.availableQuantity) - toNumber(b.balance.availableQuantity);
      })
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        ataItemCode: item.ataItemCode,
        referenceCode: item.referenceCode,
        description: item.description,
        ata: item.ata,
        balance: item.balance,
      }));

    return {
      summary: {
        totalItems: ataItems.length,
        lowStockItems: lowStockItems.length,
        insufficientItems: insufficientItems.length,
        itemsWithActiveReserve: reservedItems.length,
        itemsWithActiveConsumption: consumedItems.length,
        recentReversals: alerts.inventoryAlerts.reversals.length,
        staleReservations: alerts.inventoryAlerts.staleReservations.length,
        totalReservedAmount: formatAmount(sumBalanceField(ataItems, (item) => item.balance.reservedAmount)),
        totalConsumedAmount: formatAmount(sumBalanceField(ataItems, (item) => item.balance.consumedAmount)),
        totalAvailableAmount: formatAmount(sumBalanceField(ataItems, (item) => item.balance.availableAmount)),
      },
      criticalItems,
      staleReservations: alerts.inventoryAlerts.staleReservations.slice(0, 10),
      recentReversals: alerts.inventoryAlerts.reversals.slice(0, 10),
    };
  }

  private buildInventoryExecutiveBlock(
    ataItems: DashboardAtaItemSnapshot[],
    movements: Array<{
      movementType: string;
      totalAmount: { toString(): string };
      quantity: { toString(): string };
      createdAt: Date;
      ataItem: {
        ata: {
          type: string;
          vendorName: string;
        };
      };
    }>,
    filterContext: FilterContext,
  ) {
    const scopedMovements = filterByScope(movements, (movement) => movement.createdAt, filterContext);
    const lowStockItems = ataItems.filter((item) => item.balance.lowStock);
    const insufficientItems = ataItems.filter((item) => item.balance.insufficient);
    const reservedItems = ataItems.filter((item) => toNumber(item.balance.reservedQuantity) > 0);
    const consumedItems = ataItems.filter((item) => toNumber(item.balance.consumedQuantity) > 0);
    const reversalMovements = scopedMovements.filter(
      (movement) => movement.movementType === "REVERSE_CONSUME",
    );

    const movementSummary = {
      totalReservedAmount: formatAmount(
        scopedMovements
          .filter((movement) => movement.movementType === "RESERVE")
          .reduce((sum, movement) => sum + toNumber(movement.totalAmount), 0),
      ),
      totalConsumedAmount: formatAmount(
        scopedMovements
          .filter((movement) => movement.movementType === "CONSUME")
          .reduce((sum, movement) => sum + toNumber(movement.totalAmount), 0),
      ),
      totalReversedAmount: formatAmount(
        reversalMovements.reduce((sum, movement) => sum + toNumber(movement.totalAmount), 0),
      ),
      totalReleasedAmount: formatAmount(
        scopedMovements
          .filter((movement) => movement.movementType === "RELEASE")
          .reduce((sum, movement) => sum + toNumber(movement.totalAmount), 0),
      ),
      reserveMovements: scopedMovements.filter((movement) => movement.movementType === "RESERVE")
        .length,
      consumeMovements: scopedMovements.filter((movement) => movement.movementType === "CONSUME")
        .length,
      reverseMovements: reversalMovements.length,
    };

    return {
      snapshot: {
        itemsAtRisk: lowStockItems.length,
        itemsInsufficient: insufficientItems.length,
        itemsWithActiveReserve: reservedItems.length,
        itemsWithActiveConsumption: consumedItems.length,
        totalReservedAmount: formatAmount(sumBalanceField(ataItems, (item) => item.balance.reservedAmount)),
        totalConsumedAmount: formatAmount(sumBalanceField(ataItems, (item) => item.balance.consumedAmount)),
        totalAvailableAmount: formatAmount(sumBalanceField(ataItems, (item) => item.balance.availableAmount)),
      },
      periodActivity: movementSummary,
      distribution: {
        byAtaType: aggregateAmounts(
          scopedMovements,
          (movement) => movement.ataItem.ata.type,
          (movement) => toNumber(movement.totalAmount),
        ),
        byVendor: aggregateAmounts(
          scopedMovements,
          (movement) => movement.ataItem.ata.vendorName,
          (movement) => toNumber(movement.totalAmount),
        ).slice(0, 10),
      },
      criticalItems: [...ataItems]
        .filter((item) => item.balance.lowStock || item.balance.insufficient)
        .sort(
          (a, b) =>
            toNumber(a.balance.availableAmount) - toNumber(b.balance.availableAmount),
        )
        .slice(0, 10)
        .map((item) => ({
          id: item.id,
          ataItemCode: item.ataItemCode,
          referenceCode: item.referenceCode,
          description: item.description,
          ata: item.ata,
          balance: item.balance,
        })),
    };
  }

  async overview(filters: DashboardOverviewQuery = {}) {
    const filterContext = buildFilterContext(filters);

    const [
      usersTotal,
      usersActive,
      usersInactive,
      atasTotal,
      ataItemsTotal,
      rawProjects,
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
        where: {
          archivedAt: null,
          deletedAt: null,
        },
        select: {
          id: true,
          projectCode: true,
          title: true,
          status: true,
          stage: true,
          createdAt: true,
          updatedAt: true,
          creditNoteReceivedAt: true,
          diexIssuedAt: true,
          commitmentNoteReceivedAt: true,
          serviceOrderIssuedAt: true,
          executionStartedAt: true,
          asBuiltReceivedAt: true,
          invoiceAttestedAt: true,
          serviceCompletedAt: true,
          estimates: {
            where: {
              archivedAt: null,
              deletedAt: null,
            },
            select: {
              createdAt: true,
            },
          },
          diexRequests: {
            where: {
              archivedAt: null,
              deletedAt: null,
            },
            select: {
              createdAt: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      prisma.task.findMany({
        where: {
          archivedAt: null,
          deletedAt: null,
          project: {
            deletedAt: null,
          },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.estimate.findMany({
        where: {
          archivedAt: null,
          deletedAt: null,
          project: {
            deletedAt: null,
          },
        },
        select: {
          id: true,
          estimateCode: true,
          projectId: true,
          status: true,
          totalAmount: true,
          omName: true,
          destinationCityName: true,
          destinationStateUf: true,
          createdAt: true,
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
        where: {
          archivedAt: null,
          deletedAt: null,
          project: {
            deletedAt: null,
          },
          estimate: {
            deletedAt: null,
          },
        },
        select: {
          id: true,
          diexCode: true,
          projectId: true,
          diexNumber: true,
          issuedAt: true,
          totalAmount: true,
          createdAt: true,
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
        where: {
          archivedAt: null,
          deletedAt: null,
          project: {
            deletedAt: null,
          },
          estimate: {
            deletedAt: null,
          },
          OR: [
            {
              diexRequestId: null,
            },
            {
              diexRequest: {
                deletedAt: null,
              },
            },
          ],
        },
        select: {
          id: true,
          serviceOrderCode: true,
          serviceOrderNumber: true,
          projectId: true,
          isEmergency: true,
          plannedStartDate: true,
          plannedEndDate: true,
          issuedAt: true,
          totalAmount: true,
          createdAt: true,
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

    const scopedProjects: DashboardProjectView[] =
      filterContext.mode === "as_of"
        ? rawProjects
            .map((project) =>
              getProjectSnapshotAsOf(project, filterContext.asOfDate)
            )
            .filter((project): project is DashboardProjectView => Boolean(project))
        : filterByScope(rawProjects, (project) => project.createdAt, filterContext).map(
            (project) => ({
              id: project.id,
              projectCode: project.projectCode,
              title: project.title,
              stage: project.stage,
              status: project.status,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            })
          );

    const scopedTasks = filterByScope(tasks, (task) => task.createdAt, filterContext);
    const scopedEstimates = filterByScope(
      estimates,
      (estimate) => estimate.createdAt,
      filterContext
    );
    const scopedDiex = filterByScope(
      diexRequests,
      (diex) => diex.createdAt,
      filterContext
    );
    const scopedServiceOrders = filterByScope(
      serviceOrders,
      (serviceOrder) => serviceOrder.createdAt,
      filterContext
    );

    const formalizedDiex =
      filterContext.mode === "all"
        ? diexRequests.filter((diex) => Boolean(diex.diexNumber) && Boolean(diex.issuedAt))
        : diexRequests.filter(
            (diex) =>
              Boolean(diex.diexNumber) &&
              Boolean(diex.issuedAt) &&
              isDateInScope(diex.issuedAt, filterContext)
          );

    const draftDiex = scopedDiex.filter((diex) => !diex.diexNumber || !diex.issuedAt);
    const draftDiexProjectIds = new Set(draftDiex.map((diex) => diex.projectId));

    const projectAmountMap = new Map<string, number>();

    for (const estimate of scopedEstimates) {
      const current = projectAmountMap.get(estimate.projectId) ?? 0;
      projectAmountMap.set(
        estimate.projectId,
        current + toNumber(estimate.totalAmount)
      );
    }

    const totalEstimatedAmountNumber = scopedEstimates.reduce(
      (sum, estimate) => sum + toNumber(estimate.totalAmount),
      0
    );

    const totalWithDiexNumber = scopedDiex.reduce(
      (sum, diex) => sum + toNumber(diex.totalAmount),
      0
    );

    const totalWithServiceOrderNumber = scopedServiceOrders.reduce(
      (sum, serviceOrder) => sum + toNumber(serviceOrder.totalAmount),
      0
    );

    const openProjects = scopedProjects.filter(
      (project) =>
        project.status !== "CONCLUIDO" && project.stage !== "CANCELADO"
    );

    const completedProjects = scopedProjects.filter(
      (project) =>
        project.status === "CONCLUIDO" || project.stage === "SERVICO_CONCLUIDO"
    );

    const canceledProjects = scopedProjects.filter(
      (project) => project.stage === "CANCELADO" || project.status === "CANCELADO"
    );

    const completedProjectsAmountNumber = completedProjects.reduce(
      (sum, project) => sum + (projectAmountMap.get(project.id) ?? 0),
      0
    );

    const projectsByStage = STAGE_ORDER.map((stage) => {
      const matchingProjects = scopedProjects.filter((project) => project.stage === stage);
      const totalAmount = matchingProjects.reduce(
        (sum, project) => sum + (projectAmountMap.get(project.id) ?? 0),
        0
      );

      return {
        stage,
        count: matchingProjects.length,
        percentage: formatPercentage(matchingProjects.length, scopedProjects.length),
        totalEstimatedAmount: formatAmount(totalAmount),
      };
    }).filter((item) => item.count > 0);

    const projectsByStatus = aggregateCounts(scopedProjects, (project) => project.status);
    const tasksByStatus = aggregateCounts(scopedTasks, (task) => task.status);
    const estimatesByStatus = aggregateCounts(
      scopedEstimates,
      (estimate) => estimate.status
    );

    const byEstimateStatus = aggregateAmounts(
      scopedEstimates,
      (estimate) => estimate.status,
      (estimate) => toNumber(estimate.totalAmount)
    );

    const byAtaType = aggregateAmounts(
      scopedEstimates,
      (estimate) => estimate.ata.type,
      (estimate) => toNumber(estimate.totalAmount)
    );

    const byStateUf = aggregateAmounts(
      scopedEstimates,
      (estimate) => estimate.destinationStateUf,
      (estimate) => toNumber(estimate.totalAmount)
    );

    const byCity = aggregateAmounts(
      scopedEstimates,
      (estimate) => `${estimate.destinationCityName}/${estimate.destinationStateUf}`,
      (estimate) => toNumber(estimate.totalAmount)
    );

    const byOm = aggregateAmounts(
      scopedEstimates,
      (estimate) => estimate.omName || "OM não informada",
      (estimate) => toNumber(estimate.totalAmount)
    );

    const attention = sortByUpdatedAtDesc(openProjects)
      .map((project) => ({
        id: project.id,
        projectCode: project.projectCode,
        title: project.title,
        status: project.status,
        stage: project.stage,
        updatedAt: project.updatedAt,
        totalEstimatedAmount: formatAmount(projectAmountMap.get(project.id) ?? 0),
        reason: mapAttentionReason(
          project.stage,
          draftDiexProjectIds.has(project.id)
        ),
      }))
      .slice(0, 10);

    return {
      generatedAt: new Date().toISOString(),

      filter: {
        mode: filterContext.mode,
        label: filterContext.label,
        periodType: filterContext.periodType,
        referenceDate: serializeDate(filterContext.referenceDate),
        startDate: serializeDate(filterContext.startDate),
        endDate: serializeDate(filterContext.endDate),
        asOfDate: serializeDate(filterContext.asOfDate),
      },

      summary: {
        projectsOpen: openProjects.length,
        projectsCompleted: completedProjects.length,
        projectsCanceled: canceledProjects.length,
        estimatesFinalized: scopedEstimates.filter(
          (estimate) => estimate.status === "FINALIZADA"
        ).length,
        diexIssued: formalizedDiex.length,
        serviceOrdersIssued: scopedServiceOrders.length,
        totalEstimatedAmount: formatAmount(totalEstimatedAmountNumber),
        projectsNeedingAttention: attention.length,
      },

      totals: {
        users: {
          total: usersTotal,
          active: usersActive,
          inactive: usersInactive,
        },
        projects: scopedProjects.length,
        tasks: scopedTasks.length,
        estimates: scopedEstimates.length,
        diex: scopedDiex.length,
        serviceOrders: scopedServiceOrders.length,
        atas: atasTotal,
        ataItems: ataItemsTotal,
      },

      documents: {
        diex: {
          total: scopedDiex.length,
          withNumber: formalizedDiex.length,
          draft: draftDiex.length,
        },
        serviceOrders: {
          total: scopedServiceOrders.length,
          emergency: scopedServiceOrders.filter((item) => item.isEmergency).length,
          scheduled: scopedServiceOrders.filter(
            (item) => item.plannedStartDate && item.plannedEndDate
          ).length,
        },
      },

      pendingActions: {
        awaitingCreditNote: scopedProjects.filter(
          (project) => project.stage === "AGUARDANDO_NOTA_CREDITO"
        ).length,
        awaitingDiexFormalization: draftDiex.length,
        awaitingCommitmentNote: scopedProjects.filter(
          (project) => project.stage === "DIEX_REQUISITORIO"
        ).length,
        awaitingServiceOrder: scopedProjects.filter(
          (project) => project.stage === "AGUARDANDO_NOTA_EMPENHO"
        ).length,
        awaitingExecutionStart: scopedProjects.filter(
          (project) => project.stage === "OS_LIBERADA"
        ).length,
        awaitingAsBuiltAnalysis: scopedProjects.filter(
          (project) => project.stage === "ANALISANDO_AS_BUILT"
        ).length,
        awaitingInvoiceAttestation: scopedProjects.filter(
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
        recent: sortByUpdatedAtDesc(openProjects).slice(0, 5).map((project) => ({
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
        recent: sortByUpdatedAtDesc(completedProjects).slice(0, 5).map((project) => ({
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
        recent: sortByUpdatedAtDesc(canceledProjects).slice(0, 5).map((project) => ({
          id: project.id,
          projectCode: project.projectCode,
          title: project.title,
          status: project.status,
          stage: project.stage,
          updatedAt: project.updatedAt,
        })),
      },

      recent: {
        projects: sortByUpdatedAtDesc(scopedProjects).slice(0, 5).map((project) => ({
          id: project.id,
          projectCode: project.projectCode,
          title: project.title,
          status: project.status,
          stage: project.stage,
          updatedAt: project.updatedAt,
        })),
        estimates: sortByUpdatedAtDesc(scopedEstimates).slice(0, 5).map((estimate) => ({
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
        diex: sortByUpdatedAtDesc(scopedDiex).slice(0, 5).map((diex) => ({
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
        serviceOrders: sortByUpdatedAtDesc(scopedServiceOrders)
          .slice(0, 5)
          .map((serviceOrder) => ({
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

  async operational(filters: DashboardOperationalQuery = {}, user: CurrentUser) {
    const staleDays = filters.staleDays ?? 15;
    const limit = filters.limit ?? 100;
    const [alerts, ataItems, projects, latestMovements] = await Promise.all([
      operationalAlertsService.list({ staleDays, limit }, user),
      this.getAtaItemSnapshots(),
      prisma.project.findMany({
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
          updatedAt: true,
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
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          updatedAt: "asc",
        },
        take: limit,
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: {
            in: ["PROJECT", "DIEX_REQUEST", "SERVICE_ORDER", "ESTIMATE"],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      }),
    ]);

    const nextActionCounts = new Map<string, number>();
    const queue = projects.map((project) => {
      const nextAction = workflowService.getNextAction({
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
      });

      incrementMap(nextActionCounts, nextAction.code);

      return {
        id: project.id,
        projectCode: project.projectCode,
        title: project.title,
        status: project.status,
        stage: project.stage,
        updatedAt: project.updatedAt,
        owner: project.owner,
        nextAction,
        detailsPath: `/api/projects/${project.id}/details`,
      };
    });

    const inventory = this.buildInventoryOperationalBlock(ataItems, alerts);

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        staleDays,
        limit,
      },
      alerts: {
        summary: alerts.summary,
        bySeverity: alerts.groups.bySeverity,
        byCategory: alerts.groups.byCategory,
        items: alerts.alerts.slice(0, limit),
      },
      staleProjects: alerts.groups.byCategory.SEM_AVANCO,
      pendingByStage: {
        awaitingCreditNote: alerts.groups.byCategory.AGUARDANDO_NOTA_CREDITO.length,
        awaitingDiex: alerts.groups.byCategory.AGUARDANDO_DIEX.length,
        awaitingCommitmentNote: alerts.groups.byCategory.AGUARDANDO_NOTA_EMPENHO.length,
        awaitingServiceOrder: alerts.groups.byCategory.AGUARDANDO_ORDEM_SERVICO.length,
        awaitingExecutionStart: alerts.groups.byCategory.AGUARDANDO_INICIO_EXECUCAO.length,
        awaitingAsBuilt: alerts.groups.byCategory.AGUARDANDO_AS_BUILT.length,
        awaitingInvoiceAttestation: alerts.groups.byCategory.AGUARDANDO_ATESTO_NF.length,
      },
      inventory,
      operationalQueue: queue,
      frequentNextActions: mapCounts(nextActionCounts),
      latestMovements: latestMovements.map((item) => ({
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        action: item.action,
        summary: item.summary,
        actorName: item.actorName,
        at: item.createdAt,
      })),
    };
  }

  async executive(filters: DashboardExecutiveQuery = {}) {
    const filterContext = buildFilterContext(filters);
    const [projects, estimates, diexRequests, serviceOrders, ataItems, ataItemMovements] =
      await Promise.all([
      prisma.project.findMany({
        where: {
          archivedAt: null,
          deletedAt: null,
        },
        select: {
          id: true,
          projectCode: true,
          title: true,
          status: true,
          stage: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          projectCode: "asc",
        },
      }),
      prisma.estimate.findMany({
        where: {
          archivedAt: null,
          deletedAt: null,
          project: {
            deletedAt: null,
          },
        },
        select: {
          id: true,
          estimateCode: true,
          status: true,
          totalAmount: true,
          omName: true,
          destinationCityName: true,
          destinationStateUf: true,
          createdAt: true,
          project: {
            select: {
              id: true,
              projectCode: true,
              title: true,
              stage: true,
              status: true,
            },
          },
          ata: {
            select: {
              type: true,
            },
          },
        },
      }),
      prisma.diexRequest.findMany({
        where: {
          archivedAt: null,
          deletedAt: null,
          project: {
            deletedAt: null,
          },
          estimate: {
            deletedAt: null,
          },
        },
        select: {
          id: true,
          totalAmount: true,
          createdAt: true,
          issuedAt: true,
          diexNumber: true,
        },
      }),
      prisma.serviceOrder.findMany({
        where: {
          archivedAt: null,
          deletedAt: null,
          project: {
            deletedAt: null,
          },
          estimate: {
            deletedAt: null,
          },
          OR: [
            {
              diexRequestId: null,
            },
            {
              diexRequest: {
                deletedAt: null,
              },
            },
          ],
        },
        select: {
          id: true,
          totalAmount: true,
          createdAt: true,
          issuedAt: true,
          serviceOrderNumber: true,
        },
      }),
      this.getAtaItemSnapshots(),
      prisma.ataItemBalanceMovement.findMany({
        where: {
          ataItem: {
            deletedAt: null,
          },
        },
        select: {
          movementType: true,
          totalAmount: true,
          quantity: true,
          createdAt: true,
          ataItem: {
            select: {
              ata: {
                select: {
                  type: true,
                  vendorName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const scopedProjects = filterByScope(projects, (project) => project.createdAt, filterContext);
    const scopedEstimates = filterByScope(
      estimates,
      (estimate) => estimate.createdAt,
      filterContext,
    );
    const scopedDiex = filterByScope(
      diexRequests,
      (diex) => diex.issuedAt ?? diex.createdAt,
      filterContext,
    );
    const scopedServiceOrders = filterByScope(
      serviceOrders,
      (serviceOrder) => serviceOrder.issuedAt ?? serviceOrder.createdAt,
      filterContext,
    );

    const totalEstimatedAmount = scopedEstimates.reduce(
      (sum, estimate) => sum + toNumber(estimate.totalAmount),
      0,
    );
    const totalWithDiex = scopedDiex.reduce(
      (sum, diex) => sum + toNumber(diex.totalAmount),
      0,
    );
    const totalWithServiceOrder = scopedServiceOrders.reduce(
      (sum, serviceOrder) => sum + toNumber(serviceOrder.totalAmount),
      0,
    );
    const finalizedEstimates = scopedEstimates.filter(
      (estimate) => estimate.status === "FINALIZADA",
    );
    const inventory = this.buildInventoryExecutiveBlock(ataItems, ataItemMovements, filterContext);

    return {
      generatedAt: new Date().toISOString(),
      filter: {
        mode: filterContext.mode,
        label: filterContext.label,
        periodType: filterContext.periodType,
        referenceDate: serializeDate(filterContext.referenceDate),
        startDate: serializeDate(filterContext.startDate),
        endDate: serializeDate(filterContext.endDate),
        asOfDate: serializeDate(filterContext.asOfDate),
      },
      summary: {
        projectsTotal: scopedProjects.length,
        projectsOpen: scopedProjects.filter(
          (project) => project.status !== "CONCLUIDO" && project.stage !== "CANCELADO",
        ).length,
        projectsCompleted: scopedProjects.filter(
          (project) => project.status === "CONCLUIDO" || project.stage === "SERVICO_CONCLUIDO",
        ).length,
        projectsCanceled: scopedProjects.filter(
          (project) => project.status === "CANCELADO" || project.stage === "CANCELADO",
        ).length,
        estimatesTotal: scopedEstimates.length,
        estimatesFinalized: finalizedEstimates.length,
        diexIssued: scopedDiex.filter((diex) => diex.diexNumber && diex.issuedAt).length,
        serviceOrdersIssued: scopedServiceOrders.length,
        totalEstimatedAmount: formatAmount(totalEstimatedAmount),
        totalFinalizedEstimatedAmount: formatAmount(
          finalizedEstimates.reduce(
            (sum, estimate) => sum + toNumber(estimate.totalAmount),
            0,
          ),
        ),
        totalWithDiex: formatAmount(totalWithDiex),
        totalWithServiceOrder: formatAmount(totalWithServiceOrder),
        ataItemsAtRisk: inventory.snapshot.itemsAtRisk,
        ataItemsInsufficient: inventory.snapshot.itemsInsufficient,
      },
      projects: {
        byStatus: aggregateCounts(scopedProjects, (project) => project.status),
        byStage: STAGE_ORDER.map((stage) => ({
          label: stage,
          count: scopedProjects.filter((project) => project.stage === stage).length,
          percentage: formatPercentage(
            scopedProjects.filter((project) => project.stage === stage).length,
            scopedProjects.length,
          ),
        })).filter((item) => item.count > 0),
      },
      financial: {
        totalEstimatedAmount: formatAmount(totalEstimatedAmount),
        totalWithDiex: formatAmount(totalWithDiex),
        totalWithServiceOrder: formatAmount(totalWithServiceOrder),
        inventoryCurrentReservedAmount: inventory.snapshot.totalReservedAmount,
        inventoryCurrentConsumedAmount: inventory.snapshot.totalConsumedAmount,
        inventoryCurrentAvailableAmount: inventory.snapshot.totalAvailableAmount,
        inventoryReversedAmountInPeriod: inventory.periodActivity.totalReversedAmount,
        byEstimateStatus: aggregateAmounts(
          scopedEstimates,
          (estimate) => estimate.status,
          (estimate) => toNumber(estimate.totalAmount),
        ),
        byAtaType: aggregateAmounts(
          scopedEstimates,
          (estimate) => estimate.ata.type,
          (estimate) => toNumber(estimate.totalAmount),
        ),
        inventoryByAtaType: inventory.distribution.byAtaType,
        inventoryByVendor: inventory.distribution.byVendor,
      },
      distribution: {
        byRegion: aggregateAmounts(
          scopedEstimates,
          (estimate) => estimate.destinationStateUf,
          (estimate) => toNumber(estimate.totalAmount),
        ),
        byCity: aggregateAmounts(
          scopedEstimates,
          (estimate) => `${estimate.destinationCityName}/${estimate.destinationStateUf}`,
          (estimate) => toNumber(estimate.totalAmount),
        ).slice(0, 10),
        byOm: aggregateAmounts(
          scopedEstimates,
          (estimate) => estimate.omName || "OM não informada",
          (estimate) => toNumber(estimate.totalAmount),
        ).slice(0, 10),
        byAtaType: aggregateAmounts(
          scopedEstimates,
          (estimate) => estimate.ata.type,
          (estimate) => toNumber(estimate.totalAmount),
        ),
      },
      periodIndicators: {
        projectsCreated: scopedProjects.length,
        estimatesCreated: scopedEstimates.length,
        diexIssued: scopedDiex.length,
        serviceOrdersIssued: scopedServiceOrders.length,
        averageEstimatedAmount:
          scopedEstimates.length > 0
            ? formatAmount(totalEstimatedAmount / scopedEstimates.length)
            : "0.00",
      },
      inventory,
    };
  }
}

function incrementMap(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mapCounts(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;
      return a.label.localeCompare(b.label);
    });
}
