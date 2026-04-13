import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

type UfValue = "AM" | "RO" | "RR" | "AC";

type CoverageLocalityInput = {
  cityName: string;
  stateUf: UfValue;
};

type CoverageGroupInput = {
  code: string;
  name: string;
  description?: string;
  localities: CoverageLocalityInput[];
};

type CreateAtaInput = {
  number: string;
  type: "CFTV" | "FIBRA_OPTICA";
  vendorName: string;
  managingAgency?: string;
  validFrom?: Date;
  validUntil?: Date;
  notes?: string;
  coverageGroups: CoverageGroupInput[];
};

type UpdateAtaInput = {
  number?: string;
  type?: "CFTV" | "FIBRA_OPTICA";
  vendorName?: string;
  managingAgency?: string;
  validFrom?: Date;
  validUntil?: Date;
  notes?: string;
  isActive?: boolean;
  coverageGroups?: CoverageGroupInput[];
};

type ListAtasFilters = {
  code?: number;
  type?: "CFTV" | "FIBRA_OPTICA";
  groupCode?: string;
  cityName?: string;
  stateUf?: UfValue;
  active?: boolean;
  search?: string;
};

const ataInclude = {
  coverageGroups: {
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      createdAt: true,
      localities: {
        select: {
          id: true,
          cityName: true,
          stateUf: true,
          createdAt: true,
        },
        orderBy: [{ stateUf: "asc" }, { cityName: "asc" }],
      },
    },
    orderBy: {
      code: "asc",
    },
  },
} satisfies Prisma.AtaInclude;

export class AtasService {
  private normalizeCoverageGroups(groups: CoverageGroupInput[]) {
    return groups.map((group) => ({
      code: group.code.trim().toUpperCase(),
      name: group.name.trim(),
      description: group.description?.trim(),
      localities: group.localities
        .map((locality) => ({
          cityName: locality.cityName.trim(),
          stateUf: locality.stateUf,
        }))
        .filter(
          (locality, index, array) =>
            array.findIndex(
              (item) =>
                item.cityName.toLowerCase() === locality.cityName.toLowerCase() &&
                item.stateUf === locality.stateUf
            ) === index
        ),
    }));
  }

  async create(data: CreateAtaInput) {
    const coverageGroups = this.normalizeCoverageGroups(data.coverageGroups);

    const ata = await prisma.ata.create({
      data: {
        number: data.number,
        type: data.type,
        vendorName: data.vendorName,
        managingAgency: data.managingAgency,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        notes: data.notes,
        coverageGroups: {
          create: coverageGroups.map((group) => ({
            code: group.code,
            name: group.name,
            description: group.description,
            localities: {
              create: group.localities.map((locality) => ({
                cityName: locality.cityName,
                stateUf: locality.stateUf,
              })),
            },
          })),
        },
      },
      include: ataInclude,
    });

    return ata;
  }

  async list(filters: ListAtasFilters) {
    const andConditions: Prisma.AtaWhereInput[] = [];

    if (filters.code) {
      andConditions.push({ ataCode: filters.code });
    }

    if (filters.type) {
      andConditions.push({ type: filters.type });
    }

    if (filters.groupCode) {
      andConditions.push({
        coverageGroups: {
          some: {
            code: {
              equals: filters.groupCode.toUpperCase(),
            },
          },
        },
      });
    }

    if (filters.cityName) {
      andConditions.push({
        coverageGroups: {
          some: {
            localities: {
              some: {
                cityName: {
                  contains: filters.cityName,
                  mode: "insensitive",
                },
              },
            },
          },
        },
      });
    }

    if (filters.stateUf) {
      andConditions.push({
        coverageGroups: {
          some: {
            localities: {
              some: {
                stateUf: filters.stateUf,
              },
            },
          },
        },
      });
    }

    if (filters.active !== undefined) {
      andConditions.push({ isActive: filters.active });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          {
            number: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            vendorName: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            managingAgency: {
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
            coverageGroups: {
              some: {
                OR: [
                  {
                    name: {
                      contains: filters.search,
                      mode: "insensitive",
                    },
                  },
                  {
                    code: {
                      contains: filters.search,
                      mode: "insensitive",
                    },
                  },
                  {
                    localities: {
                      some: {
                        cityName: {
                          contains: filters.search,
                          mode: "insensitive",
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      });
    }

    const where: Prisma.AtaWhereInput | undefined =
      andConditions.length > 0 ? { AND: andConditions } : undefined;

    const atas = await prisma.ata.findMany({
      where,
      include: ataInclude,
      orderBy: {
        ataCode: "asc",
      },
    });

    return atas;
  }

  async findById(ataId: string) {
    const ata = await prisma.ata.findUnique({
      where: { id: ataId },
      include: ataInclude,
    });

    if (!ata) {
      throw new AppError("Ata não encontrada", 404);
    }

    return ata;
  }

  async findByCode(ataCode: number) {
    const ata = await prisma.ata.findUnique({
      where: { ataCode },
      include: ataInclude,
    });

    if (!ata) {
      throw new AppError("Ata não encontrada", 404);
    }

    return ata;
  }

  async update(ataId: string, data: UpdateAtaInput) {
    const ataExists = await prisma.ata.findUnique({
      where: { id: ataId },
      select: { id: true },
    });

    if (!ataExists) {
      throw new AppError("Ata não encontrada", 404);
    }

    const normalizedCoverageGroups = data.coverageGroups
      ? this.normalizeCoverageGroups(data.coverageGroups)
      : undefined;

    const ata = await prisma.ata.update({
      where: { id: ataId },
      data: {
        ...(data.number !== undefined && { number: data.number }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.vendorName !== undefined && { vendorName: data.vendorName }),
        ...(data.managingAgency !== undefined && { managingAgency: data.managingAgency }),
        ...(data.validFrom !== undefined && { validFrom: data.validFrom }),
        ...(data.validUntil !== undefined && { validUntil: data.validUntil }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(normalizedCoverageGroups !== undefined && {
          coverageGroups: {
            deleteMany: {},
            create: normalizedCoverageGroups.map((group) => ({
              code: group.code,
              name: group.name,
              description: group.description,
              localities: {
                create: group.localities.map((locality) => ({
                  cityName: locality.cityName,
                  stateUf: locality.stateUf,
                })),
              },
            })),
          },
        }),
      },
      include: ataInclude,
    });

    return ata;
  }

  async remove(ataId: string) {
    const ataExists = await prisma.ata.findUnique({
      where: { id: ataId },
      select: { id: true },
    });

    if (!ataExists) {
      throw new AppError("Ata não encontrada", 404);
    }

    await prisma.ata.delete({
      where: { id: ataId },
    });

    return {
      message: "Ata excluída com sucesso",
    };
  }
}