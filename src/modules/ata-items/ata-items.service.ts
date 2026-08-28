import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { normalizeMojibakeText } from "../../shared/text-normalization.js";
import { ataItemBalanceService } from "./ata-item-balance.service.js";

type UfValue = "AM" | "RO" | "RR" | "AC";

type CreateAtaItemInput = {
  coverageGroupCode: string;
  referenceCode: string;
  description: string;
  unit: string;
  unitPrice: number;
  initialQuantity: number;
  notes?: string;
};

type UpdateAtaItemInput = {
  coverageGroupCode?: string;
  referenceCode?: string;
  description?: string;
  unit?: string;
  unitPrice?: number;
  initialQuantity?: number;
  notes?: string;
  isActive?: boolean;
};

type ListAtaItemsFilters = {
  code?: number;
  ataCode?: number;
  groupCode?: string;
  cityName?: string;
  stateUf?: UfValue;
  active?: boolean;
  search?: string;
};

const ataItemInclude = {
  ata: {
    select: {
      id: true,
      ataCode: true,
      number: true,
      type: true,
      vendorName: true,
      isActive: true,
      externalUasg: true,
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
} satisfies Prisma.AtaItemInclude;

export class AtaItemsService {
  private normalizeReturnedAtaItemText<T extends { id: string }>(item: T): T {
    const normalized = { ...item } as T & {
      description?: string | null;
      unit?: string | null;
      notes?: string | null;
      ata?: {
        number?: string | null;
        vendorName?: string | null;
      } | null;
    };

    if (normalized.description !== undefined) {
      normalized.description = normalizeMojibakeText(normalized.description);
    }
    if (normalized.unit !== undefined) {
      normalized.unit = normalizeMojibakeText(normalized.unit);
    }
    if (normalized.notes !== undefined) {
      normalized.notes = normalized.notes === null ? null : normalizeMojibakeText(normalized.notes);
    }
    if (normalized.ata) {
      normalized.ata = { ...normalized.ata };
      if (normalized.ata.number !== undefined) {
        normalized.ata.number = normalizeMojibakeText(normalized.ata.number);
      }
      if (normalized.ata.vendorName !== undefined) {
        normalized.ata.vendorName = normalizeMojibakeText(normalized.ata.vendorName);
      }
    }

    return normalized;
  }

  private serializeMovement(movement: {
    id: string;
    movementType: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    summary: string;
    actorName: string | null;
    projectId: string | null;
    estimateId: string | null;
    diexRequestId: string | null;
    serviceOrderId: string | null;
    createdAt: Date;
    project: { projectCode: number } | null;
    estimate: { estimateCode: number } | null;
    diexRequest: { diexCode: number } | null;
    serviceOrder: { serviceOrderCode: number } | null;
  }) {
    return {
      id: movement.id,
      movementType: movement.movementType,
      quantity: movement.quantity.toString(),
      unitPrice: movement.unitPrice.toString(),
      totalAmount: movement.totalAmount.toString(),
      summary: movement.summary,
      actorName: movement.actorName,
      projectId: movement.projectId,
      projectCode: movement.project?.projectCode ?? null,
      estimateId: movement.estimateId,
      estimateCode: movement.estimate?.estimateCode ?? null,
      diexRequestId: movement.diexRequestId,
      diexCode: movement.diexRequest?.diexCode ?? null,
      serviceOrderId: movement.serviceOrderId,
      serviceOrderCode: movement.serviceOrder?.serviceOrderCode ?? null,
      createdAt: movement.createdAt,
    };
  }

  private async ensureAtaExists(ataId: string) {
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

    return ata;
  }

  private async resolveCoverageGroup(ataId: string, coverageGroupCode: string) {
    const coverageGroup = await prisma.ataCoverageGroup.findFirst({
      where: {
        ataId,
        code: coverageGroupCode.trim().toUpperCase(),
      },
      select: {
        id: true,
        ataId: true,
        code: true,
        name: true,
      },
    });

    if (!coverageGroup) {
      throw new AppError("Grupo de cobertura não encontrado para esta ata", 404);
    }

    return coverageGroup;
  }

  private compareItemOrder(
    left: { ataItemCode: number; referenceCode: string; ata?: { ataCode: number } | null },
    right: { ataItemCode: number; referenceCode: string; ata?: { ataCode: number } | null },
  ) {
    const ataOrder = (left.ata?.ataCode ?? 0) - (right.ata?.ataCode ?? 0);
    if (ataOrder !== 0) return ataOrder;

    const referenceOrder = left.referenceCode.localeCompare(right.referenceCode, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
    return referenceOrder !== 0 ? referenceOrder : left.ataItemCode - right.ataItemCode;
  }

  private normalizeMoney(value: number) {
    return value.toFixed(2);
  }

  private normalizeQuantity(value: number) {
    return value.toFixed(2);
  }

  async create(ataId: string, data: CreateAtaItemInput) {
    await this.ensureAtaExists(ataId);
    const coverageGroup = await this.resolveCoverageGroup(ataId, data.coverageGroupCode);

    const item = await prisma.ataItem.create({
      data: {
        ataId,
        coverageGroupId: coverageGroup.id,
        referenceCode: data.referenceCode.trim(),
        description: data.description.trim(),
        unit: data.unit.trim().toUpperCase(),
        unitPrice: this.normalizeMoney(data.unitPrice),
        initialQuantity: this.normalizeQuantity(data.initialQuantity),
        notes: data.notes?.trim(),
      },
      include: ataItemInclude,
    });

    return this.normalizeReturnedAtaItemText(
      (await ataItemBalanceService.enrichAtaItemsWithBalance([item]))[0],
    );
  }

  async listByAta(ataId: string, filters: ListAtaItemsFilters) {
    await this.ensureAtaExists(ataId);

    const andConditions: Prisma.AtaItemWhereInput[] = [{ ataId }, { deletedAt: null }];

    if (filters.code) {
      andConditions.push({
        ataItemCode: filters.code,
      });
    }

    if (filters.groupCode) {
      andConditions.push({
        coverageGroup: {
          code: {
            equals: filters.groupCode.trim().toUpperCase(),
          },
        },
      });
    }

    if (filters.cityName) {
      andConditions.push({
        coverageGroup: {
          localities: {
            some: {
              cityName: {
                contains: filters.cityName,
                mode: "insensitive",
              },
            },
          },
        },
      });
    }

    if (filters.stateUf) {
      andConditions.push({
        coverageGroup: {
          localities: {
            some: {
              stateUf: filters.stateUf,
            },
          },
        },
      });
    }

    if (filters.active !== undefined) {
      andConditions.push({
        isActive: filters.active,
      });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          {
            referenceCode: {
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
          {
            notes: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        ],
      });
    }

    const items = await prisma.ataItem.findMany({
      where: {
        AND: andConditions,
      },
      include: ataItemInclude,
      orderBy: [
        { referenceCode: "asc" },
        { ataItemCode: "asc" },
      ],
    });

    const orderedItems = [...items].sort((left, right) => this.compareItemOrder(left, right));
    return (await ataItemBalanceService.enrichAtaItemsWithBalance(orderedItems)).map((item) =>
      this.normalizeReturnedAtaItemText(item),
    );
  }

  async list(filters: ListAtaItemsFilters) {
    const andConditions: Prisma.AtaItemWhereInput[] = [{ deletedAt: null }];

    if (filters.code) {
      andConditions.push({
        ataItemCode: filters.code,
      });
    }

    if (filters.ataCode) {
      andConditions.push({
        ata: {
          ataCode: filters.ataCode,
        },
      });
    }

    if (filters.groupCode) {
      andConditions.push({
        coverageGroup: {
          code: {
            equals: filters.groupCode.trim().toUpperCase(),
          },
        },
      });
    }

    if (filters.cityName) {
      andConditions.push({
        coverageGroup: {
          localities: {
            some: {
              cityName: {
                contains: filters.cityName,
                mode: "insensitive",
              },
            },
          },
        },
      });
    }

    if (filters.stateUf) {
      andConditions.push({
        coverageGroup: {
          localities: {
            some: {
              stateUf: filters.stateUf,
            },
          },
        },
      });
    }

    if (filters.active !== undefined) {
      andConditions.push({
        isActive: filters.active,
      });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          {
            referenceCode: {
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
          {
            notes: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        ],
      });
    }

    const where: Prisma.AtaItemWhereInput | undefined =
      andConditions.length > 0 ? { AND: andConditions } : undefined;

    const items = await prisma.ataItem.findMany({
      where,
      include: ataItemInclude,
      orderBy: [
        { ata: { ataCode: "asc" } },
        { referenceCode: "asc" },
        { ataItemCode: "asc" },
      ],
    });

    const orderedItems = [...items].sort((left, right) => this.compareItemOrder(left, right));
    return (await ataItemBalanceService.enrichAtaItemsWithBalance(orderedItems)).map((item) =>
      this.normalizeReturnedAtaItemText(item),
    );
  }

  async findById(itemId: string) {
    const item = await prisma.ataItem.findUnique({
      where: { id: itemId },
      include: ataItemInclude,
    });

    if (!item || item.deletedAt) {
      throw new AppError("Item da ata não encontrado", 404);
    }

    return this.normalizeReturnedAtaItemText(
      (await ataItemBalanceService.enrichAtaItemsWithBalance([item]))[0],
    );
  }

  async findByCode(itemCode: number) {
    const item = await prisma.ataItem.findUnique({
      where: { ataItemCode: itemCode },
      include: ataItemInclude,
    });

    if (!item || item.deletedAt) {
      throw new AppError("Item da ata não encontrado", 404);
    }

    return this.normalizeReturnedAtaItemText(
      (await ataItemBalanceService.enrichAtaItemsWithBalance([item]))[0],
    );
  }

  async listMovements(itemId: string) {
    const item = await prisma.ataItem.findUnique({
      where: { id: itemId },
      select: { id: true, deletedAt: true },
    });

    if (!item || item.deletedAt) {
      throw new AppError("Item da ata não encontrado", 404);
    }

    const movements = await prisma.ataItemBalanceMovement.findMany({
      where: { ataItemId: itemId },
      select: {
        id: true,
        movementType: true,
        quantity: true,
        unitPrice: true,
        totalAmount: true,
        summary: true,
        actorName: true,
        projectId: true,
        estimateId: true,
        diexRequestId: true,
        serviceOrderId: true,
        createdAt: true,
        project: {
          select: {
            projectCode: true,
          },
        },
        estimate: {
          select: {
            estimateCode: true,
          },
        },
        diexRequest: {
          select: {
            diexCode: true,
          },
        },
        serviceOrder: {
          select: {
            serviceOrderCode: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return movements.map((movement) => this.serializeMovement(movement));
  }

  async update(itemId: string, data: UpdateAtaItemInput) {
    const existingItem = await prisma.ataItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        ataId: true,
        deletedAt: true,
      },
    });

    if (!existingItem || existingItem.deletedAt) {
      throw new AppError("Item da ata não encontrado", 404);
    }

    let coverageGroupId: string | undefined;

    if (data.coverageGroupCode) {
      const coverageGroup = await this.resolveCoverageGroup(
        existingItem.ataId,
        data.coverageGroupCode
      );

      coverageGroupId = coverageGroup.id;
    }

    const item = await prisma.ataItem.update({
      where: { id: itemId },
      data: {
        ...(data.referenceCode !== undefined && { referenceCode: data.referenceCode.trim() }),
        ...(data.description !== undefined && { description: data.description.trim() }),
        ...(data.unit !== undefined && { unit: data.unit.trim().toUpperCase() }),
        ...(data.unitPrice !== undefined && {
          unitPrice: this.normalizeMoney(data.unitPrice),
        }),
        ...(data.initialQuantity !== undefined && {
          initialQuantity: this.normalizeQuantity(data.initialQuantity),
        }),
        ...(data.notes !== undefined && { notes: data.notes?.trim() }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(coverageGroupId !== undefined && { coverageGroupId }),
      },
      include: ataItemInclude,
    });

    return this.normalizeReturnedAtaItemText(
      (await ataItemBalanceService.enrichAtaItemsWithBalance([item]))[0],
    );
  }

  async remove(itemId: string) {
    const existingItem = await prisma.ataItem.findUnique({
      where: { id: itemId },
      select: { id: true, deletedAt: true },
    });

    if (!existingItem || existingItem.deletedAt) {
      throw new AppError("Item da ata não encontrado", 404);
    }

    await prisma.ataItem.update({
      where: { id: itemId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return {
      message: "Item da ata arquivado com sucesso",
    };
  }

}