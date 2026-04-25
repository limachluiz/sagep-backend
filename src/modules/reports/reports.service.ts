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

export class ReportsService {
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
      timelineSummary: details.timeline.slice(0, 15),
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
