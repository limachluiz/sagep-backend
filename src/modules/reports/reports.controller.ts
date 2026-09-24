import { Request, Response } from "express";
import { z } from "zod";
import { dashboardExecutiveQuerySchema } from "../dashboard/dashboard.schemas.js";
import { projectIdParamSchema } from "../projects/projects.schemas.js";
import { ReportsService } from "./reports.service.js";
import { DeliveryReportService } from "./delivery-report.service.js";
import { ataBalanceReportService } from "./ata-balance-report.service.js";
import { commitmentNoteReportQuerySchema } from "./commitment-note-report.schemas.js";
import { commitmentNoteReportService } from "./commitment-note-report.service.js";

const reportsService = new ReportsService();
const deliveryReportService = new DeliveryReportService();

export class ReportsController {
  async commitmentNotesReport(req: Request, res: Response) {
    const report = await commitmentNoteReportService.getReport(commitmentNoteReportQuerySchema.parse(req.query), req.user!);
    const { branding: _branding, ...payload } = report;
    return res.status(200).json(payload);
  }

  async commitmentNotesReportPdf(req: Request, res: Response) {
    const filters = commitmentNoteReportQuerySchema.parse(req.query);
    const pdf = await commitmentNoteReportService.generatePdf(filters, req.user!);
    const suffix = filters.codes.length === 1 ? filters.codes[0].slice(15) : new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="relatorio-notas-empenho-${suffix}.pdf"`);
    return res.status(200).send(pdf);
  }

  async commitmentNotesReportXlsx(req: Request, res: Response) {
    const workbook = await commitmentNoteReportService.generateXlsx(commitmentNoteReportQuerySchema.parse(req.query), req.user!);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="notas-empenho-sagep-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    return res.end();
  }

  async ataBalancePositionPdf(req: Request, res: Response) {
    const filters = {
      ataType: z.enum(["CFTV", "FIBRA_OPTICA"]).optional().parse(req.query.ataType),
      status: z
        .enum(["ALL", "ACTIVE", "EXPIRED", "INACTIVE"])
        .default("ALL")
        .parse(req.query.status),
      pregaoId: z.string().trim().min(1).max(100).optional().parse(req.query.pregaoId),
      ataId: z.string().trim().min(1).max(100).optional().parse(req.query.ataId),
    };
    const pdf = await ataBalanceReportService.generatePdf(filters, req.user!);
    const date = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="relatorio-posicao-atas-saldos-${date}.pdf"`,
    );
    return res.status(200).send(pdf);
  }

  async deliveryReportPdf(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const result = await deliveryReportService.generate(id, req.user!);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="relatorio-entrega-PRJ-${result.projectCode}.pdf"`);
    return res.status(200).send(result.pdf);
  }
  async viewDeliveryReportPdf(req: Request, res: Response) {
    const { id } = projectIdParamSchema.parse(req.params);
    const result = await deliveryReportService.view(id, req.user!);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="relatorio-entrega-PRJ-${result.projectCode}.pdf"`);
    return res.status(200).send(result.pdf);
  }
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
