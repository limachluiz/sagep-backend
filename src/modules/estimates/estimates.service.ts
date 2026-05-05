import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { withArchiveContext } from "../../shared/archive-context.js";
import type { RestoreOptions } from "../../shared/restore.schemas.js";
import { auditService } from "../audit/audit.service.js";
import { permissionsService } from "../permissions/permissions.service.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";
import { workflowService } from "../workflow/workflow.service.js";
import type { ProjectStageValue } from "../workflow/workflow.types.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

type EstimateLineInput = {
  ataItemId?: string;
  ataItemCode?: number;
  quantity: number;
  notes?: string;
};

type CreateEstimateInput = {
  projectId?: string;
  projectCode?: number;
  ataId?: string;
  ataCode?: number;
  coverageGroupId?: string;
  coverageGroupCode?: string;
  omId?: string;
  omCode?: number;
  notes?: string;
  items: EstimateLineInput[];
};

type UpdateEstimateInput = {
  omId?: string;
  omCode?: number;
  notes?: string;
  status?: "RASCUNHO" | "FINALIZADA" | "CANCELADA";
  items?: EstimateLineInput[];
};

type UpdateEstimateStatusInput = {
  status: "RASCUNHO" | "FINALIZADA" | "CANCELADA";
};

type ListEstimatesFilters = {
  code?: number;
  projectCode?: number;
  ataCode?: number;
  omCode?: number;
  status?: "RASCUNHO" | "FINALIZADA" | "CANCELADA";
  cityName?: string;
  stateUf?: "AM" | "RO" | "RR" | "AC";
  search?: string;
  includeArchived?: boolean;
  onlyArchived?: boolean;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  archivedFrom?: Date;
  archivedUntil?: Date;
};

type ProjectWorkflowSyncAudit = {
  before: ReturnType<EstimatesService["buildProjectAuditSnapshot"]>;
  after: ReturnType<EstimatesService["buildProjectAuditSnapshot"]>;
  projectId: string;
  projectCode: number | null;
  previousStage: ProjectStageValue;
  newStage: ProjectStageValue;
};

const estimateInclude = {
  project: {
    select: {
      id: true,
      projectCode: true,
      title: true,
      status: true,
      ownerId: true,
    },
  },
  ata: {
    select: {
      id: true,
      ataCode: true,
      number: true,
      type: true,
      vendorName: true,
      isActive: true,
    },
  },
  coverageGroup: {
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      localities: {
        select: {
          id: true,
          cityName: true,
          stateUf: true,
        },
        orderBy: [{ stateUf: "asc" }, { cityName: "asc" }],
      },
    },
  },
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
      ataItem: {
        select: {
          id: true,
          ataItemCode: true,
          referenceCode: true,
          description: true,
          unit: true,
          unitPrice: true,
          initialQuantity: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
    orderBy: {
      estimateItemCode: "asc",
    },
  },
} satisfies Prisma.EstimateInclude;

export class EstimatesService {
  private isAdmin(role: string) {
    return role === "ADMIN";
  }

  private isPrivileged(role: string) {
    return permissionsService.hasPermission({ role }, "estimates.view_all");
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
      throw new AppError("Apenas ADMIN pode consultar estimativas arquivadas", 403);
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

  private buildLifecycleVisibilityWhere(
    includeArchived = false,
    includeDeleted = false,
  ): Prisma.EstimateWhereInput {
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

  private getAuditActor(user: CurrentUser) {
    return {
      id: user.id,
      name: user.email,
    };
  }

  private buildEstimateAuditSnapshot(estimate: {
    id: string;
    estimateCode?: number | null;
    projectId?: string | null;
    status?: string | null;
    omName?: string | null;
    destinationCityName?: string | null;
    destinationStateUf?: string | null;
    totalAmount?: unknown;
    archivedAt?: Date | null;
    deletedAt?: Date | null;
  }) {
    return {
      id: estimate.id,
      estimateCode: estimate.estimateCode ?? null,
      projectId: estimate.projectId ?? null,
      status: estimate.status ?? null,
      omName: estimate.omName ?? null,
      destinationCityName: estimate.destinationCityName ?? null,
      destinationStateUf: estimate.destinationStateUf ?? null,
      totalAmount: estimate.totalAmount?.toString() ?? null,
      archivedAt: estimate.archivedAt ?? null,
      deletedAt: estimate.deletedAt ?? null,
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

  private async resolveProject(projectId?: string, projectCode?: number) {
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          projectCode: true,
          title: true,
          ownerId: true,
          archivedAt: true,
          deletedAt: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!project || project.deletedAt || project.archivedAt) {
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
          archivedAt: true,
          deletedAt: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!project || project.deletedAt || project.archivedAt) {
        throw new AppError("Projeto não encontrado", 404);
      }

      return project;
    }

    throw new AppError("Projeto não informado", 400);
  }

  private async resolveAta(ataId?: string, ataCode?: number) {
    if (ataId) {
      const ata = await prisma.ata.findUnique({
        where: { id: ataId },
        select: {
          id: true,
          ataCode: true,
          number: true,
          type: true,
          isActive: true,
        },
      });

      if (!ata) {
        throw new AppError("Ata não encontrada", 404);
      }

      if (ataCode && ata.ataCode !== ataCode) {
        throw new AppError("ataId e ataCode não correspondem à mesma ata", 400);
      }

      return ata;
    }

    if (ataCode) {
      const ata = await prisma.ata.findUnique({
        where: { ataCode },
        select: {
          id: true,
          ataCode: true,
          number: true,
          type: true,
          isActive: true,
        },
      });

      if (!ata) {
        throw new AppError("Ata não encontrada", 404);
      }

      return ata;
    }

    throw new AppError("Ata não informada", 400);
  }

  private async resolveCoverageGroup(
    ataId: string,
    coverageGroupId?: string,
    coverageGroupCode?: string
  ) {
    if (coverageGroupId) {
      const group = await prisma.ataCoverageGroup.findUnique({
        where: { id: coverageGroupId },
        select: {
          id: true,
          ataId: true,
          code: true,
          name: true,
          localities: {
            select: {
              cityName: true,
              stateUf: true,
            },
          },
        },
      });

      if (!group || group.ataId !== ataId) {
        throw new AppError("Grupo de cobertura não encontrado para esta ata", 404);
      }

      if (coverageGroupCode && group.code !== coverageGroupCode.trim().toUpperCase()) {
        throw new AppError(
          "coverageGroupId e coverageGroupCode não correspondem ao mesmo grupo",
          400
        );
      }

      return group;
    }

    if (coverageGroupCode) {
      const group = await prisma.ataCoverageGroup.findFirst({
        where: {
          ataId,
          code: coverageGroupCode.trim().toUpperCase(),
        },
        select: {
          id: true,
          ataId: true,
          code: true,
          name: true,
          localities: {
            select: {
              cityName: true,
              stateUf: true,
            },
          },
        },
      });

      if (!group) {
        throw new AppError("Grupo de cobertura não encontrado para esta ata", 404);
      }

      return group;
    }

    throw new AppError("Grupo de cobertura não informado", 400);
  }

  private async resolveOm(omId?: string, omCode?: number) {
    if (omId) {
      const om = await prisma.militaryOrganization.findUnique({
        where: { id: omId },
        select: {
          id: true,
          omCode: true,
          sigla: true,
          name: true,
          cityName: true,
          stateUf: true,
          isActive: true,
        },
      });

      if (!om) {
        throw new AppError("OM não encontrada", 404);
      }

      if (omCode && om.omCode !== omCode) {
        throw new AppError("omId e omCode não correspondem à mesma OM", 400);
      }

      return om;
    }

    if (omCode) {
      const om = await prisma.militaryOrganization.findUnique({
        where: { omCode },
        select: {
          id: true,
          omCode: true,
          sigla: true,
          name: true,
          cityName: true,
          stateUf: true,
          isActive: true,
        },
      });

      if (!om) {
        throw new AppError("OM não encontrada", 404);
      }

      return om;
    }

    throw new AppError("OM não informada", 400);
  }

  private canManageProject(
    project: { ownerId: string; members: { userId: string }[] },
    user: CurrentUser
  ) {
    if (permissionsService.hasPermission(user, "estimates.edit")) {
      return true;
    }

    if (
      permissionsService.hasPermission(user, "estimates.edit") &&
      project.ownerId === user.id
    ) {
      return true;
    }

    const isMember = project.members.some((member) => member.userId === user.id);

    return isMember && permissionsService.hasPermission(user, "estimates.edit");
  }

  private canViewProject(
    project: { ownerId: string; members: { userId: string }[] },
    user: CurrentUser
  ) {
    if (permissionsService.hasPermission(user, "estimates.view_all")) {
      return true;
    }

    if (project.ownerId === user.id) {
      return true;
    }

    return project.members.some((member) => member.userId === user.id);
  }

  private async getEstimateAccessData(estimateId: string) {
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: {
        id: true,
        estimateCode: true,
        status: true,
        archivedAt: true,
        deletedAt: true,
        project: {
          select: {
            id: true,
            ownerId: true,
            deletedAt: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!estimate || estimate.deletedAt || estimate.project.deletedAt) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    return estimate;
  }

  private async getEstimateAccessDataByCode(estimateCode: number) {
    const estimate = await prisma.estimate.findUnique({
      where: { estimateCode },
      select: {
        id: true,
        estimateCode: true,
        status: true,
        archivedAt: true,
        deletedAt: true,
        project: {
          select: {
            id: true,
            ownerId: true,
            deletedAt: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!estimate || estimate.deletedAt || estimate.project.deletedAt) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    return estimate;
  }

  private async ensureCanView(estimateId: string, user: CurrentUser, includeArchived = false) {
    const estimate = await this.getEstimateAccessData(estimateId);

    if (!includeArchived && estimate.archivedAt) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    if (!this.canViewProject(estimate.project, user)) {
      throw new AppError("Você não tem acesso a esta estimativa", 403);
    }

    return estimate;
  }

  private async ensureCanManage(estimateId: string, user: CurrentUser) {
    const estimate = await this.getEstimateAccessData(estimateId);

    if (estimate.archivedAt) {
      throw new AppError("Estimativa arquivada não pode ser alterada", 409);
    }

    if (!this.canManageProject(estimate.project, user)) {
      throw new AppError("Você não tem permissão para gerenciar esta estimativa", 403);
    }

    return estimate;
  }

  private normalizeDecimal(value: number) {
    return new Prisma.Decimal(value).toDecimalPlaces(2);
  }

  private ensureDestinationBelongsToCoverageGroup(
    coverageGroup: {
      localities: { cityName: string; stateUf: "AM" | "RO" | "RR" | "AC" }[];
    },
    cityName: string,
    stateUf: "AM" | "RO" | "RR" | "AC"
  ) {
    const normalizedCity = cityName.trim().toLowerCase();

    const match = coverageGroup.localities.some(
      (locality) =>
        locality.cityName.trim().toLowerCase() === normalizedCity &&
        locality.stateUf === stateUf
    );

    if (!match) {
      throw new AppError(
        "A OM selecionada precisa pertencer às localidades do grupo de cobertura selecionado",
        409
      );
    }
  }

  private async enrichEstimateWithBalance<T extends {
    items: Array<{
      ataItem: {
        id: string;
        ataItemCode: number;
        referenceCode: string;
        description: string;
        unit: string;
        unitPrice: Prisma.Decimal;
        initialQuantity: Prisma.Decimal;
        isActive: boolean;
        deletedAt: Date | null;
      };
    }>;
  }>(estimate: T) {
    const ataItems = Array.from(
      new Map(estimate.items.map((item) => [item.ataItem.id, item.ataItem])).values(),
    );
    const balanceMap = await ataItemBalanceService.getBalanceMapForAtaItems(ataItems);

    return {
      ...estimate,
      items: estimate.items.map((item) => ({
        ...item,
        ataItem: {
          ...item.ataItem,
          balance: balanceMap.get(item.ataItem.id) ?? null,
        },
      })),
    };
  }

  private async enrichEstimateCollectionWithBalance<
    T extends Array<{
      items: Array<{
        ataItem: {
          id: string;
          ataItemCode: number;
          referenceCode: string;
          description: string;
          unit: string;
          unitPrice: Prisma.Decimal;
          initialQuantity: Prisma.Decimal;
          isActive: boolean;
          deletedAt: Date | null;
        };
      }>;
    }>,
  >(estimates: T) {
    if (!estimates.length) {
      return estimates;
    }

    const ataItems = Array.from(
      new Map(
        estimates
          .flatMap((estimate) => estimate.items.map((item) => [item.ataItem.id, item.ataItem] as const)),
      ).values(),
    );
    const balanceMap = await ataItemBalanceService.getBalanceMapForAtaItems(ataItems);

    return estimates.map((estimate) => ({
      ...estimate,
      items: estimate.items.map((item) => ({
        ...item,
        ataItem: {
          ...item.ataItem,
          balance: balanceMap.get(item.ataItem.id) ?? null,
        },
      })),
    })) as unknown as T;
  }

  private async syncProjectWorkflowAfterEstimateFinalized(
    estimate: {
      id: string;
      estimateCode: number;
      project: {
        id: string;
        projectCode: number;
        title: string;
        description: string | null;
        status: string;
        stage: ProjectStageValue;
        ownerId: string;
        startDate: Date | null;
        endDate: Date | null;
        creditNoteNumber: string | null;
        creditNoteReceivedAt: Date | null;
        diexNumber: string | null;
        diexIssuedAt: Date | null;
        commitmentNoteNumber: string | null;
        commitmentNoteReceivedAt: Date | null;
        serviceOrderNumber: string | null;
        serviceOrderIssuedAt: Date | null;
        executionStartedAt: Date | null;
        asBuiltReceivedAt: Date | null;
        invoiceAttestedAt: Date | null;
        serviceCompletedAt: Date | null;
      };
    },
    db: Prisma.TransactionClient,
  ): Promise<ProjectWorkflowSyncAudit | null> {
    const projectPatch = workflowService.getProjectPatchAfterEstimateFinalized({
      id: estimate.project.id,
      projectCode: estimate.project.projectCode,
      stage: estimate.project.stage,
      creditNoteNumber: estimate.project.creditNoteNumber,
      creditNoteReceivedAt: estimate.project.creditNoteReceivedAt,
      diexNumber: estimate.project.diexNumber,
      diexIssuedAt: estimate.project.diexIssuedAt,
      commitmentNoteNumber: estimate.project.commitmentNoteNumber,
      commitmentNoteReceivedAt: estimate.project.commitmentNoteReceivedAt,
      serviceOrderNumber: estimate.project.serviceOrderNumber,
      serviceOrderIssuedAt: estimate.project.serviceOrderIssuedAt,
      executionStartedAt: estimate.project.executionStartedAt,
      asBuiltReceivedAt: estimate.project.asBuiltReceivedAt,
      invoiceAttestedAt: estimate.project.invoiceAttestedAt,
      serviceCompletedAt: estimate.project.serviceCompletedAt,
    });

    if (!projectPatch.stage) {
      return null;
    }

    workflowService.assertStageTransition(estimate.project.stage, projectPatch.stage);

    const project = await db.project.update({
      where: { id: estimate.project.id },
      data: projectPatch,
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

    return {
      before: this.buildProjectAuditSnapshot(estimate.project),
      after: this.buildProjectAuditSnapshot(project),
      projectId: project.id,
      projectCode: project.projectCode,
      previousStage: estimate.project.stage,
      newStage: project.stage,
    };
  }

  private async assertEstimateItemsStillAvailable(
    estimateId: string,
    db: typeof prisma | Prisma.TransactionClient = prisma,
  ) {
    const estimate = await db.estimate.findUnique({
      where: { id: estimateId },
      select: {
        items: {
          select: {
            ataItemId: true,
            quantity: true,
            referenceCode: true,
            description: true,
          },
        },
      },
    });

    if (!estimate) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    await ataItemBalanceService.assertCanAllocateEstimateItems(estimate.items, db);
  }

  private async resolveEstimateItems(
    ataId: string,
    coverageGroupId: string,
    items: EstimateLineInput[]
  ) {
    const resolvedItems = await Promise.all(
      items.map(async (item) => {
        let ataItem:
          | {
              id: string;
              ataId: string;
              coverageGroupId: string;
              ataItemCode: number;
              referenceCode: string;
              description: string;
              unit: string;
              unitPrice: Prisma.Decimal;
              initialQuantity: Prisma.Decimal;
              isActive: boolean;
              deletedAt: Date | null;
            }
          | null = null;

        if (item.ataItemId) {
          ataItem = await prisma.ataItem.findUnique({
            where: { id: item.ataItemId },
            select: {
              id: true,
              ataId: true,
              coverageGroupId: true,
              ataItemCode: true,
              referenceCode: true,
              description: true,
              unit: true,
              unitPrice: true,
              initialQuantity: true,
              isActive: true,
              deletedAt: true,
            },
          });
        } else if (item.ataItemCode) {
          ataItem = await prisma.ataItem.findUnique({
            where: { ataItemCode: item.ataItemCode },
            select: {
              id: true,
              ataId: true,
              coverageGroupId: true,
              ataItemCode: true,
              referenceCode: true,
              description: true,
              unit: true,
              unitPrice: true,
              initialQuantity: true,
              isActive: true,
              deletedAt: true,
            },
          });
        }

        if (!ataItem || ataItem.deletedAt) {
          throw new AppError("Item da ata não encontrado", 404);
        }

        if (ataItem.ataId !== ataId || ataItem.coverageGroupId !== coverageGroupId) {
          throw new AppError(
            "Todos os itens da estimativa precisam pertencer à mesma ata e ao mesmo grupo de cobertura",
            409
          );
        }

        if (!ataItem.isActive) {
          throw new AppError("Não é possível usar item inativo da ata na estimativa", 409);
        }

        const quantity = this.normalizeDecimal(item.quantity);
        const subtotal = ataItem.unitPrice.mul(quantity).toDecimalPlaces(2);

        return {
          ataItemId: ataItem.id,
          referenceCode: ataItem.referenceCode,
          description: ataItem.description,
          unit: ataItem.unit,
          quantity,
          unitPrice: ataItem.unitPrice,
          subtotal,
          notes: item.notes?.trim(),
        };
      })
    );

    const duplicatedAtaItemIds = resolvedItems
      .map((item) => item.ataItemId)
      .filter((id, index, array) => array.indexOf(id) !== index);

    if (duplicatedAtaItemIds.length > 0) {
      throw new AppError("A estimativa não pode repetir o mesmo item da ata", 409);
    }

    await ataItemBalanceService.assertCanAllocateEstimateItems(resolvedItems);

    return resolvedItems;
  }

  async create(data: CreateEstimateInput, user: CurrentUser) {
    const project = await this.resolveProject(data.projectId, data.projectCode);

    if (!permissionsService.hasPermission(user, "estimates.create")) {
      throw new AppError("Você não tem permissão para criar estimativas", 403);
    }

    if (!this.canManageProject(project, user)) {
      throw new AppError("Você não tem permissão para criar estimativas neste projeto", 403);
    }

    const ata = await this.resolveAta(data.ataId, data.ataCode);

    if (!ata.isActive) {
      throw new AppError("Não é possível usar uma ata inativa", 409);
    }

    const coverageGroup = await this.resolveCoverageGroup(
      ata.id,
      data.coverageGroupId,
      data.coverageGroupCode
    );

    const om = await this.resolveOm(data.omId, data.omCode);

    if (!om.isActive) {
      throw new AppError("Não é possível usar uma OM inativa na estimativa", 409);
    }

    this.ensureDestinationBelongsToCoverageGroup(
      coverageGroup,
      om.cityName,
      om.stateUf
    );

    const resolvedItems = await this.resolveEstimateItems(
      ata.id,
      coverageGroup.id,
      data.items
    );

    const totalAmount = resolvedItems.reduce(
      (acc, item) => acc.add(item.subtotal),
      new Prisma.Decimal(0)
    );

    const estimate = await prisma.estimate.create({
      data: {
        projectId: project.id,
        ataId: ata.id,
        coverageGroupId: coverageGroup.id,
        omId: om.id,
        omName: om.sigla,
        destinationCityName: om.cityName,
        destinationStateUf: om.stateUf,
        notes: data.notes?.trim(),
        totalAmount,
        items: {
          create: resolvedItems.map((item) => ({
            ataItemId: item.ataItemId,
            referenceCode: item.referenceCode,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            notes: item.notes,
          })),
        },
      },
      include: estimateInclude,
    });

    return this.enrichEstimateWithBalance(estimate);
  }

  async list(filters: ListEstimatesFilters, user: CurrentUser) {
    const { includeArchived, onlyArchived, includeDeleted, onlyDeleted } =
      this.resolveArchivedAccess(user, filters);
    const andConditions: Prisma.EstimateWhereInput[] = [];
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

    if (!onlyDeleted) {
      andConditions.push({
        project: {
          deletedAt: null,
        },
      });
    }

    if (!this.isPrivileged(user.role)) {
      andConditions.push({
        OR: [
          { project: { ownerId: user.id } },
          { project: { members: { some: { userId: user.id } } } },
        ],
      });
    }

    if (filters.code) {
      andConditions.push({ estimateCode: filters.code });
    }

    if (filters.projectCode) {
      andConditions.push({
        project: {
          projectCode: filters.projectCode,
        },
      });
    }

    if (filters.ataCode) {
      andConditions.push({
        ata: {
          ataCode: filters.ataCode,
        },
      });
    }

    if (filters.omCode) {
      andConditions.push({
        om: {
          omCode: filters.omCode,
        },
      });
    }

    if (filters.status) {
      andConditions.push({ status: filters.status });
    }

    if (filters.cityName) {
      andConditions.push({
        destinationCityName: {
          contains: filters.cityName,
          mode: "insensitive",
        },
      });
    }

    if (filters.stateUf) {
      andConditions.push({
        destinationStateUf: filters.stateUf,
      });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          {
            omName: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            notes: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            project: {
              title: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          },
          {
            ata: {
              number: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          },
          {
            om: {
              sigla: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          },
          {
            om: {
              name: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          },
        ],
      });
    }

    const where: Prisma.EstimateWhereInput | undefined =
      andConditions.length > 0 ? { AND: andConditions } : undefined;

    const estimates = await prisma.estimate.findMany({
      where,
      include: estimateInclude,
      orderBy: {
        estimateCode: "asc",
      },
    });

    const enrichedEstimates = await this.enrichEstimateCollectionWithBalance(estimates);

    if (includeArchived || onlyArchived || hasArchivedPeriod) {
      return withArchiveContext("ESTIMATE", enrichedEstimates);
    }

    return enrichedEstimates;
  }

  async findById(
    estimateId: string,
    user: CurrentUser,
    filters: { includeArchived?: boolean } = {},
  ) {
    const { includeArchived } = this.resolveArchivedAccess(user, filters);
    await this.ensureCanView(estimateId, user, includeArchived);

    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      include: estimateInclude,
    });

    if (!estimate) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    return this.enrichEstimateWithBalance(estimate);
  }

  async findByCode(
    estimateCode: number,
    user: CurrentUser,
    filters: { includeArchived?: boolean } = {},
  ) {
    const { includeArchived } = this.resolveArchivedAccess(user, filters);
    const accessData = await this.getEstimateAccessDataByCode(estimateCode);

    if (!includeArchived && accessData.archivedAt) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    if (!this.canViewProject(accessData.project, user)) {
      throw new AppError("Você não tem acesso a esta estimativa", 403);
    }

    const estimate = await prisma.estimate.findUnique({
      where: { estimateCode },
      include: estimateInclude,
    });

    if (!estimate) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    return this.enrichEstimateWithBalance(estimate);
  }

  async update(estimateId: string, data: UpdateEstimateInput, user: CurrentUser) {
    if (
      data.status === "FINALIZADA" &&
      !permissionsService.hasPermission(user, "estimates.finalize")
    ) {
      throw new AppError("Você não tem permissão para finalizar estimativas", 403);
    }

    await this.ensureCanManage(estimateId, user);

    const currentEstimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: {
        id: true,
        estimateCode: true,
        projectId: true,
        ataId: true,
        coverageGroupId: true,
        omId: true,
        status: true,
        omName: true,
        destinationCityName: true,
        destinationStateUf: true,
        totalAmount: true,
        archivedAt: true,
        deletedAt: true,
        coverageGroup: {
          select: {
            localities: {
              select: {
                cityName: true,
                stateUf: true,
              },
            },
          },
        },
        project: {
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
        },
      },
    });

    if (!currentEstimate) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    let resolvedOm:
      | {
          id: string;
          omCode: number;
          sigla: string;
          name: string;
          cityName: string;
          stateUf: "AM" | "RO" | "RR" | "AC";
          isActive: boolean;
        }
      | undefined;

    if (data.omId || data.omCode) {
      resolvedOm = await this.resolveOm(data.omId, data.omCode);

      if (!resolvedOm.isActive) {
        throw new AppError("Não é possível usar uma OM inativa na estimativa", 409);
      }

      this.ensureDestinationBelongsToCoverageGroup(
        currentEstimate.coverageGroup,
        resolvedOm.cityName,
        resolvedOm.stateUf
      );
    }

    let resolvedItems:
      | {
          ataItemId: string;
          referenceCode: string;
          description: string;
          unit: string;
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
          subtotal: Prisma.Decimal;
          notes?: string;
        }[]
      | undefined;

    if (data.items) {
      resolvedItems = await this.resolveEstimateItems(
        currentEstimate.ataId,
        currentEstimate.coverageGroupId,
        data.items
      );
    }

    const totalAmount =
      resolvedItems?.reduce(
        (acc, item) => acc.add(item.subtotal),
        new Prisma.Decimal(0)
      ) ?? undefined;

    if (data.status === "FINALIZADA" && !resolvedItems) {
      await this.assertEstimateItemsStillAvailable(estimateId);
    }

    const { estimate, projectWorkflowSync } = await prisma.$transaction(async (tx) => {
      const estimate = await tx.estimate.update({
        where: { id: estimateId },
        data: {
          ...(resolvedOm !== undefined && {
            omId: resolvedOm.id,
            omName: resolvedOm.sigla,
            destinationCityName: resolvedOm.cityName,
            destinationStateUf: resolvedOm.stateUf,
          }),
          ...(data.notes !== undefined && { notes: data.notes?.trim() }),
          ...(data.status !== undefined && { status: data.status }),
          ...(totalAmount !== undefined && { totalAmount }),
          ...(resolvedItems !== undefined && {
            items: {
              deleteMany: {},
              create: resolvedItems.map((item) => ({
                ataItemId: item.ataItemId,
                referenceCode: item.referenceCode,
                description: item.description,
                unit: item.unit,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
                notes: item.notes,
              })),
            },
          }),
        },
        include: estimateInclude,
      });

      const projectWorkflowSync =
        data.status === "FINALIZADA"
          ? await this.syncProjectWorkflowAfterEstimateFinalized(currentEstimate, tx)
          : null;

      return { estimate, projectWorkflowSync };
    });

    if (data.status === "FINALIZADA" && currentEstimate.status !== "FINALIZADA") {
      await auditService.log({
        entityType: "ESTIMATE",
        entityId: estimate.id,
        action: "FINALIZE",
        actor: this.getAuditActor(user),
        summary: `Estimativa EST-${estimate.estimateCode} finalizada`,
        before: this.buildEstimateAuditSnapshot(currentEstimate),
        after: this.buildEstimateAuditSnapshot(estimate),
        metadata: {
          permissionUsed: "estimates.finalize",
          projectWorkflowSynced: Boolean(projectWorkflowSync),
        },
      });
    }

    if (projectWorkflowSync) {
      await auditService.log({
        entityType: "PROJECT",
        entityId: projectWorkflowSync.projectId,
        action: "STAGE_CHANGE",
        actor: this.getAuditActor(user),
        summary: `Projeto PRJ-${projectWorkflowSync.projectCode} avançou de ${projectWorkflowSync.previousStage} para ${projectWorkflowSync.newStage} após finalização da estimativa EST-${estimate.estimateCode}`,
        before: projectWorkflowSync.before,
        after: projectWorkflowSync.after,
        metadata: {
          source: "ESTIMATE_FINALIZATION",
          estimateId: estimate.id,
          estimateCode: estimate.estimateCode,
          previousStage: projectWorkflowSync.previousStage,
          newStage: projectWorkflowSync.newStage,
          nextActionCode: workflowService.getNextAction({
            id: projectWorkflowSync.projectId,
            projectCode: projectWorkflowSync.projectCode ?? undefined,
            stage: projectWorkflowSync.newStage,
          }).code,
        },
      });
    }

    return this.enrichEstimateWithBalance(estimate);
  }

  async updateStatus(estimateId: string, data: UpdateEstimateStatusInput, user: CurrentUser) {
    if (
      data.status === "FINALIZADA" &&
      !permissionsService.hasPermission(user, "estimates.finalize")
    ) {
      throw new AppError("Você não tem permissão para finalizar estimativas", 403);
    }

    await this.ensureCanManage(estimateId, user);

    const currentEstimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: {
        id: true,
        estimateCode: true,
        projectId: true,
        status: true,
        omName: true,
        destinationCityName: true,
        destinationStateUf: true,
        totalAmount: true,
        archivedAt: true,
        deletedAt: true,
        project: {
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
        },
      },
    });

    if (!currentEstimate) {
      throw new AppError("Estimativa nÃ£o encontrada", 404);
    }

    if (data.status === "FINALIZADA") {
      await this.assertEstimateItemsStillAvailable(estimateId);
    }

    const { estimate, projectWorkflowSync } = await prisma.$transaction(async (tx) => {
      const estimate = await tx.estimate.update({
        where: { id: estimateId },
        data: {
          status: data.status,
        },
        include: estimateInclude,
      });

      const projectWorkflowSync =
        data.status === "FINALIZADA"
          ? await this.syncProjectWorkflowAfterEstimateFinalized(currentEstimate, tx)
          : null;

      return { estimate, projectWorkflowSync };
    });

    if (data.status === "FINALIZADA" && currentEstimate.status !== "FINALIZADA") {
      await auditService.log({
        entityType: "ESTIMATE",
        entityId: estimate.id,
        action: "FINALIZE",
        actor: this.getAuditActor(user),
        summary: `Estimativa EST-${estimate.estimateCode} finalizada`,
        before: this.buildEstimateAuditSnapshot(currentEstimate),
        after: this.buildEstimateAuditSnapshot(estimate),
        metadata: {
          permissionUsed: "estimates.finalize",
          projectWorkflowSynced: Boolean(projectWorkflowSync),
        },
      });
    }

    if (projectWorkflowSync) {
      await auditService.log({
        entityType: "PROJECT",
        entityId: projectWorkflowSync.projectId,
        action: "STAGE_CHANGE",
        actor: this.getAuditActor(user),
        summary: `Projeto PRJ-${projectWorkflowSync.projectCode} avançou de ${projectWorkflowSync.previousStage} para ${projectWorkflowSync.newStage} após finalização da estimativa EST-${estimate.estimateCode}`,
        before: projectWorkflowSync.before,
        after: projectWorkflowSync.after,
        metadata: {
          source: "ESTIMATE_FINALIZATION",
          estimateId: estimate.id,
          estimateCode: estimate.estimateCode,
          previousStage: projectWorkflowSync.previousStage,
          newStage: projectWorkflowSync.newStage,
          nextActionCode: workflowService.getNextAction({
            id: projectWorkflowSync.projectId,
            projectCode: projectWorkflowSync.projectCode ?? undefined,
            stage: projectWorkflowSync.newStage,
          }).code,
        },
      });
    }

    return this.enrichEstimateWithBalance(estimate);
  }

  async remove(estimateId: string, user: CurrentUser) {
    if (!permissionsService.hasPermission(user, "estimates.archive")) {
      throw new AppError("Você não tem permissão para arquivar esta estimativa", 403);
    }

    const before = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: {
        id: true,
        estimateCode: true,
        projectId: true,
        status: true,
        omName: true,
        destinationCityName: true,
        destinationStateUf: true,
        totalAmount: true,
        archivedAt: true,
        deletedAt: true,
        diexRequests: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
          },
        },
        serviceOrders: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!before || before.deletedAt) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    if (before.archivedAt) {
      throw new AppError("Estimativa já está arquivada", 409);
    }

    if (before.diexRequests.length > 0 || before.serviceOrders.length > 0) {
      throw new AppError("Não é possível arquivar estimativa com DIEx ou OS vinculados", 409);
    }

    const estimate = await prisma.estimate.update({
      where: { id: estimateId },
      data: {
        archivedAt: new Date(),
      },
      include: estimateInclude,
    });

    await auditService.log({
      entityType: "ESTIMATE",
      entityId: before.id,
      action: "ARCHIVE",
      actor: this.getAuditActor(user),
      summary: `Estimativa EST-${before.estimateCode} arquivada`,
      before: this.buildEstimateAuditSnapshot(before),
      after: this.buildEstimateAuditSnapshot(estimate),
      metadata: {
        permissionUsed: "estimates.archive",
      },
    });

    return {
      message: "Estimativa arquivada com sucesso",
      permissionUsed: "estimates.archive" as const,
      estimate,
    };
  }

  async restore(estimateId: string, user: CurrentUser, options: RestoreOptions = {}) {
    if (!permissionsService.hasPermission(user, "estimates.restore")) {
      throw new AppError("Você não tem permissão para restaurar esta estimativa", 403);
    }

    let before = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: {
        id: true,
        estimateCode: true,
        projectId: true,
        status: true,
        omName: true,
        destinationCityName: true,
        destinationStateUf: true,
        totalAmount: true,
        archivedAt: true,
        deletedAt: true,
        project: {
          select: {
            archivedAt: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!before || before.deletedAt) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    if (!before.archivedAt) {
      throw new AppError("Estimativa não está arquivada", 409);
    }

    if (before.project.deletedAt) {
      throw new AppError(
        "Não é possível restaurar estimativa de projeto removido logicamente",
        409,
      );
    }

    if (before.project.archivedAt && options.cascade) {
      const { ProjectsService } = await import("../projects/projects.service.js");
      const projectsService = new ProjectsService();

      await projectsService.restore(before.projectId, user);

      before = await prisma.estimate.findUnique({
        where: { id: estimateId },
        select: {
          id: true,
          estimateCode: true,
          projectId: true,
          status: true,
          omName: true,
          destinationCityName: true,
          destinationStateUf: true,
          totalAmount: true,
          archivedAt: true,
          deletedAt: true,
          project: {
            select: {
              archivedAt: true,
              deletedAt: true,
            },
          },
        },
      });
    }

    if (!before || before.project.deletedAt || before.project.archivedAt) {
      throw new AppError("Não é possível restaurar estimativa de projeto arquivado", 409);
    }

    const estimate = await prisma.estimate.update({
      where: { id: estimateId },
      data: {
        archivedAt: null,
      },
      include: estimateInclude,
    });

    await auditService.log({
      entityType: "ESTIMATE",
      entityId: before.id,
      action: "RESTORE",
      actor: this.getAuditActor(user),
      summary: `Estimativa EST-${before.estimateCode} restaurada`,
      before: this.buildEstimateAuditSnapshot(before),
      after: this.buildEstimateAuditSnapshot(estimate),
      metadata: {
        permissionUsed: "estimates.restore",
        cascade: Boolean(options.cascade),
      },
    });

    return {
      message: "Estimativa restaurada com sucesso",
      permissionUsed: "estimates.restore" as const,
      cascadeApplied: Boolean(options.cascade),
      estimate,
    };
  }
}
