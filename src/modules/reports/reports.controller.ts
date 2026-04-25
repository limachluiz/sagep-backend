import { Request, Response } from "express";
import { projectIdParamSchema } from "../projects/projects.schemas.js";
import { ReportsService } from "./reports.service.js";

const reportsService = new ReportsService();

export class ReportsController {
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
