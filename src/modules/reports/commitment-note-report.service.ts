import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { pdfService } from "../../shared/pdf.service.js";
import { financialExecutionService } from "../financial-execution/financial-execution.service.js";
import type { CommitmentNoteReportFilters } from "./commitment-note-report.schemas.js";
import { renderCommitmentNoteReportHtml } from "./commitment-note-report.template.js";

type ReportUser = { id: string; name: string; email: string; role: string; rank?: string | null; warName?: string | null; permissions?: string[] };
type Portfolio = Awaited<ReturnType<typeof financialExecutionService.portfolio>>;
type PortfolioRow = Portfolio["rows"][number];
type Json = Record<string, unknown>;

export type CommitmentNoteReportDocument = {
  externalCode: string;
  number: string;
  phase: string;
  species: string | null;
  issuedAt: Date | string | null;
  amount: number | null;
};

export type CommitmentNoteReportRow = PortfolioRow & { documents: CommitmentNoteReportDocument[] };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

function normalized(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function parseDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const source = String(value).trim();
  const br = source.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const parsed = br ? new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00Z`) : new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function money(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const source = value.replace(/R\$|\s/gi, "");
  const parsed = Number(source.includes(",") ? source.replace(/\./g, "").replace(",", ".") : source);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueOf(root: Json, keys: string[]) {
  for (const key of keys) if (root[key] !== undefined && root[key] !== null) return root[key];
  return null;
}

function reportDocument(raw: unknown): CommitmentNoteReportDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Json;
  const externalCode = String(valueOf(source, ["externalCode", "documento", "codigoDocumento", "codigo", "code"]) ?? "");
  const number = String(valueOf(source, ["number", "documentoResumido", "numero"]) ?? externalCode.slice(15));
  const type = externalCode.match(/(NS|OB|DR|DF)\d{6}$/)?.[1];
  const rawPhase = valueOf(source, ["phase", "fase"]);
  const phase = rawPhase === 2 || rawPhase === "2" ? "Liquidação" : rawPhase === 3 || rawPhase === "3" ? "Pagamento" : String(rawPhase ?? (type === "NS" ? "Liquidação" : type ? "Pagamento" : "Outro"));
  return {
    externalCode,
    number,
    phase,
    species: valueOf(source, ["species", "especie"]) ? String(valueOf(source, ["species", "especie"])) : null,
    issuedAt: valueOf(source, ["issuedAt", "data", "dataEmissao"]) as string | Date | null,
    amount: money(valueOf(source, ["amount", "valor", "valorDocumento"])),
  };
}

export function filterCommitmentNoteReportRows(rows: PortfolioRow[], filters: CommitmentNoteReportFilters) {
  const selected = new Set(filters.codes);
  const from = filters.issuedFrom ? new Date(`${filters.issuedFrom}T00:00:00Z`) : null;
  const to = filters.issuedTo ? new Date(`${filters.issuedTo}T23:59:59.999Z`) : null;
  const query = normalized(filters.search);
  return rows.filter((row) => {
    if (selected.size && !selected.has(row.externalCode)) return false;
    if (filters.supplier && row.supplierName !== filters.supplier) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.origin && row.origin !== filters.origin) return false;
    if (filters.managementUnit && row.managementUnit !== filters.managementUnit) return false;
    const issuedAt = parseDate(row.issuedAt);
    if (from && (!issuedAt || issuedAt < from)) return false;
    if (to && (!issuedAt || issuedAt > to)) return false;
    if (query && !normalized(`${row.number} ${row.externalCode} ${row.supplierName} ${row.supplierCnpj ?? ""} ${row.managementUnit} ${row.project?.title ?? ""}`).includes(query)) return false;
    return true;
  }).sort((a, b) => b.externalCode.localeCompare(a.externalCode, "pt-BR"));
}

function summarize(rows: PortfolioRow[]) {
  const totals = rows.reduce((result, row) => {
    if (!row.inconsistent) {
      result.committed += row.current ?? 0;
      result.liquidated += row.liquidated ?? 0;
      result.paid += row.paid ?? 0;
      if (row.current !== null) result.coverage.committed++;
      if (row.liquidated !== null) result.coverage.liquidated++;
      if (row.paid !== null) result.coverage.paid++;
    }
    if (row.inconsistent || row.incomplete) result.pending++;
    return result;
  }, { total: rows.length, committed: 0, liquidated: 0, paid: 0, pending: 0, coverage: { committed: 0, liquidated: 0, paid: 0 } });
  totals.committed = Math.round(totals.committed * 100) / 100;
  totals.liquidated = Math.round(totals.liquidated * 100) / 100;
  totals.paid = Math.round(totals.paid * 100) / 100;
  return totals;
}

function chart(rows: PortfolioRow[], key: (row: PortfolioRow) => string) {
  const grouped = new Map<string, { label: string; value: number; amount: number }>();
  for (const row of rows) {
    const label = key(row) || "Não informado";
    const current = grouped.get(label) ?? { label, value: 0, amount: 0 };
    current.value++;
    if (!row.inconsistent) current.amount += row.current ?? 0;
    grouped.set(label, current);
  }
  return [...grouped.values()].map((entry) => ({ ...entry, amount: Math.round(entry.amount * 100) / 100 })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pt-BR"));
}

const statusLabels: Record<string, string> = {
  PAGA: "Paga", LIQUIDADA: "Liquidada", PARCIALMENTE_PAGA: "Parcialmente paga",
  PARCIALMENTE_LIQUIDADA: "Parcialmente liquidada", NAO_LIQUIDADA: "Não liquidada",
  A_CONFERIR: "A conferir", DIVERGENTE: "Divergente", ANULADA: "Anulada",
  PARCIALMENTE_ANULADA: "Parcialmente anulada",
};

function scopeLabel(filters: CommitmentNoteReportFilters, rows: PortfolioRow[]) {
  if (filters.codes.length === 1) return `NE ${rows[0]?.number ?? filters.codes[0].slice(15)}`;
  if (filters.codes.length > 1) return `${filters.codes.length} NEs selecionadas`;
  if (filters.supplier) return `Fornecedor: ${filters.supplier}`;
  if (filters.status) return `Situação: ${statusLabels[filters.status] ?? filters.status}`;
  return "Carteira completa";
}

export type CommitmentNoteReportData = Awaited<ReturnType<CommitmentNoteReportService["getReport"]>>;

export class CommitmentNoteReportService {
  private async ctaLogo() {
    try {
      const file = await fs.readFile(path.resolve(projectRoot, "src/assets/logos/cta-logo.png"));
      return `data:image/png;base64,${file.toString("base64")}`;
    } catch {
      return "";
    }
  }

  private async documents(row: PortfolioRow) {
    const projectNote = await prisma.commitmentNote.findUnique({ where: { externalCode: row.externalCode }, include: { documents: { orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }] } } });
    if (projectNote) return projectNote.documents.map((document) => ({ externalCode: document.externalCode, number: document.number, phase: document.phase, species: document.species, issuedAt: document.issuedAt, amount: Number(document.amount) }));
    const archived = await prisma.discoveredCommitment.findUnique({ where: { externalCode: row.externalCode }, select: { snapshot: true } });
    if (!archived) return [];
    const snapshot = archived.snapshot as { related?: unknown; financial?: { documents?: unknown[] } };
    const related = Array.isArray(snapshot.related) ? snapshot.related : [];
    const financial = Array.isArray(snapshot.financial?.documents) ? snapshot.financial.documents : [];
    const unique = new Map<string, CommitmentNoteReportDocument>();
    for (const raw of [...related, ...financial]) {
      const document = reportDocument(raw);
      if (document) {
        const key = document.externalCode || `${document.number}:${unique.size}`;
        const previous = unique.get(key);
        unique.set(key, previous ? {
          ...previous,
          ...document,
          species: document.species ?? previous.species,
          issuedAt: document.issuedAt ?? previous.issuedAt,
          amount: document.amount ?? previous.amount,
        } : document);
      }
    }
    return [...unique.values()];
  }

  async getReport(filters: CommitmentNoteReportFilters, user: ReportUser) {
    const portfolio = await financialExecutionService.portfolio(user);
    const rows = filterCommitmentNoteReportRows(portfolio.rows, filters);
    const detailedRows: CommitmentNoteReportRow[] = await Promise.all(rows.map(async (row) => ({ ...row, documents: rows.length === 1 ? await this.documents(row) : [] })));
    return {
      generatedAt: new Date(),
      generatedBy: [user.rank, user.warName].filter(Boolean).join(" ") || user.name || user.email,
      filters,
      scopeLabel: scopeLabel(filters, rows),
      summary: summarize(rows),
      charts: { byStatus: chart(rows, (row) => statusLabels[row.status] ?? row.status), bySupplier: chart(rows, (row) => row.supplierName), byOrigin: chart(rows, (row) => row.origin) },
      rows: detailedRows,
      branding: { ctaLogo: await this.ctaLogo() },
    };
  }

  async generatePdf(filters: CommitmentNoteReportFilters, user: ReportUser) {
    return pdfService.renderPdf({
      label: "commitment-note-financial-report",
      buildHtml: async () => renderCommitmentNoteReportHtml(await this.getReport(filters, user)),
      pdfOptions: {
        format: "A4", landscape: true, printBackground: true, displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: '<div style="width:100%;padding:0 10mm;color:#737b6c;font:7px Arial;display:flex;justify-content:space-between"><span>SAGEP · Execução Financeira das Notas de Empenho</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
        margin: { top: "9mm", right: "9mm", bottom: "14mm", left: "9mm" },
      },
    });
  }

  async generateXlsx(filters: CommitmentNoteReportFilters, user: ReportUser) {
    const report = await this.getReport(filters, user);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SAGEP";
    workbook.created = new Date();
    const summary = workbook.addWorksheet("Resumo");
    summary.addRows([["Relatório", "Execução Financeira das Notas de Empenho"], ["Recorte", report.scopeLabel], ["Emitido em", report.generatedAt], ["Quantidade de NEs", report.summary.total], ["Empenhado", report.summary.committed], ["Liquidado", report.summary.liquidated], ["Pago", report.summary.paid], ["A conferir", report.summary.pending]]);
    summary.getColumn(1).width = 24; summary.getColumn(2).width = 42; summary.getColumn(2).numFmt = "#,##0.00"; summary.getRow(1).font = { bold: true };
    const sheet = workbook.addWorksheet("Notas de Empenho");
    sheet.columns = [
      { header: "NE", key: "number", width: 18 }, { header: "Código completo", key: "externalCode", width: 30 }, { header: "UG", key: "managementUnit", width: 10 }, { header: "Origem", key: "origin", width: 14 }, { header: "Fornecedor", key: "supplierName", width: 42 }, { header: "CNPJ", key: "supplierCnpj", width: 20 }, { header: "Emissão", key: "issuedAt", width: 14 }, { header: "Empenhado", key: "current", width: 17 }, { header: "Liquidado", key: "liquidated", width: 17 }, { header: "Pago", key: "paid", width: 17 }, { header: "OB líquido", key: "paidNet", width: 17 }, { header: "DR/DF", key: "deductions", width: 17 }, { header: "Situação", key: "status", width: 24 }, { header: "Projeto", key: "project", width: 38 }, { header: "Última atualização", key: "updatedAt", width: 22 },
    ];
    for (const row of report.rows) sheet.addRow({ ...row, status: statusLabels[row.status] ?? row.status, issuedAt: parseDate(row.issuedAt), project: row.project ? `PRJ-${row.project.projectCode} · ${row.project.title}` : "", updatedAt: parseDate(row.updatedAt) });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF293622" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }]; sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    ["current", "liquidated", "paid", "paidNet", "deductions"].forEach((key) => { sheet.getColumn(key).numFmt = 'R$ #,##0.00'; });
    sheet.getColumn("issuedAt").numFmt = "dd/mm/yyyy"; sheet.getColumn("updatedAt").numFmt = "dd/mm/yyyy hh:mm";
    return workbook;
  }
}

export const commitmentNoteReportService = new CommitmentNoteReportService();
