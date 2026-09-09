import { describe, expect, it } from "vitest";
import {
  buildAtaBalanceReportData,
  type AtaBalanceReportSourceItem,
} from "../src/modules/reports/ata-balance-report.service.js";
import { renderAtaBalanceReportHtml } from "../src/modules/reports/ata-balance-report.template.js";

function sourceItem(overrides: Partial<AtaBalanceReportSourceItem> = {}): AtaBalanceReportSourceItem {
  return {
    id: "item-1",
    ataItemCode: 1,
    referenceCode: "00001",
    description: "Câmera IP PoE tipo Bullet",
    unit: "UND",
    unitPrice: { toString: () => "100" },
    initialQuantity: { toString: () => "10" },
    openingConsumedQuantity: { toString: () => "2" },
    openingBalanceAppliedAt: new Date("2026-09-01T12:00:00Z"),
    openingBalanceCheckedAt: new Date("2026-09-01T11:00:00Z"),
    openingBalanceReason: "Implantação do SAGEP",
    isActive: true,
    deletedAt: null,
    coverageGroup: { code: "MANAUS", name: "Região Manaus" },
    externalBalanceSnapshot: {
      managerAvailableQuantity: { toString: () => "6.5" },
      checkedAt: new Date("2026-09-01T11:00:00Z"),
      sourceUrl: "https://contratos.gov.br/item-1",
    },
    ata: {
      id: "ata-1",
      ataCode: 1,
      number: "01/2026",
      type: "CFTV",
      vendorName: "Fornecedor Exemplo",
      vendorCnpj: "00.000.000/0001-00",
      isActive: true,
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validUntil: new Date("2026-12-31T23:59:59Z"),
      pregao: { pregaoCode: 1, number: "90001", year: "2026", uasg: "160123" },
    },
    balance: {
      initialQuantity: "10",
      reservedQuantity: "0.5",
      consumedQuantity: "1",
      openingConsumedQuantity: "2",
      totalConsumedQuantity: "3",
      availableQuantity: "6.5",
      initialAmount: "1000",
      reservedAmount: "50",
      consumedAmount: "100",
      openingConsumedAmount: "200",
      totalConsumedAmount: "300",
      availableAmount: "650",
    },
    ...overrides,
  };
}

describe("ATA balance position report", () => {
  it("consolidates the persisted opening balance with SAGEP consumption and reservations", () => {
    const report = buildAtaBalanceReportData(
      [sourceItem()],
      { status: "ALL" },
      "2º Ten Lima",
      new Date("2026-09-09T12:00:00Z"),
    );

    expect(report.summary).toMatchObject({
      initialAmount: "1000.00",
      openingConsumedAmount: "200.00",
      sagepConsumedAmount: "100.00",
      reservedAmount: "50.00",
      availableAmount: "650.00",
      utilizationPercent: 35,
      snapshotCoveragePercent: 100,
      openingCoveragePercent: 100,
    });
    expect(report.atas[0].ata.status).toBe("ACTIVE");
  });

  it("applies type and status filters before calculating totals", () => {
    const expiredFiber = sourceItem({
      id: "item-2",
      ataItemCode: 2,
      referenceCode: "00002",
      ata: {
        ...sourceItem().ata,
        id: "ata-2",
        ataCode: 2,
        number: "02/2025",
        type: "FIBRA_OPTICA",
        validUntil: new Date("2025-12-31T23:59:59Z"),
      },
    });
    const report = buildAtaBalanceReportData(
      [sourceItem(), expiredFiber],
      { ataType: "FIBRA_OPTICA", status: "EXPIRED" },
      "Administrador",
      new Date("2026-09-09T12:00:00Z"),
    );

    expect(report.summary.itemCount).toBe(1);
    expect(report.items[0].ata.type).toBe("FIBRA_OPTICA");
  });

  it("renders executive, governance, critical and traceability sections", () => {
    const critical = sourceItem({
      balance: {
        ...sourceItem().balance,
        availableQuantity: "0.5",
        availableAmount: "50",
      },
    });
    const report = buildAtaBalanceReportData(
      [critical],
      { status: "ALL" },
      "2º Ten Lima",
      new Date("2026-09-09T12:00:00Z"),
    );
    const html = renderAtaBalanceReportHtml({
      ...report,
      branding: { ctaLogo: "data:image/png;base64,dGVzdGU=" },
    });

    expect(html).toContain("Posição das ATAs e Saldos");
    expect(html).toContain("Composição financeira consolidada");
    expect(html).toContain("Cobertura da conciliação oficial");
    expect(html).toContain("Itens com saldo crítico ou esgotado");
    expect(html).toContain("Câmera IP PoE tipo Bullet");
    expect(html).toContain("Diferença:");
    expect(html).toContain("Aplicado em");
    expect(html).not.toContain("NaN");
  });
});
