import { describe, expect, it } from "vitest";
import { renderExecutiveProjectsReportHtml } from "../src/modules/reports/executive-projects-report.template.js";

describe("executive projects report template", () => {
  it("renders command indicators, charts and ongoing project details", () => {
    const html = renderExecutiveProjectsReportHtml({
      generatedAt: "2026-07-29T20:00:00.000Z",
      generatedBy: {
        displayName: "2º Ten Luiz",
      },
      filter: {
        scope: "Projetos em andamento",
        label: "Visão geral acumulada",
        staleDays: 15,
      },
      summary: {
        projectsOpen: 1,
        projectsInExecution: 1,
        projectsCritical: 1,
        totalEstimatedAmount: "67718.00",
        totalCommittedAmount: "67718.00",
        commitmentRate: 100,
        averageProgress: 80,
      },
      charts: {
        byStage: [
          {
            label: "SERVICO_EM_EXECUCAO",
            count: 1,
            percentage: 100,
          },
        ],
        byRegion: [
          {
            label: "AM",
            count: 1,
            totalAmount: "67718.00",
            percentage: 100,
          },
        ],
        attention: [
          { label: "Críticos", count: 1 },
          { label: "Atenção", count: 0 },
          { label: "Regulares", count: 0 },
        ],
      },
      commandAttention: [
        {
          projectCode: 12,
          title: "Interligação óptica",
          stage: "SERVICO_EM_EXECUCAO",
          om: { sigla: "HGuPV" },
          attention: { level: "CRITICAL", label: "Prazo vencido" },
        },
      ],
      projects: [
        {
          projectCode: 12,
          title: "Interligação óptica",
          projectType: "FIBRA_OPTICA_PONTO_LOGICO",
          stage: "SERVICO_EM_EXECUCAO",
          progress: 80,
          estimatedAmount: "67718.00",
          attention: { level: "CRITICAL", label: "Prazo vencido" },
          om: {
            sigla: "HGuPV",
            cityName: "Porto Velho",
            stateUf: "RO",
          },
          owner: { displayName: "2º Ten Luiz" },
          dates: { plannedEndDate: "2026-07-15T00:00:00.000Z" },
          tasks: { open: 2, overdue: 1 },
          nextAction: { label: "Receber As-Built" },
        },
      ],
    });

    expect(html).toContain("Relatório Executivo de Projetos em Andamento");
    expect(html).toContain("2º Ten Luiz");
    expect(html).toContain("PRJ-12");
    expect(html).toContain("Interligação óptica");
    expect(html).toMatch(/R\$\s67\.718,00/);
    expect(html).toContain("Serviço em execução");
    expect(html).toContain("Prazo vencido");
    expect(html).toContain("conic-gradient");
  });

  it("renders a clear empty state", () => {
    const html = renderExecutiveProjectsReportHtml({
      generatedAt: "2026-07-29T20:00:00.000Z",
      generatedBy: { displayName: "Cel Lima" },
      filter: {
        scope: "Projetos em andamento",
        label: "Visão geral acumulada",
        staleDays: 15,
      },
      summary: {
        projectsOpen: 0,
        projectsInExecution: 0,
        projectsCritical: 0,
        totalEstimatedAmount: "0.00",
        totalCommittedAmount: "0.00",
        commitmentRate: 0,
        averageProgress: 0,
      },
      charts: {
        byStage: [],
        byRegion: [],
        attention: [
          { label: "Críticos", count: 0 },
          { label: "Atenção", count: 0 },
          { label: "Regulares", count: 0 },
        ],
      },
      commandAttention: [],
      projects: [],
    });

    expect(html).toContain("Nenhum projeto em andamento encontrado");
    expect(html).toContain("Nenhuma situação crítica");
  });
});
