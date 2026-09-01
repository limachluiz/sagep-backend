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
  vendorCnpj?: string;
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
  vendorCnpj?: string;
  managingAgency?: string;
  validFrom?: Date;
  validUntil?: Date;
  notes?: string;
  isActive?: boolean;
  coverageGroups?: CoverageGroupInput[];
};

type UpdateCoverageGroupInput = Partial<CoverageGroupInput>;

type ReplaceCoverageInput = {
  regionNumber: number;
  localities: CoverageLocalityInput[];
};

type ListAtasFilters = {
  code?: number;
  type?: "CFTV" | "FIBRA_OPTICA";
  groupCode?: string;
  cityName?: string;
  stateUf?: UfValue;
  active?: boolean;
  search?: string;
  pregaoId?: string;
};

const ataInclude = {
  pregao: {
    select: {
      id: true,
      pregaoCode: true,
      uasg: true,
      number: true,
      year: true,
      modality: true,
      object: true,
      type: true,
      managingAgency: true,
      isActive: true,
    },
  },
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

const coverageGroupSelect = {
  id: true,
  ataId: true,
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
} satisfies Prisma.AtaCoverageGroupSelect;

export class AtasService {
  private normalizeCoverageGroup(group: CoverageGroupInput) {
    return {
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
    };
  }

  private normalizeCoverageGroupPatch(group: UpdateCoverageGroupInput) {
    return {
      ...(group.code !== undefined && { code: group.code.trim().toUpperCase() }),
      ...(group.name !== undefined && { name: group.name.trim() }),
      ...(group.description !== undefined && { description: group.description?.trim() }),
      ...(group.localities !== undefined && {
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
      }),
    };
  }

  private normalizeCoverageGroups(groups: CoverageGroupInput[]) {
    return groups.map((group) => this.normalizeCoverageGroup(group));
  }

  private async ensureAtaExists(ataId: string) {
    const ataExists = await prisma.ata.findUnique({
      where: { id: ataId },
      select: { id: true },
    });

    if (!ataExists) {
      throw new AppError("Ata não encontrada", 404);
    }
  }

  async create(data: CreateAtaInput) {
    const coverageGroups = this.normalizeCoverageGroups(data.coverageGroups);

    const ata = await prisma.ata.create({
      data: {
        number: data.number,
        type: data.type,
        vendorName: data.vendorName,
        vendorCnpj: data.vendorCnpj,
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

    if (filters.pregaoId) {
      andConditions.push({ pregaoId: filters.pregaoId });
    }

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
        ...(data.vendorCnpj !== undefined && { vendorCnpj: data.vendorCnpj }),
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

  async createCoverageGroup(ataId: string, data: CoverageGroupInput) {
    await this.ensureAtaExists(ataId);

    const coverageGroup = this.normalizeCoverageGroup(data);
    const duplicateGroup = await prisma.ataCoverageGroup.findUnique({
      where: {
        ataId_code: {
          ataId,
          code: coverageGroup.code,
        },
      },
      select: { id: true },
    });

    if (duplicateGroup) {
      throw new AppError("Já existe um grupo de cobertura com este código nesta ata", 409);
    }

    return prisma.ataCoverageGroup.create({
      data: {
        ataId,
        code: coverageGroup.code,
        name: coverageGroup.name,
        description: coverageGroup.description,
        localities: {
          create: coverageGroup.localities.map((locality) => ({
            cityName: locality.cityName,
            stateUf: locality.stateUf,
          })),
        },
      },
      select: coverageGroupSelect,
    });
  }

  async updateCoverageGroup(
    ataId: string,
    groupId: string,
    data: UpdateCoverageGroupInput
  ) {
    await this.ensureAtaExists(ataId);

    const currentGroup = await prisma.ataCoverageGroup.findFirst({
      where: { id: groupId, ataId },
      select: { id: true },
    });

    if (!currentGroup) {
      throw new AppError("Grupo de cobertura não encontrado para esta ata", 404);
    }

    const coverageGroup = this.normalizeCoverageGroupPatch(data);

    if (coverageGroup.code !== undefined) {
      const duplicateGroup = await prisma.ataCoverageGroup.findUnique({
        where: {
          ataId_code: {
            ataId,
            code: coverageGroup.code,
          },
        },
        select: { id: true },
      });

      if (duplicateGroup && duplicateGroup.id !== groupId) {
        throw new AppError("Já existe um grupo de cobertura com este código nesta ata", 409);
      }
    }

    return prisma.ataCoverageGroup.update({
      where: { id: groupId },
      data: {
        ...(coverageGroup.code !== undefined && { code: coverageGroup.code }),
        ...(coverageGroup.name !== undefined && { name: coverageGroup.name }),
        ...(coverageGroup.description !== undefined && {
          description: coverageGroup.description,
        }),
        ...(coverageGroup.localities !== undefined && {
          localities: {
            deleteMany: {},
            create: coverageGroup.localities.map((locality) => ({
              cityName: locality.cityName,
              stateUf: locality.stateUf,
            })),
          },
        }),
      },
      select: coverageGroupSelect,
    });
  }

  async replaceCoverage(ataId: string, data: ReplaceCoverageInput) {
    await this.ensureAtaExists(ataId);
    const code = `REG-${String(data.regionNumber).padStart(2, "0")}`;
    const name = `Região ${data.regionNumber}`;
    const localities = this.normalizeCoverageGroup({
      code,
      name,
      localities: data.localities,
    }).localities;

    return prisma.$transaction(async (tx) => {
      const groups = await tx.ataCoverageGroup.findMany({
        where: { ataId },
        include: {
          items: { select: { id: true, referenceCode: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      let target = groups.find((group) => group.code === code) ?? groups[0];
      if (!target) {
        target = await tx.ataCoverageGroup.create({
          data: { ataId, code, name },
          include: { items: { where: { deletedAt: null }, select: { id: true, referenceCode: true } } },
        });
      }

      const references = new Map<string, string>();
      for (const group of groups) {
        for (const item of group.items) {
          const key = item.referenceCode.trim().toLocaleUpperCase("pt-BR");
          const owner = references.get(key);
          if (owner && owner !== group.id) {
            throw new AppError(
              `Não foi possível consolidar: o item ${item.referenceCode} aparece em mais de um grupo.`,
              409,
            );
          }
          references.set(key, group.id);
        }
      }

      const obsoleteIds = groups.filter((group) => group.id !== target.id).map((group) => group.id);
      if (obsoleteIds.length > 0) {
        await tx.ataItem.updateMany({
          where: { ataId, coverageGroupId: { in: obsoleteIds } },
          data: { coverageGroupId: target.id },
        });
        await tx.estimate.updateMany({
          where: { ataId, coverageGroupId: { in: obsoleteIds } },
          data: { coverageGroupId: target.id },
        });
        await tx.ataCoverageGroup.deleteMany({ where: { id: { in: obsoleteIds } } });
      }

      return tx.ataCoverageGroup.update({
        where: { id: target.id },
        data: {
          code,
          name,
          description: null,
          localities: {
            deleteMany: {},
            create: localities,
          },
        },
        select: coverageGroupSelect,
      });
    });
  }

  async removeCoverageGroup(ataId: string, groupId: string) {
    await this.ensureAtaExists(ataId);

    const coverageGroup = await prisma.ataCoverageGroup.findFirst({
      where: { id: groupId, ataId },
      select: {
        id: true,
        _count: {
          select: {
            items: true,
            estimates: true,
          },
        },
      },
    });

    if (!coverageGroup) {
      throw new AppError("Grupo de cobertura não encontrado para esta ata", 404);
    }

    if (coverageGroup._count.items > 0 || coverageGroup._count.estimates > 0) {
      throw new AppError("Grupo de cobertura em uso não pode ser removido", 409);
    }

    await prisma.ataCoverageGroup.delete({
      where: { id: groupId },
    });

    return {
      message: "Grupo de cobertura removido com sucesso",
    };
  }

  async remove(ataId: string) {
    const ata = await prisma.ata.findUnique({
      where: { id: ataId },
      select: {
        id: true,
        isActive: true,
        _count: {
          select: {
            estimates: true,
          },
        },
        items: {
          select: {
            _count: {
              select: {
                balanceMovements: true,
              },
            },
          },
        },
      },
    });

    if (!ata) {
      throw new AppError("Ata não encontrada", 404);
    }

    const hasBalanceHistory = ata.items.some(
      (item) => item._count.balanceMovements > 0,
    );

    if (ata._count.estimates > 0 || hasBalanceHistory) {
      throw new AppError(
        "Ata com estimativas ou movimentações de saldo não pode ser excluída",
        409,
      );
    }

    await prisma.ata.delete({
      where: { id: ataId },
    });

    return {
      message: "Ata excluída com sucesso",
    };
  }
}
