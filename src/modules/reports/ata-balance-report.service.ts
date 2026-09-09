import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../config/prisma.js";
import { pdfService } from "../../shared/pdf.service.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";
import { renderAtaBalanceReportHtml } from "./ata-balance-report.template.js";

export type AtaBalanceReportFilters = {
  ataType?: "CFTV" | "FIBRA_OPTICA";
  status: "ALL" | "ACTIVE" | "EXPIRED" | "INACTIVE";
};

type ReportUser = {
  id: string;
  name: string;
  rank?: string | null;
  warName?: string | null;
};

type Balance = {
  initialQuantity: string;
  reservedQuantity: string;
  consumedQuantity: string;
  openingConsumedQuantity: string;
  totalConsumedQuantity: string;
  availableQuantity: string;
  initialAmount: string;
  reservedAmount: string;
  consumedAmount: string;
  openingConsumedAmount: string;
  totalConsumedAmount: string;
  availableAmount: string;
};

export type AtaBalanceReportSourceItem = {
  id: string;
  ataItemCode: number;
  referenceCode: string;
  description: string;
  unit: string;
  unitPrice: { toString(): string };
  initialQuantity: { toString(): string };
  openingConsumedQuantity: { toString(): string };
  openingBalanceAppliedAt: Date | null;
  openingBalanceCheckedAt: Date | null;
  openingBalanceReason: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  coverageGroup: { code: string; name: string };
  externalBalanceSnapshot: {
    managerAvailableQuantity: { toString(): string } | null;
    checkedAt: Date;
    sourceUrl: string;
  } | null;
  ata: {
    id: string;
    ataCode: number;
    number: string;
    type: string;
    vendorName: string;
    vendorCnpj: string | null;
    isActive: boolean;
    validFrom: Date | null;
    validUntil: Date | null;
    pregao: { pregaoCode: number; number: string; year: string; uasg: string } | null;
  };
  balance: Balance;
};

export type AtaBalanceReportData = ReturnType<typeof buildAtaBalanceReportData>;

function number(value: string | { toString(): string } | null | undefined) {
  const parsed = Number(value?.toString() ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toFixed(2);
}

function percentage(value: number, total: number) {
  return total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
}

type ReportItem = AtaBalanceReportSourceItem;

function ataStatus(ata: ReportItem["ata"], referenceTime: Date) {
  if (!ata.isActive) return "INACTIVE" as const;
  if (ata.validUntil && ata.validUntil.getTime() < referenceTime.getTime()) return "EXPIRED" as const;
  if (ata.validFrom && ata.validFrom.getTime() > referenceTime.getTime()) return "UPCOMING" as const;
  return "ACTIVE" as const;
}

function itemStatus(item: ReportItem) {
  if (!item.isActive) return "INACTIVE" as const;
  const available = number(item.balance.availableQuantity);
  if (available <= 0) return "EXHAUSTED" as const;
  const initial = number(item.balance.initialQuantity);
  if (initial > 0 && available / initial <= 0.1) return "LOW" as const;
  return "AVAILABLE" as const;
}

function groupAmounts<T>(
  items: ReportItem[],
  key: (item: ReportItem) => T,
  label: (key: T) => string,
) {
  const groups = new Map<T, ReportItem[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups].map(([group, values]) => ({
    key: String(group),
    label: label(group),
    itemCount: values.length,
    ataCount: new Set(values.map((item) => item.ata.id)).size,
    totalConsumedAmount: money(values.reduce((sum, item) => sum + number(item.balance.openingConsumedAmount) + number(item.balance.consumedAmount), 0)),
    initialAmount: money(values.reduce((sum, item) => sum + number(item.balance.initialAmount), 0)),
    openingConsumedAmount: money(values.reduce((sum, item) => sum + number(item.balance.openingConsumedAmount), 0)),
    sagepConsumedAmount: money(values.reduce((sum, item) => sum + number(item.balance.consumedAmount), 0)),
    reservedAmount: money(values.reduce((sum, item) => sum + number(item.balance.reservedAmount), 0)),
    availableAmount: money(values.reduce((sum, item) => sum + number(item.balance.availableAmount), 0)),
  }));
}

export function buildAtaBalanceReportData(
  sourceItems: ReportItem[],
  filters: AtaBalanceReportFilters,
  generatedBy: string,
  generatedAt = new Date(),
) {
  const filteredItems = sourceItems.filter((item) => {
    if (filters.ataType && item.ata.type !== filters.ataType) return false;
    const status = ataStatus(item.ata, generatedAt);
    if (filters.status === "ACTIVE" && status !== "ACTIVE") return false;
    if (filters.status === "EXPIRED" && status !== "EXPIRED") return false;
    if (filters.status === "INACTIVE" && status !== "INACTIVE") return false;
    return true;
  });
  const uniqueAtas = new Map(filteredItems.map((item) => [item.ata.id, item.ata]));
  const atas = [...uniqueAtas.values()];
  const initialAmount = filteredItems.reduce((sum, item) => sum + number(item.balance.initialAmount), 0);
  const openingConsumedAmount = filteredItems.reduce((sum, item) => sum + number(item.balance.openingConsumedAmount), 0);
  const sagepConsumedAmount = filteredItems.reduce((sum, item) => sum + number(item.balance.consumedAmount), 0);
  const reservedAmount = filteredItems.reduce((sum, item) => sum + number(item.balance.reservedAmount), 0);
  const availableAmount = filteredItems.reduce((sum, item) => sum + number(item.balance.availableAmount), 0);
  const totalConsumedAmount = openingConsumedAmount + sagepConsumedAmount;
  const committedAmount = totalConsumedAmount + reservedAmount;
  const snapshots = filteredItems.flatMap((item) => item.externalBalanceSnapshot ? [item.externalBalanceSnapshot] : []);
  const lastSnapshotAt = snapshots.reduce<Date | null>(
    (latest, snapshot) => !latest || snapshot.checkedAt > latest ? snapshot.checkedAt : latest,
    null,
  );
  const detail = filteredItems.map((item) => ({
    id: item.id,
    ataItemCode: item.ataItemCode,
    referenceCode: item.referenceCode,
    description: item.description,
    unit: item.unit,
    unitPrice: item.unitPrice.toString(),
    coverageGroup: item.coverageGroup,
    ata: {
      ...item.ata,
      status: ataStatus(item.ata, generatedAt),
    },
    balance: item.balance,
    status: itemStatus(item),
    openingBalanceAppliedAt: item.openingBalanceAppliedAt,
    openingBalanceCheckedAt: item.openingBalanceCheckedAt,
    openingBalanceReason: item.openingBalanceReason,
    snapshot: item.externalBalanceSnapshot ? {
      managerAvailableQuantity: item.externalBalanceSnapshot.managerAvailableQuantity?.toString() ?? null,
      checkedAt: item.externalBalanceSnapshot.checkedAt,
      sourceUrl: item.externalBalanceSnapshot.sourceUrl,
    } : null,
  }));
  const byAta = groupAmounts(filteredItems, (item) => item.ata.id, (id) => {
    const ata = uniqueAtas.get(id)!;
    return `ATA ${ata.number} - ${ata.vendorName}`;
  }).map((entry) => ({
    ...entry,
    ata: {
      ...uniqueAtas.get(entry.key)!,
      status: ataStatus(uniqueAtas.get(entry.key)!, generatedAt),
    },
  })).sort((a, b) => number(b.initialAmount) - number(a.initialAmount));
  const byType = groupAmounts(filteredItems, (item) => item.ata.type, (type) => type === "CFTV" ? "CFTV" : "Fibra óptica / ponto lógico")
    .sort((a, b) => number(b.initialAmount) - number(a.initialAmount));
  const vendorKey = (item: ReportItem) => item.ata.vendorCnpj?.replace(/\D/g, "") || item.ata.vendorName.trim().toLocaleUpperCase("pt-BR");
  const vendorNames = new Map(filteredItems.map((item) => [vendorKey(item), item.ata.vendorName]));
  const byVendor = groupAmounts(filteredItems, vendorKey, (key) => vendorNames.get(key)!)
    .sort((a, b) => number(b.totalConsumedAmount) - number(a.totalConsumedAmount) || a.label.localeCompare(b.label));
  const criticalItems = detail.filter((item) => item.status === "EXHAUSTED" || item.status === "LOW")
    .sort((a, b) => number(a.balance.availableAmount) - number(b.balance.availableAmount));

  return {
    generatedAt: generatedAt.toISOString(),
    generatedBy,
    filters,
    summary: {
      ataCount: atas.length,
      activeAtaCount: atas.filter((ata) => ataStatus(ata, generatedAt) === "ACTIVE").length,
      itemCount: filteredItems.length,
      activeItemCount: filteredItems.filter((item) => item.isActive).length,
      snapshotItemCount: snapshots.length,
      openingAppliedItemCount: filteredItems.filter((item) => item.openingBalanceAppliedAt).length,
      lowStockItemCount: detail.filter((item) => item.status === "LOW").length,
      exhaustedItemCount: detail.filter((item) => item.status === "EXHAUSTED").length,
      initialAmount: money(initialAmount),
      openingConsumedAmount: money(openingConsumedAmount),
      sagepConsumedAmount: money(sagepConsumedAmount),
      totalConsumedAmount: money(totalConsumedAmount),
      reservedAmount: money(reservedAmount),
      committedAmount: money(committedAmount),
      availableAmount: money(availableAmount),
      utilizationPercent: percentage(committedAmount, initialAmount),
      availablePercent: percentage(availableAmount, initialAmount),
      snapshotCoveragePercent: percentage(snapshots.length, filteredItems.length),
      openingCoveragePercent: percentage(filteredItems.filter((item) => item.openingBalanceAppliedAt).length, filteredItems.length),
      lastSnapshotAt: lastSnapshotAt?.toISOString() ?? null,
    },
    charts: { byType, byVendor },
    atas: byAta,
    criticalItems,
    items: detail.sort((a, b) => a.ata.ataCode - b.ata.ataCode || a.ataItemCode - b.ataItemCode),
  };
}

export class AtaBalanceReportService {
  private async logoDataUrl() {
    const currentFile = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(currentFile), "../../..");
    const file = await fs.readFile(path.resolve(projectRoot, "src/assets/logos/cta-logo.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  }

  async getReport(filters: AtaBalanceReportFilters, user: ReportUser) {
    const items = await prisma.ataItem.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        ataItemCode: true,
        referenceCode: true,
        description: true,
        unit: true,
        unitPrice: true,
        initialQuantity: true,
        openingConsumedQuantity: true,
        openingBalanceAppliedAt: true,
        openingBalanceCheckedAt: true,
        openingBalanceReason: true,
        isActive: true,
        deletedAt: true,
        coverageGroup: { select: { code: true, name: true } },
        externalBalanceSnapshot: {
          select: { managerAvailableQuantity: true, checkedAt: true, sourceUrl: true },
        },
        ata: {
          select: {
            id: true,
            ataCode: true,
            number: true,
            type: true,
            vendorName: true,
            vendorCnpj: true,
            isActive: true,
            validFrom: true,
            validUntil: true,
            pregao: { select: { pregaoCode: true, number: true, year: true, uasg: true } },
          },
        },
      },
      orderBy: [{ ata: { ataCode: "asc" } }, { ataItemCode: "asc" }],
    });
    const enriched = await ataItemBalanceService.enrichAtaItemsWithBalance(items);
    const generatedBy = [user.rank, user.warName].filter(Boolean).join(" ") || user.name;
    return buildAtaBalanceReportData(enriched as ReportItem[], filters, generatedBy);
  }

  async generateHtml(filters: AtaBalanceReportFilters, user: ReportUser) {
    const [report, ctaLogo] = await Promise.all([this.getReport(filters, user), this.logoDataUrl()]);
    return renderAtaBalanceReportHtml({ ...report, branding: { ctaLogo } });
  }

  async generatePdf(filters: AtaBalanceReportFilters, user: ReportUser) {
    return pdfService.renderPdf({
      label: "ata-balance-position-report",
      buildHtml: () => this.generateHtml(filters, user),
      pdfOptions: {
        format: "A4",
        landscape: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `
          <div style="width:100%;padding:0 10mm;color:#737b6c;font-family:Arial,sans-serif;font-size:7px;display:flex;justify-content:space-between;">
            <span>SAGEP - Relatório de Posição das ATAs e Saldos</span>
            <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
          </div>
        `,
        margin: { top: "9mm", right: "9mm", bottom: "14mm", left: "9mm" },
      },
    });
  }
}

export const ataBalanceReportService = new AtaBalanceReportService();
