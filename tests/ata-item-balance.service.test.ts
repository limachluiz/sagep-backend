import { describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { ataItemBalanceService } from "../src/modules/ata-items/ata-item-balance.service.js";

type BalanceCalculator = {
  computeBalanceSummary: (
    item: {
      id: string;
      unitPrice: Prisma.Decimal;
      initialQuantity: Prisma.Decimal;
      openingConsumedQuantity: Prisma.Decimal;
    },
    movements: Array<{ movementType: string; quantity: Prisma.Decimal; createdAt: Date }>,
  ) => {
    reservedQuantity: string;
    consumedQuantity: string;
    openingConsumedQuantity: string;
    totalConsumedQuantity: string;
    availableQuantity: string;
    consumedAmount: string;
    openingConsumedAmount: string;
    totalConsumedAmount: string;
    availableAmount: string;
  };
};

describe("ATA item balance summary", () => {
  it("incorpora o saldo de abertura ao consumo total e ao saldo disponível", () => {
    const service = ataItemBalanceService as unknown as BalanceCalculator;
    const createdAt = new Date("2026-09-09T12:00:00.000Z");
    const balance = service.computeBalanceSummary(
      {
        id: "ata-item-1",
        unitPrice: new Prisma.Decimal(10),
        initialQuantity: new Prisma.Decimal(10),
        openingConsumedQuantity: new Prisma.Decimal(3),
      },
      [
        { movementType: "RESERVE", quantity: new Prisma.Decimal(3), createdAt },
        { movementType: "CONSUME", quantity: new Prisma.Decimal(2), createdAt },
      ],
    );

    expect(balance.openingConsumedQuantity).toBe("3");
    expect(balance.consumedQuantity).toBe("2");
    expect(balance.totalConsumedQuantity).toBe("5");
    expect(balance.reservedQuantity).toBe("1");
    expect(balance.availableQuantity).toBe("4");
    expect(balance.openingConsumedAmount).toBe("30");
    expect(balance.consumedAmount).toBe("20");
    expect(balance.totalConsumedAmount).toBe("50");
    expect(balance.availableAmount).toBe("40");
  });
});
