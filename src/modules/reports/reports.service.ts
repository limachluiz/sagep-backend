import puppeteer from "puppeteer";
import { ProjectsService } from "../projects/projects.service.js";
import { renderProjectDossierHtml } from "./project-dossier.template.js";

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  rank?: string | null;
  cpf?: string | null;
};

const projectsService = new ProjectsService();

type TimelineSummaryItem = {
  id: string;
  at: Date | string;
  action: string;
  label: string;
  summary: string;
  actorName?: string | null;
  source: "AUDIT" | "FALLBACK";
};

export class ReportsService {
  private inferTimelineCode(item: { action?: string; summary?: string; label?: string }) {
    const text = `${item.action ?? ""} ${item.summary ?? ""} ${item.label ?? ""}`
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

    if (text.includes("criad")) return "PROJETO_CRIADO";
    if (text.includes("estimativa") && text.includes("finaliz")) return "ESTIMATIVA_FINALIZADA";
    if (text.includes("credito")) return "NOTA_CREDITO_RECEBIDA";
    if (text.includes("diex")) return "DIEX_EMITIDO";
    if (text.includes("empenho")) return "NOTA_EMPENHO_INFORMADA";
    if (text.includes("ordem") || text.includes(" os ")) return "OS_EMITIDA";
    if (text.includes("execu")) return "EXECUCAO_INICIADA";
    if (text.includes("as-built") || text.includes("as built")) return "AS_BUILT_RECEBIDO";
    if (text.includes("atest")) return "NF_ATESTADA";
    if (text.includes("conclu")) return "SERVICO_CONCLUIDO";

    return null;
  }

  private buildFallbackTimeline(details: any): TimelineSummaryItem[] {
    const events: TimelineSummaryItem[] = [];
    const add = (
      code: string,
      at: Date | string | null | undefined,
      label: string,
      summary: string,
    ) => {
      if (!at) return;
      events.push({
        id: `fallback:${code}`,
        at,
        action: code,
        label,
        summary,
        actorName: null,
        source: "FALLBACK",
      });
    };

    add(
      "PROJETO_CRIADO",
      details.project.createdAt,
      "Projeto criado",
      `Projeto PRJ-${details.project.projectCode} criado`,
    );

    const finalizedEstimate = [...(details.documents.estimates ?? [])]
      .filter((estimate) => estimate.status === "FINALIZADA")
      .sort(
        (a, b) =>
          new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
      )[0];

    add(
      "ESTIMATIVA_FINALIZADA",
      finalizedEstimate?.createdAt,
      "Estimativa finalizada",
      finalizedEstimate
        ? `Estimativa EST-${finalizedEstimate.estimateCode} finalizada`
        : "Estimativa finalizada",
    );
    add(
      "NOTA_CREDITO_RECEBIDA",
      details.workflow.milestones.creditNoteReceivedAt,
      "Nota de Crédito recebida",
      `Nota de Crédito ${details.workflow.milestones.creditNoteNumber ?? ""} recebida`.trim(),
    );
    add(
      "DIEX_EMITIDO",
      details.workflow.milestones.diexIssuedAt ??
        details.documents.diexRequests?.[0]?.issuedAt ??
        details.documents.diexRequests?.[0]?.createdAt,
      "DIEx emitido",
      `DIEx ${details.workflow.milestones.diexNumber ?? details.documents.diexRequests?.[0]?.diexNumber ?? ""} emitido`.trim(),
    );
    add(
      "NOTA_EMPENHO_INFORMADA",
      details.workflow.milestones.commitmentNoteReceivedAt,
      "Nota de Empenho informada",
      `Nota de Empenho ${details.workflow.milestones.commitmentNoteNumber ?? ""} informada`.trim(),
    );
    add(
      "OS_EMITIDA",
      details.workflow.milestones.serviceOrderIssuedAt ??
        details.documents.serviceOrders?.[0]?.issuedAt ??
        details.documents.serviceOrders?.[0]?.createdAt,
      "Ordem de Serviço emitida",
      `OS ${details.workflow.milestones.serviceOrderNumber ?? details.documents.serviceOrders?.[0]?.serviceOrderNumber ?? ""} emitida`.trim(),
    );
    add(
      "EXECUCAO_INICIADA",
      details.workflow.milestones.executionStartedAt,
      "Execução iniciada",
      "Execução do serviço iniciada",
    );
    add(
      "AS_BUILT_RECEBIDO",
      details.workflow.milestones.asBuiltReceivedAt,
      "As-Built recebido",
      "As-Built recebido para análise",
    );
    add(
      "NF_ATESTADA",
      details.workflow.milestones.invoiceAttestedAt,
      "NF atestada",
      "Nota fiscal atestada",
    );
    add(
      "SERVICO_CONCLUIDO",
      details.workflow.milestones.serviceCompletedAt,
      "Serviço concluído",
      "Serviço concluído",
    );

    return events;
  }

  private buildTimelineSummary(details: any): TimelineSummaryItem[] {
    const relevantAuditEvents = ((details.timeline ?? []) as Array<{
      id: string;
      at: Date | string;
      action?: string;
      label?: string;
      summary?: string;
      actorName?: string | null;
    }>)
      .map((item) => ({
        ...item,
        flowCode: this.inferTimelineCode(item),
      }))
      .filter((item) => item.flowCode)
      .map((item) => ({
        id: item.id,
        at: item.at,
        action: item.flowCode as string,
        label: item.label ?? item.summary ?? item.flowCode ?? "Evento do fluxo",
        summary: item.summary ?? item.label ?? item.flowCode ?? "Evento do fluxo",
        actorName: item.actorName,
        source: "AUDIT" as const,
      }));
    const eventsByCode = new Map<string, TimelineSummaryItem>();

    for (const event of relevantAuditEvents) {
      if (!eventsByCode.has(event.action)) {
        eventsByCode.set(event.action, event);
      }
    }

    for (const event of this.buildFallbackTimeline(details)) {
      if (!eventsByCode.has(event.action)) {
        eventsByCode.set(event.action, event);
      }
    }

    return Array.from(eventsByCode.values())
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(0, 12);
  }

  async getProjectDossier(projectId: string, user: CurrentUser) {
    const details = await projectsService.getDetails(projectId, user);

    return {
      generatedAt: new Date().toISOString(),
      project: details.project,
      workflow: details.workflow,
      pendingActions: details.pendingActions,
      documents: details.documents,
      financialSummary: details.financialSummary,
      operationalSummary: details.operationalSummary,
      timelineSummary: this.buildTimelineSummary(details),
    };
  }

  async generateProjectDossierHtml(projectId: string, user: CurrentUser) {
    const dossier = await this.getProjectDossier(projectId, user);
    return renderProjectDossierHtml(dossier);
  }

  async generateProjectDossierPdf(projectId: string, user: CurrentUser) {
    const html = await this.generateProjectDossierHtml(projectId, user);
    const browser = await puppeteer.launch({
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdf = await page.pdf({
        format: "A4",
        landscape: false,
        printBackground: true,
        margin: {
          top: "12mm",
          right: "10mm",
          bottom: "12mm",
          left: "10mm",
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
