import { Request, Response } from "express";
import { z } from "zod";
import { dashboardExecutiveQuerySchema } from "../dashboard/dashboard.schemas.js";
import { projectIdParamSchema } from "../projects/projects.schemas.js";
import { ReportsService } from "./reports.service.js";

const reportsService = new ReportsService();

export class ReportsController {
  private executiveFilters(req: Request) {
    const filters = dashboardExecutiveQuerySchema.parse(req.query);
    const staleDays = z.coerce
      .number()
      .int()
      .positive()
      .max(365)
      .default(15)
      .parse(req.query.staleDays);

    return { ...filters, staleDays };
  }

  async executiveProjectsReport(req: Request, res: Response) {
    const report = await reportsService.getExecutiveProjectsReport(
      this.executiveFilters(req),
      req.user!,
    );
    return res.status(200).json(report);
  }

  async executiveProjectsReportPdf(req: Request, res: Response) {
    const pdf = await reportsService.generateExecutiveProjectsReportPdf(
      this.executiveFilters(req),
      req.user!,
    );

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="relatorio-executivo-projetos-${date}.pdf"`,
    );

    return res.status(200).send(pdf);
  }

  async consolidatedProjectsReportPdf(req: Request, res: Response) {
    const reportType = z
      .enum(["executive", "operational", "financial"])
      .default("executive")
      .parse(req.query.reportType);
    const pdf = await reportsService.generateConsolidatedProjectsReportPdf(
      reportType,
      this.executiveFilters(req),
      req.user!,
    );

    const date = new Date().toISOString().slice(0, 10);
    const reportNames = {
      executive: "executivo",
      operational: "operacional",
      financial: "financeiro",
    } as const;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="relatorio-${reportNames[reportType]}-projetos-${date}.pdf"`,
    );

    return res.status(200).send(pdf);
  }

  async projectDossier(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const dossier = await reportsService.getProjectDossier(id, req.user!);
    return res.status(200).json(dossier);
  }

  async projectDossierPdf(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const pdf = await reportsService.generateProjectDossierPdf(id, req.user!);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="dossier-projeto-${id}.pdf"`);

    return res.status(200).send(pdf);
  }
}
