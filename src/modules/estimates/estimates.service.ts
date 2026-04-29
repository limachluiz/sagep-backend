import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { withArchiveContext } from "../../shared/archive-context.js";
import { auditService } from "../audit/audit.service.js";
import { permissionsService } from "../permissions/permissions.service.js";

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
  archivedFrom?: Date;
  archivedUntil?: Date;
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
          isActive: true,
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
      archivedFrom?: Date;
      archivedUntil?: Date;
    },
  ) {
    if (
      (filters.includeArchived ||
        filters.onlyArchived ||
        filters.archivedFrom ||
        filters.archivedUntil) &&
      !this.isAdmin(user.role)
    ) {
      throw new AppError("Apenas ADMIN pode consultar estimativas arquivadas", 403);
    }

    return {
      includeArchived: Boolean(filters.includeArchived && this.isAdmin(user.role)),
      onlyArchived: Boolean(filters.onlyArchived && this.isAdmin(user.role)),
    };
  }

  private buildArchiveVisibilityWhere(includeArchived = false): Prisma.EstimateWhereInput {
    if (includeArchived) {
      return { deletedAt: null };
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

  private async resolveProject(projectId?: string, projectCode?: number) {
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          projectCode: true,
          title: true,
          ownerId: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!project) {
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
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!project) {
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
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!estimate || estimate.deletedAt) {
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
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!estimate || estimate.deletedAt) {
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
              isActive: boolean;
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
              isActive: true,
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
              isActive: true,
            },
          });
        }

        if (!ataItem) {
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

    return estimate;
  }

  async list(filters: ListEstimatesFilters, user: CurrentUser) {
    const { includeArchived, onlyArchived } = this.resolveArchivedAccess(user, filters);
    const andConditions: Prisma.EstimateWhereInput[] = [];
    const hasArchivedPeriod = Boolean(filters.archivedFrom || filters.archivedUntil);

    andConditions.push(
      onlyArchived || hasArchivedPeriod
        ? {
            archivedAt: {
              not: null,
              ...(filters.archivedFrom && { gte: filters.archivedFrom }),
              ...(filters.archivedUntil && { lte: filters.archivedUntil }),
            },
            deletedAt: null,
          }
        : this.buildArchiveVisibilityWhere(includeArchived),
    );

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

    if (includeArchived || onlyArchived || hasArchivedPeriod) {
      return withArchiveContext("ESTIMATE", estimates);
    }

    return estimates;
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

    return estimate;
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

    return estimate;
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
        ataId: true,
        coverageGroupId: true,
        omId: true,
        destinationCityName: true,
        destinationStateUf: true,
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

    const estimate = await prisma.estimate.update({
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

    return estimate;
  }

  async updateStatus(estimateId: string, data: UpdateEstimateStatusInput, user: CurrentUser) {
    if (
      data.status === "FINALIZADA" &&
      !permissionsService.hasPermission(user, "estimates.finalize")
    ) {
      throw new AppError("Você não tem permissão para finalizar estimativas", 403);
    }

    await this.ensureCanManage(estimateId, user);

    const estimate = await prisma.estimate.update({
      where: { id: estimateId },
      data: {
        status: data.status,
      },
      include: estimateInclude,
    });

    return estimate;
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

  async restore(estimateId: string, user: CurrentUser) {
    if (!permissionsService.hasPermission(user, "estimates.restore")) {
      throw new AppError("Você não tem permissão para restaurar esta estimativa", 403);
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

    if (before.project.deletedAt || before.project.archivedAt) {
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
      },
    });

    return {
      message: "Estimativa restaurada com sucesso",
      permissionUsed: "estimates.restore" as const,
      estimate,
    };
  }
}
