import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
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

    return (await ataItemBalanceService.enrichAtaItemsWithBalance([item]))[0];
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
        { coverageGroup: { code: "asc" } },
        { referenceCode: "asc" },
      ],
    });

    return ataItemBalanceService.enrichAtaItemsWithBalance(items);
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
        { coverageGroup: { code: "asc" } },
        { referenceCode: "asc" },
      ],
    });

    return ataItemBalanceService.enrichAtaItemsWithBalance(items);
  }

  async findById(itemId: string) {
    const item = await prisma.ataItem.findUnique({
      where: { id: itemId },
      include: ataItemInclude,
    });

    if (!item || item.deletedAt) {
      throw new AppError("Item da ata não encontrado", 404);
    }

    return (await ataItemBalanceService.enrichAtaItemsWithBalance([item]))[0];
  }

  async findByCode(itemCode: number) {
    const item = await prisma.ataItem.findUnique({
      where: { ataItemCode: itemCode },
      include: ataItemInclude,
    });

    if (!item || item.deletedAt) {
      throw new AppError("Item da ata não encontrado", 404);
    }

    return (await ataItemBalanceService.enrichAtaItemsWithBalance([item]))[0];
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

    return (await ataItemBalanceService.enrichAtaItemsWithBalance([item]))[0];
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
