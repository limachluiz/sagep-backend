import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";

type DashboardCountRow = {
  label: string;
  count: number;
};

type DashboardMoneyRow = {
  label: string;
  count: number;
  totalAmount: string;
};

export class DashboardService {
  private toMoneyString(value: Prisma.Decimal | string | number | null | undefined) {
    return new Prisma.Decimal(value ?? 0).toFixed(2);
  }

  private sortCountRows(rows: DashboardCountRow[]) {
    return rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  private sortMoneyRows(rows: DashboardMoneyRow[]) {
    return rows.sort((a, b) => {
      const diff =
        new Prisma.Decimal(b.totalAmount).minus(a.totalAmount).toNumber();

      if (diff !== 0) {
        return diff;
      }

      return b.count - a.count || a.label.localeCompare(b.label);
    });
  }

  async getOverview() {
    const [
      totalUsers,
      activeUsers,
      totalProjects,
      totalTasks,
      totalEstimates,
      totalAtas,
      totalAtaItems,
      projectsByStageRaw,
      projectsByStatusRaw,
      tasksByStatusRaw,
      estimatesByStatusRaw,
      estimateAmountAggregates,
      recentProjects,
      recentEstimates,
      estimateRows,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.project.count(),
      prisma.task.count(),
      prisma.estimate.count(),
      prisma.ata.count(),
      prisma.ataItem.count(),

      prisma.project.groupBy({
        by: ["stage"],
        _count: {
          _all: true,
        },
      }),

      prisma.project.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.task.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.estimate.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.estimate.aggregate({
        _sum: {
          totalAmount: true,
        },
        where: {},
      }),

      prisma.project.findMany({
        take: 5,
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          projectCode: true,
          title: true,
          status: true,
          stage: true,
          updatedAt: true,
        },
      }),

      prisma.estimate.findMany({
        take: 5,
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          estimateCode: true,
          status: true,
          totalAmount: true,
          destinationCityName: true,
          destinationStateUf: true,
          updatedAt: true,
          project: {
            select: {
              projectCode: true,
              title: true,
              stage: true,
            },
          },
          ata: {
            select: {
              ataCode: true,
              number: true,
              type: true,
            },
          },
        },
      }),

      prisma.estimate.findMany({
        select: {
          status: true,
          totalAmount: true,
          destinationCityName: true,
          destinationStateUf: true,
          omName: true,
          ata: {
            select: {
              type: true,
            },
          },
          project: {
            select: {
              stage: true,
            },
          },
        },
      }),
    ]);

    const projectsByStage = projectsByStageRaw.map((row) => ({
      stage: row.stage,
      count: row._count._all,
      totalEstimatedAmount: "0.00",
    }));

    const projectsByStatus = this.sortCountRows(
      projectsByStatusRaw.map((row) => ({
        label: row.status,
        count: row._count._all,
      }))
    );

    const tasksByStatus = this.sortCountRows(
      tasksByStatusRaw.map((row) => ({
        label: row.status,
        count: row._count._all,
      }))
    );

    const estimatesByStatus = this.sortCountRows(
      estimatesByStatusRaw.map((row) => ({
        label: row.status,
        count: row._count._all,
      }))
    );

    const moneyByEstimateStatusMap = new Map<
      string,
      { count: number; total: Prisma.Decimal }
    >();

    const moneyByAtaTypeMap = new Map<
      string,
      { count: number; total: Prisma.Decimal }
    >();

    const moneyByStateUfMap = new Map<
      string,
      { count: number; total: Prisma.Decimal }
    >();

    const moneyByCityMap = new Map<
      string,
      { count: number; total: Prisma.Decimal }
    >();

    const moneyByOmMap = new Map<
      string,
      { count: number; total: Prisma.Decimal }
    >();

    const moneyByProjectStageMap = new Map<
      string,
      { count: number; total: Prisma.Decimal }
    >();

    for (const row of estimateRows) {
      const amount = new Prisma.Decimal(row.totalAmount ?? 0);

      const statusEntry = moneyByEstimateStatusMap.get(row.status) ?? {
        count: 0,
        total: new Prisma.Decimal(0),
      };
      statusEntry.count += 1;
      statusEntry.total = statusEntry.total.add(amount);
      moneyByEstimateStatusMap.set(row.status, statusEntry);

      const ataTypeEntry = moneyByAtaTypeMap.get(row.ata.type) ?? {
        count: 0,
        total: new Prisma.Decimal(0),
      };
      ataTypeEntry.count += 1;
      ataTypeEntry.total = ataTypeEntry.total.add(amount);
      moneyByAtaTypeMap.set(row.ata.type, ataTypeEntry);

      const stateEntry = moneyByStateUfMap.get(row.destinationStateUf) ?? {
        count: 0,
        total: new Prisma.Decimal(0),
      };
      stateEntry.count += 1;
      stateEntry.total = stateEntry.total.add(amount);
      moneyByStateUfMap.set(row.destinationStateUf, stateEntry);

      const cityLabel = `${row.destinationCityName}/${row.destinationStateUf}`;
      const cityEntry = moneyByCityMap.get(cityLabel) ?? {
        count: 0,
        total: new Prisma.Decimal(0),
      };
      cityEntry.count += 1;
      cityEntry.total = cityEntry.total.add(amount);
      moneyByCityMap.set(cityLabel, cityEntry);

      if (row.omName) {
        const omEntry = moneyByOmMap.get(row.omName) ?? {
          count: 0,
          total: new Prisma.Decimal(0),
        };
        omEntry.count += 1;
        omEntry.total = omEntry.total.add(amount);
        moneyByOmMap.set(row.omName, omEntry);
      }

      const projectStageEntry = moneyByProjectStageMap.get(row.project.stage) ?? {
        count: 0,
        total: new Prisma.Decimal(0),
      };
      projectStageEntry.count += 1;
      projectStageEntry.total = projectStageEntry.total.add(amount);
      moneyByProjectStageMap.set(row.project.stage, projectStageEntry);
    }

    const estimatesAmountByStatus = this.sortMoneyRows(
      Array.from(moneyByEstimateStatusMap.entries()).map(([label, value]) => ({
        label,
        count: value.count,
        totalAmount: value.total.toFixed(2),
      }))
    );

    const estimatesByAtaType = this.sortMoneyRows(
      Array.from(moneyByAtaTypeMap.entries()).map(([label, value]) => ({
        label,
        count: value.count,
        totalAmount: value.total.toFixed(2),
      }))
    );

    const estimatesByStateUf = this.sortMoneyRows(
      Array.from(moneyByStateUfMap.entries()).map(([label, value]) => ({
        label,
        count: value.count,
        totalAmount: value.total.toFixed(2),
      }))
    );

    const estimatesByCity = this.sortMoneyRows(
      Array.from(moneyByCityMap.entries()).map(([label, value]) => ({
        label,
        count: value.count,
        totalAmount: value.total.toFixed(2),
      }))
    );

    const estimatesByOm = this.sortMoneyRows(
      Array.from(moneyByOmMap.entries()).map(([label, value]) => ({
        label,
        count: value.count,
        totalAmount: value.total.toFixed(2),
      }))
    );

    const projectsByStageWithAmounts = projectsByStage.map((row) => {
      const entry = moneyByProjectStageMap.get(row.stage);

      return {
        stage: row.stage,
        count: row.count,
        totalEstimatedAmount: entry ? entry.total.toFixed(2) : "0.00",
      };
    });

    return {
      generatedAt: new Date().toISOString(),

      totals: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
        },
        projects: totalProjects,
        tasks: totalTasks,
        estimates: totalEstimates,
        atas: totalAtas,
        ataItems: totalAtaItems,
      },

      financial: {
        totalEstimatedAmount: this.toMoneyString(estimateAmountAggregates._sum.totalAmount),
        byEstimateStatus: estimatesAmountByStatus,
        byAtaType: estimatesByAtaType,
        byStateUf: estimatesByStateUf,
        byCity: estimatesByCity,
        byOm: estimatesByOm,
      },

      pipeline: {
        projectsByStage: projectsByStageWithAmounts,
        projectsByStatus,
        tasksByStatus,
        estimatesByStatus,
      },

      recent: {
        projects: recentProjects,
        estimates: recentEstimates,
      },
    };
  }
}