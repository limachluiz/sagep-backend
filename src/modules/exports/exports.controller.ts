import { Request, Response } from "express";
import { listProjectsQuerySchema } from "../projects/projects.schemas.js";
import { ExportsService } from "./exports.service.js";

const exportsService = new ExportsService();

export class ExportsController {
  async projectsXlsx(req: Request, res: Response) {
    const filters = listProjectsQuerySchema.parse(req.query);
    const workbook = await exportsService.exportProjectsXlsx(filters, req.user!);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="projetos-sagep-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    return res.end();
  }
}
