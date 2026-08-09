import { describe, expect, it } from "vitest";
import { renderConsolidatedProjectsReportHtml } from "../src/modules/reports/consolidated-projects-report.template.js";

const report = {
  branding: { ctaLogo: "data:image/png;base64,dGVzdGU=" },
  generatedAt: "2026-08-09T14:00:00.000Z",
  generatedBy: { displayName: "2º Ten Luiz" },
  filter: {
    scope: "Visão geral da Seção de Projetos",
    label: "Visão geral acumulada",
    staleDays: 15,
  },
  summary: {
    projectsOpen: 2,
    projectsInExecution: 1,
    projectsCompleted: 1,
    projectsCritical: 1,
    projectsWarning: 0,
    totalInProgressAmount: "100000.00",
    totalCommittedAmount: "80000.00",
    totalOrderedAmount: "75000.00",
    totalCompletedAmount: "30000.00",
    totalPortfolioAmount: "130000.00",
    totalUncommittedAmount: "50000.00",
    commitmentRate: 61.5,
  },
  operationalSummary: {
    openTasks: 4,
    overdueTasks: 1,
    overdueProjects: 1,
    staleProjects: 0,
    projectsWithoutOpenTasks: 0,
  },
  charts: {
    byStage: [{ label: "SERVICO_EM_EXECUCAO", count: 1, percentage: 50 }],
    byRegion: [{ label: "AM", count: 2, totalAmount: "100000.00", percentage: 100 }],
    byOwner: [{ label: "2º Ten Luiz", count: 2, critical: 1, overdueTasks: 1 }],
    byType: [{ label: "CFTV", count: 2, totalAmount: "130000.00" }],
  },
  commandAttention: [{
    projectCode: 12,
    title: "Modernização de CFTV",
    stage: "SERVICO_EM_EXECUCAO",
    om: { sigla: "4º CTA" },
    attention: { level: "CRITICAL", label: "Prazo vencido" },
  }],
  projects: [{
    projectCode: 12,
    title: "Modernização de CFTV",
    projectType: "CFTV",
    stage: "SERVICO_EM_EXECUCAO",
    estimatedAmount: "100000.00",
    committedAmount: "80000.00",
    orderedAmount: "75000.00",
    om: { sigla: "4º CTA" },
    owner: { displayName: "2º Ten Luiz" },
    dates: { plannedEndDate: "2026-08-01T00:00:00.000Z" },
    tasks: { open: 4, overdue: 1 },
    nextAction: { label: "Receber As-Built" },
    attention: { level: "CRITICAL", label: "Prazo vencido" },
  }],
};

describe("consolidated projects report template", () => {
  it.each([
    ["executive", "Relatório Executivo", "Pontos que demandam decisão do Comando"],
    ["operational", "Relatório Operacional", "Fila prioritária da Seção de Projetos"],
    ["financial", "Relatório Financeiro", "Saldo não empenhado"],
  ] as const)("renders the %s purpose with tailored information", (reportType, title, expected) => {
    const html = renderConsolidatedProjectsReportHtml({ ...report, reportType });

    expect(html).toContain(title);
    expect(html).toContain(expected);
    expect(html).toContain("PRJ-12");
    expect(html).toContain("Modernização de CFTV");
    expect(html).toContain('alt="Brasão do 4º CTA"');
    expect(html).not.toContain("COMANDO MILITAR DA AMAZÔNIA");
  });
});
