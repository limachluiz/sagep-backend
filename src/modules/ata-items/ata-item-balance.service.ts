import { Prisma } from "../../generated/prisma/client.js";
import * as $Enums from "../../generated/prisma/enums.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

type BalanceActor = {
  id: string;
  email?: string | null;
  name?: string | null;
};

type AtaItemForBalance = {
  id: string;
  ataItemCode?: number;
  referenceCode?: string;
  description?: string;
  unitPrice: Prisma.Decimal;
  initialQuantity: Prisma.Decimal;
  isActive?: boolean;
  deletedAt?: Date | null;
};

type BalanceSummary = {
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

type BalanceMovementContext = {
  projectId: string;
  estimateId?: string | null;
  estimateItemId?: string | null;
  diexRequestId?: string | null;
  serviceOrderId?: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  movementType:
    | "RESERVE"
    | "RELEASE"
    | "CONSUME"
    | "EXTERNAL_CONSUMPTION"
    | "REVERSE_CONSUME"
    | "ADJUSTMENT";
  summary: string;
  metadata?: Prisma.InputJsonValue;
};

function decimal(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

function zero() {
  return decimal(0);
}

function keyByEstimateItem(item: { estimateItemId?: string | null; ataItemId: string }) {
  return `${item.estimateItemId ?? "na"}:${item.ataItemId}`;
}

export class AtaItemBalanceService {
  private computeBalanceSummary(item: AtaItemForBalance, movements: Array<{
    movementType: string;
    quantity: Prisma.Decimal;
    createdAt: Date;
  }>): BalanceSummary {
    let reservedQuantity = zero();
    let consumedQuantity = zero();
    let lastMovementAt: Date | null = null;

    for (const movement of movements) {
      lastMovementAt =
        !lastMovementAt || movement.createdAt.getTime() > lastMovementAt.getTime()
          ? movement.createdAt
          : lastMovementAt;

      if (movement.movementType === "RESERVE") {
        reservedQuantity = reservedQuantity.add(movement.quantity);
      }

      if (movement.movementType === "RELEASE") {
        reservedQuantity = reservedQuantity.sub(movement.quantity);
      }

      if (movement.movementType === "CONSUME") {
        reservedQuantity = reservedQuantity.sub(movement.quantity);
        consumedQuantity = consumedQuantity.add(movement.quantity);
      }

      if (movement.movementType === "EXTERNAL_CONSUMPTION") {
        consumedQuantity = consumedQuantity.add(movement.quantity);
      }

      if (movement.movementType === "REVERSE_CONSUME") {
        consumedQuantity = consumedQuantity.sub(movement.quantity);
      }

      if (movement.movementType === "ADJUSTMENT") {
        reservedQuantity = reservedQuantity.add(movement.quantity);
      }
    }

    if (reservedQuantity.lessThan(0) || consumedQuantity.lessThan(0)) {
      throw new AppError("Inconsistência de saldo detectada para item da ATA", 409);
    }

    const initialQuantity = decimal(item.initialQuantity);
    const availableQuantity = initialQuantity.sub(reservedQuantity).sub(consumedQuantity);

    if (availableQuantity.lessThan(0)) {
      throw new AppError("Saldo negativo detectado para item da ATA", 409);
    }

    const initialAmount = item.unitPrice.mul(initialQuantity).toDecimalPlaces(2);
    const reservedAmount = item.unitPrice.mul(reservedQuantity).toDecimalPlaces(2);
    const consumedAmount = item.unitPrice.mul(consumedQuantity).toDecimalPlaces(2);
    const availableAmount = item.unitPrice.mul(availableQuantity).toDecimalPlaces(2);
    const insufficient = availableQuantity.lessThanOrEqualTo(0);
    const lowStock = availableQuantity.greaterThan(0) && availableQuantity.lessThanOrEqualTo(1);

      return {
        initialQuantity: initialQuantity.toString(),
        reservedQuantity: reservedQuantity.toString(),
        consumedQuantity: consumedQuantity.toString(),
        availableQuantity: availableQuantity.toString(),
        initialAmount: initialAmount.toString(),
        reservedAmount: reservedAmount.toString(),
        consumedAmount: consumedAmount.toString(),
        availableAmount: availableAmount.toString(),
        lowStock,
        insufficient,
        lastMovementAt,
      };
  }

  private async getMovementsForAtaItems(ataItemIds: string[], db: DbClient = prisma) {
    if (!ataItemIds.length) {
      return [];
    }

    return db.ataItemBalanceMovement.findMany({
      where: {
        ataItemId: {
          in: ataItemIds,
        },
      },
      select: {
        ataItemId: true,
        estimateItemId: true,
        movementType: true,
        quantity: true,
        unitPrice: true,
        projectId: true,
        estimateId: true,
        diexRequestId: true,
        serviceOrderId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  async getBalanceMapForAtaItems(items: AtaItemForBalance[], db: DbClient = prisma) {
    const ataItemIds = items.map((item) => item.id);
    const movements = await this.getMovementsForAtaItems(ataItemIds, db);
    const movementsByItem = new Map<string, typeof movements>();

    for (const movement of movements) {
      const current = movementsByItem.get(movement.ataItemId) ?? [];
      current.push(movement);
      movementsByItem.set(movement.ataItemId, current);
    }

    return new Map(
      items.map((item) => [
        item.id,
        this.computeBalanceSummary(item, movementsByItem.get(item.id) ?? []),
      ]),
    );
  }

  async getBalanceForAtaItem(ataItemId: string, db: DbClient = prisma) {
    const item = await db.ataItem.findUnique({
      where: { id: ataItemId },
      select: {
        id: true,
        ataItemCode: true,
        referenceCode: true,
        description: true,
        unitPrice: true,
        initialQuantity: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!item) {
      throw new AppError("Item da ata não encontrado", 404);
    }

    const balanceMap = await this.getBalanceMapForAtaItems([item], db);
    return balanceMap.get(item.id)!;
  }

  async assertCanAllocateEstimateItems(
    lines: Array<{
      ataItemId: string;
      quantity: Prisma.Decimal;
      referenceCode: string;
      description: string;
    }>,
    db: DbClient = prisma,
  ) {
    const ataItemIds = lines.map((line) => line.ataItemId);
    const items = await db.ataItem.findMany({
      where: {
        id: {
          in: ataItemIds,
        },
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
      },
    });
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const balanceMap = await this.getBalanceMapForAtaItems(items, db);

    for (const line of lines) {
      const item = itemsById.get(line.ataItemId);

      if (!item || item.deletedAt) {
        throw new AppError("Item da ata não encontrado", 404);
      }

      if (!item.isActive) {
        throw new AppError("Não é possível usar item inativo da ata na estimativa", 409);
      }

      const balance = balanceMap.get(line.ataItemId);

      if (!balance) {
        throw new AppError("Saldo do item da ata não encontrado", 404);
      }

      const availableQuantity = decimal(balance.availableQuantity);

      if (line.quantity.greaterThan(availableQuantity)) {
        throw new AppError(
          `Saldo insuficiente para o item ${item.referenceCode}. Disponível: ${availableQuantity.toString()}, solicitado: ${line.quantity.toString()}`,
          409,
        );
      }
    }
  }

  private async createMovements(
    ataItemId: string,
    actor: BalanceActor,
    contexts: BalanceMovementContext[],
    db: DbClient = prisma,
  ) {
    if (!contexts.length) {
      return;
    }

    await db.ataItemBalanceMovement.createMany({
      data: contexts.map((context) => ({
        ataItemId,
        projectId: context.projectId,
        estimateId: context.estimateId ?? null,
        estimateItemId: context.estimateItemId ?? null,
        diexRequestId: context.diexRequestId ?? null,
        serviceOrderId: context.serviceOrderId ?? null,
        actorUserId: actor.id,
        actorName: actor.name ?? actor.email ?? null,
        movementType: context.movementType as $Enums.AtaItemBalanceMovementType,
        quantity: context.quantity,
        unitPrice: context.unitPrice,
        totalAmount: context.unitPrice.mul(context.quantity).toDecimalPlaces(2),
        summary: context.summary,
        metadata: context.metadata,
      })),
    });
  }

  async reserveForDiex(
    diexRequestId: string,
    actor: BalanceActor,
    db: DbClient = prisma,
  ) {
    const diex = await db.diexRequest.findUnique({
      where: { id: diexRequestId },
      select: {
        id: true,
        diexCode: true,
        projectId: true,
        estimateId: true,
        archivedAt: true,
        deletedAt: true,
        items: {
          select: {
            estimateItemId: true,
            quantityRequested: true,
            unitPrice: true,
            estimateItem: {
              select: {
                ataItemId: true,
                referenceCode: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!diex || diex.deletedAt || diex.archivedAt) {
      throw new AppError("DIEx não encontrado para reserva de saldo", 404);
    }

    const existingReserve = await db.ataItemBalanceMovement.count({
      where: {
        diexRequestId,
        movementType: "RESERVE",
      },
    });

    if (existingReserve > 0) {
      throw new AppError("O saldo deste DIEx já foi reservado", 409);
    }

    const lines = diex.items.map((item) => ({
      ataItemId: item.estimateItem.ataItemId,
      quantity: item.quantityRequested,
      referenceCode: item.estimateItem.referenceCode,
      description: item.estimateItem.description,
    }));

    await this.assertCanAllocateEstimateItems(lines, db);

    for (const item of diex.items) {
      await this.createMovements(
        item.estimateItem.ataItemId,
        actor,
        [
          {
            projectId: diex.projectId,
            estimateId: diex.estimateId,
            estimateItemId: item.estimateItemId,
            diexRequestId: diex.id,
            quantity: item.quantityRequested,
            unitPrice: item.unitPrice,
            movementType: "RESERVE",
            summary: `Reserva de saldo para o DIEx #${diex.diexCode}`,
            metadata: {
              source: "diex.create",
            },
          },
        ],
        db,
      );
    }
  }

  async releaseForDiex(
    diexRequestId: string,
    actor: BalanceActor,
    db: DbClient = prisma,
    reason = "Cancelamento do DIEx antes da Nota de Empenho",
  ) {
    const movements = await db.ataItemBalanceMovement.findMany({
      where: {
        diexRequestId,
        movementType: {
          in: ["RESERVE", "RELEASE", "CONSUME"],
        },
      },
      select: {
        ataItemId: true,
        projectId: true,
        estimateId: true,
        estimateItemId: true,
        diexRequestId: true,
        quantity: true,
        unitPrice: true,
        movementType: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const outstanding = new Map<
      string,
      {
        ataItemId: string;
        projectId: string | null;
        estimateId: string | null;
        estimateItemId: string | null;
        diexRequestId: string | null;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
      }
    >();

    for (const movement of movements) {
      const key = keyByEstimateItem(movement);
      const current =
        outstanding.get(key) ??
        {
          ataItemId: movement.ataItemId,
          projectId: movement.projectId,
          estimateId: movement.estimateId,
          estimateItemId: movement.estimateItemId,
          diexRequestId: movement.diexRequestId,
          quantity: zero(),
          unitPrice: movement.unitPrice,
        };

      if (movement.movementType === "RESERVE") {
        current.quantity = current.quantity.add(movement.quantity);
      }

      if (movement.movementType === "RELEASE" || movement.movementType === "CONSUME") {
        current.quantity = current.quantity.sub(movement.quantity);
      }

      outstanding.set(key, current);
    }

    for (const item of outstanding.values()) {
      if (item.quantity.lessThanOrEqualTo(0)) {
        continue;
      }

      await this.createMovements(
        item.ataItemId,
        actor,
        [
          {
            projectId: item.projectId ?? "",
            estimateId: item.estimateId,
            estimateItemId: item.estimateItemId,
            diexRequestId: item.diexRequestId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            movementType: "RELEASE",
            summary: `Liberação de saldo do DIEx: ${reason}`,
            metadata: {
              source: "diex.remove",
              reason,
            },
          },
        ],
        db,
      );
    }
  }

  async consumeForProjectCommitmentNote(
    projectId: string,
    actor: BalanceActor,
    commitmentNoteNumber: string,
    db: DbClient = prisma,
  ) {
    const activeDiex = await db.diexRequest.findFirst({
      where: {
        projectId,
        archivedAt: null,
        deletedAt: null,
      },
      select: {
        id: true,
        estimateId: true,
        items: {
          select: {
            estimateItemId: true,
            quantityRequested: true,
            unitPrice: true,
            estimateItem: {
              select: {
                ataItemId: true,
                referenceCode: true,
                description: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!activeDiex) {
      throw new AppError("Não existe DIEx ativo para consumir saldo da Nota de Empenho", 409);
    }

    const existingConsumption = await db.ataItemBalanceMovement.count({
      where: {
        projectId,
        movementType: "CONSUME",
      },
    });

    if (existingConsumption > 0) {
      throw new AppError("O saldo desta Nota de Empenho já foi consumido", 409);
    }

    const reservationMovements = await db.ataItemBalanceMovement.findMany({
      where: {
        diexRequestId: activeDiex.id,
        movementType: {
          in: ["RESERVE", "RELEASE", "CONSUME"],
        },
      },
      select: {
        ataItemId: true,
        estimateItemId: true,
        quantity: true,
        unitPrice: true,
        movementType: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const reservedByLine = new Map<
      string,
      { ataItemId: string; estimateItemId: string | null; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal }
    >();

    for (const movement of reservationMovements) {
      const key = keyByEstimateItem(movement);
      const current =
        reservedByLine.get(key) ?? {
          ataItemId: movement.ataItemId,
          estimateItemId: movement.estimateItemId,
          quantity: zero(),
          unitPrice: movement.unitPrice,
        };

      if (movement.movementType === "RESERVE") {
        current.quantity = current.quantity.add(movement.quantity);
      }

      if (movement.movementType === "RELEASE" || movement.movementType === "CONSUME") {
        current.quantity = current.quantity.sub(movement.quantity);
      }

      reservedByLine.set(key, current);
    }

    for (const item of activeDiex.items) {
      const key = keyByEstimateItem({
        ataItemId: item.estimateItem.ataItemId,
        estimateItemId: item.estimateItemId,
      });
      const reserved = reservedByLine.get(key);

      if (!reserved || reserved.quantity.lessThan(item.quantityRequested)) {
        throw new AppError(
          `Reserva insuficiente para consumir o item ${item.estimateItem.referenceCode}`,
          409,
        );
      }

      await this.createMovements(
        item.estimateItem.ataItemId,
        actor,
        [
          {
            projectId,
            estimateId: activeDiex.estimateId,
            estimateItemId: item.estimateItemId,
            diexRequestId: activeDiex.id,
            quantity: item.quantityRequested,
            unitPrice: item.unitPrice,
            movementType: "CONSUME",
            summary: `Consumo de saldo após informar a NE ${commitmentNoteNumber}`,
            metadata: {
              source: "project.commitment-note.inform",
              commitmentNoteNumber,
            },
          },
        ],
        db,
      );
    }
  }

  async reverseConsumedForProject(
    projectId: string,
    actor: BalanceActor,
    reason: string,
    serviceOrderId?: string | null,
    db: DbClient = prisma,
  ) {
    const movements = await db.ataItemBalanceMovement.findMany({
      where: {
        projectId,
        movementType: {
          in: ["CONSUME", "REVERSE_CONSUME"],
        },
      },
      select: {
        ataItemId: true,
        projectId: true,
        estimateId: true,
        estimateItemId: true,
        diexRequestId: true,
        serviceOrderId: true,
        quantity: true,
        unitPrice: true,
        movementType: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const consumedByLine = new Map<
      string,
      {
        ataItemId: string;
        projectId: string | null;
        estimateId: string | null;
        estimateItemId: string | null;
        diexRequestId: string | null;
        serviceOrderId: string | null;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
      }
    >();

    for (const movement of movements) {
      const key = keyByEstimateItem(movement);
      const current =
        consumedByLine.get(key) ?? {
          ataItemId: movement.ataItemId,
          projectId: movement.projectId,
          estimateId: movement.estimateId,
          estimateItemId: movement.estimateItemId,
          diexRequestId: movement.diexRequestId,
          serviceOrderId: movement.serviceOrderId,
          quantity: zero(),
          unitPrice: movement.unitPrice,
        };

      if (movement.movementType === "CONSUME") {
        current.quantity = current.quantity.add(movement.quantity);
      }

      if (movement.movementType === "REVERSE_CONSUME") {
        current.quantity = current.quantity.sub(movement.quantity);
      }

      consumedByLine.set(key, current);
    }

    let reversedCount = 0;

    for (const item of consumedByLine.values()) {
      if (item.quantity.lessThanOrEqualTo(0)) {
        continue;
      }

      await this.createMovements(
        item.ataItemId,
        actor,
        [
          {
            projectId,
            estimateId: item.estimateId,
            estimateItemId: item.estimateItemId,
            diexRequestId: item.diexRequestId,
            serviceOrderId: serviceOrderId ?? item.serviceOrderId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            movementType: "REVERSE_CONSUME",
            summary: `Estorno de saldo por cancelamento da Nota de Empenho: ${reason}`,
            metadata: {
              source: "project.commitment-note.cancel",
              reason,
            },
          },
        ],
        db,
      );

      reversedCount += 1;
    }

    if (reversedCount === 0) {
      throw new AppError("Não existe saldo consumido para estornar nesta Nota de Empenho", 409);
    }
  }

  async enrichAtaItemsWithBalance<T extends AtaItemForBalance>(items: T[], db: DbClient = prisma) {
    const balanceMap = await this.getBalanceMapForAtaItems(items, db);

    return items.map((item) => ({
      ...item,
      balance: balanceMap.get(item.id)!,
    }));
  }

  async listBalanceAlerts(db: DbClient = prisma) {
    const items = await db.ataItem.findMany({
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
      },
      orderBy: {
        ataItemCode: "asc",
      },
    });

    const balanceMap = await this.getBalanceMapForAtaItems(items, db);
    const lowStockItems = items
      .map((item) => ({
        item,
        balance: balanceMap.get(item.id)!,
      }))
      .filter(({ balance }) => balance.lowStock || balance.insufficient);

    const staleReservations = await db.ataItemBalanceMovement.findMany({
      where: {
        movementType: "RESERVE",
      },
      select: {
        ataItemId: true,
        projectId: true,
        estimateId: true,
        diexRequestId: true,
        quantity: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return {
      lowStockItems,
      staleReservations,
    };
  }
}

export const ataItemBalanceService = new AtaItemBalanceService();
