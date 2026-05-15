import { Prisma } from "../../generated/prisma/client.js";
import * as $Enums from "../../generated/prisma/enums.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { ataItemBalanceService } from "./ata-item-balance.service.js";
import { auditService } from "../audit/audit.service.js";

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

type RegisterExternalConsumptionInput = {
  quantity: number;
  reason: string;
  source: string;
  externalStatus: string;
  externalReference: string;
  commitmentNumber?: string;
  unit?: string;
  notes?: string;
};

type ExternalConsumptionActor = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  permissions?: string[];
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
  private serializeLatestExternalBalanceSnapshot(snapshot: {
    source: string;
    status: string;
    externalUsageStatus: string | null;
    managedBalance: Prisma.JsonValue | null;
    adhesionBalance: Prisma.JsonValue | null;
    difference: string | null;
    rawRecords: number;
    lastUpdatedAt: Date | null;
    lastSyncAt: Date;
  } | null) {
    if (!snapshot) return null;

    return {
      source: snapshot.source,
      status: snapshot.status,
      externalUsageStatus: snapshot.externalUsageStatus,
      managedBalance: snapshot.managedBalance,
      adhesionBalance: snapshot.adhesionBalance,
      difference: snapshot.difference,
      rawRecords: snapshot.rawRecords,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      lastSyncAt: snapshot.lastSyncAt,
    };
  }

  private async attachLatestExternalBalanceSnapshot<T extends { id: string }>(items: T[]) {
    if (items.length === 0) return items;

    const snapshots = await prisma.ataItemExternalBalanceSnapshot.findMany({
      where: {
        ataItemId: {
          in: items.map((item) => item.id),
        },
      },
      select: {
        ataItemId: true,
        source: true,
        status: true,
        externalUsageStatus: true,
        managedBalance: true,
        adhesionBalance: true,
        difference: true,
        rawRecords: true,
        lastUpdatedAt: true,
        lastSyncAt: true,
      },
    });

    const snapshotByItemId = new Map(
      snapshots.map((snapshot) => [snapshot.ataItemId, snapshot]),
    );

    return items.map((item) => ({
      ...item,
      latestExternalBalanceSnapshot: this.serializeLatestExternalBalanceSnapshot(
        snapshotByItemId.get(item.id) ?? null,
      ),
    }));
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

  private normalizeMoney(value: number) {
    return value.toFixed(2);
  }

  private normalizeQuantity(value: number) {
    return value.toFixed(2);
  }

  private normalizeOptionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
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

    return (await this.attachLatestExternalBalanceSnapshot(
      await ataItemBalanceService.enrichAtaItemsWithBalance([item]),
    ))[0];
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

    return this.attachLatestExternalBalanceSnapshot(
      await ataItemBalanceService.enrichAtaItemsWithBalance(items),
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
        { coverageGroup: { code: "asc" } },
        { referenceCode: "asc" },
      ],
    });

    return this.attachLatestExternalBalanceSnapshot(
      await ataItemBalanceService.enrichAtaItemsWithBalance(items),
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

    return (await this.attachLatestExternalBalanceSnapshot(
      await ataItemBalanceService.enrichAtaItemsWithBalance([item]),
    ))[0];
  }

  async findByCode(itemCode: number) {
    const item = await prisma.ataItem.findUnique({
      where: { ataItemCode: itemCode },
      include: ataItemInclude,
    });

    if (!item || item.deletedAt) {
      throw new AppError("Item da ata não encontrado", 404);
    }

    return (await this.attachLatestExternalBalanceSnapshot(
      await ataItemBalanceService.enrichAtaItemsWithBalance([item]),
    ))[0];
  }

  async listMovements(itemId: string) {
    const item = await prisma.ataItem.findUnique({
      where: { id: itemId },
      select: { id: true, deletedAt: true },
    });

    if (!item || item.deletedAt) {
      throw new AppError("Item da ata nÃ£o encontrado", 404);
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

    return (await this.attachLatestExternalBalanceSnapshot(
      await ataItemBalanceService.enrichAtaItemsWithBalance([item]),
    ))[0];
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

  async registerExternalConsumption(
    itemId: string,
    data: RegisterExternalConsumptionInput,
    actor: ExternalConsumptionActor,
  ) {
    const normalizedReason = data.reason.trim();
    const normalizedSource = data.source.trim();
    const normalizedExternalStatus = data.externalStatus.trim();
    const normalizedExternalReference = data.externalReference.trim();
    const normalizedCommitmentNumber = this.normalizeOptionalText(data.commitmentNumber);
    const normalizedUnit = this.normalizeOptionalText(data.unit);
    const normalizedNotes = this.normalizeOptionalText(data.notes);
    const normalizedQuantity = new Prisma.Decimal(this.normalizeQuantity(data.quantity));

    return prisma.$transaction(async (tx) => {
      const item = await tx.ataItem.findUnique({
        where: { id: itemId },
        include: ataItemInclude,
      });

      if (!item || item.deletedAt) {
        throw new AppError("Item da ata não encontrado", 404);
      }

      const localBalance = await ataItemBalanceService.getBalanceForAtaItem(itemId, tx);
      const availableQuantity = new Prisma.Decimal(localBalance.availableQuantity);

      if (normalizedQuantity.greaterThan(availableQuantity)) {
        throw new AppError(
          `Saldo insuficiente para registrar consumo externo. Disponivel: ${availableQuantity.toString()}, solicitado: ${normalizedQuantity.toString()}`,
          409,
        );
      }

      const createdMovement = await tx.ataItemBalanceMovement.create({
        data: {
          ataItemId: item.id,
          actorUserId: actor.id,
          actorName: actor.name ?? actor.email ?? null,
          movementType: $Enums.AtaItemBalanceMovementType.EXTERNAL_CONSUMPTION,
          quantity: normalizedQuantity,
          unitPrice: item.unitPrice,
          totalAmount: item.unitPrice.mul(normalizedQuantity).toDecimalPlaces(2),
          summary: `Consumo externo manual registrado: ${normalizedReason}`,
          metadata: {
            source: "COMPRAS_GOV",
            externalSource: normalizedSource,
            externalStatus: normalizedExternalStatus,
            externalReference: normalizedExternalReference,
            commitmentNumber: normalizedCommitmentNumber,
            unit: normalizedUnit,
            reason: normalizedReason,
            notes: normalizedNotes,
          },
        },
        select: {
          id: true,
        },
      });

      const movement = await tx.ataItemBalanceMovement.findUniqueOrThrow({
        where: { id: createdMovement.id },
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
      });

      const updatedLocalBalance = await ataItemBalanceService.getBalanceForAtaItem(itemId, tx);

      await auditService.log({
        entityType: "ATA_ITEM",
        entityId: item.id,
        action: "REGISTER_EXTERNAL_CONSUMPTION",
        actor: {
          id: actor.id,
          name: actor.name ?? actor.email ?? null,
        },
        summary: `Consumo externo manual registrado para o item ${item.referenceCode}`,
        metadata: {
          item: {
            id: item.id,
            ataItemCode: item.ataItemCode,
            referenceCode: item.referenceCode,
            description: item.description,
          },
          ata: {
            id: item.ata.id,
            ataCode: item.ata.ataCode,
            number: item.ata.number,
          },
          quantity: normalizedQuantity.toString(),
          reason: normalizedReason,
          source: normalizedSource,
          externalStatus: normalizedExternalStatus,
          externalReference: normalizedExternalReference,
          commitmentNumber: normalizedCommitmentNumber,
          unit: normalizedUnit,
          notes: normalizedNotes,
        },
      });

      return {
        item: (await ataItemBalanceService.enrichAtaItemsWithBalance([item], tx))[0],
        movement: this.serializeMovement(movement),
        localBalance: updatedLocalBalance,
        message: "Consumo externo registrado manualmente com sucesso",
      };
    });
  }
}
