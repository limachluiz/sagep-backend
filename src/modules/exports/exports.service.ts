import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { workflowService } from "../workflow/workflow.service.js";

type CurrentUser = {
  id: string;
  role: string;
};

type ProjectExportFilters = {
  code?: number;
  status?: "PLANEJAMENTO" | "EM_ANDAMENTO" | "PAUSADO" | "CONCLUIDO" | "CANCELADO";
  stage?:
    | "ESTIMATIVA_PRECO"
    | "AGUARDANDO_NOTA_CREDITO"
    | "DIEX_REQUISITORIO"
    | "AGUARDANDO_NOTA_EMPENHO"
    | "OS_LIBERADA"
    | "SERVICO_EM_EXECUCAO"
    | "ANALISANDO_AS_BUILT"
    | "ATESTAR_NF"
    | "SERVICO_CONCLUIDO"
    | "CANCELADO";
  search?: string;
};

export class ExportsService {
  private isPrivileged(role: string) {
    return role === "ADMIN" || role === "GESTOR";
  }

  private buildProjectWhere(filters: ProjectExportFilters, user: CurrentUser) {
    const andConditions: Prisma.ProjectWhereInput[] = [];

    if (!this.isPrivileged(user.role)) {
      andConditions.push({
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      });
    }

    if (filters.code) {
      andConditions.push({ projectCode: filters.code });
    }

    if (filters.status) {
      andConditions.push({ status: filters.status });
    }

    if (filters.stage) {
      andConditions.push({ stage: filters.stage });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          { title: { contains: filters.search, mode: "insensitive" } },
          { description: { contains: filters.search, mode: "insensitive" } },
        ],
      });
    }

    return andConditions.length > 0 ? { AND: andConditions } : undefined;
  }

  async exportProjectsXlsx(filters: ProjectExportFilters, user: CurrentUser) {
    const projects = await prisma.project.findMany({
      where: this.buildProjectWhere(filters, user),
      select: {
        id: true,
        projectCode: true,
        title: true,
        status: true,
        stage: true,
        startDate: true,
        endDate: true,
        creditNoteNumber: true,
        creditNoteReceivedAt: true,
        diexNumber: true,
        diexIssuedAt: true,
        commitmentNoteNumber: true,
        commitmentNoteReceivedAt: true,
        serviceOrderNumber: true,
        serviceOrderIssuedAt: true,
        executionStartedAt: true,
        asBuiltReceivedAt: true,
        invoiceAttestedAt: true,
        serviceCompletedAt: true,
        updatedAt: true,
        owner: {
          select: {
            name: true,
          },
        },
        estimates: {
          select: {
            status: true,
            omName: true,
            destinationCityName: true,
            destinationStateUf: true,
            totalAmount: true,
            createdAt: true,
            ata: {
              select: {
                type: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        diexRequests: {
          select: {
            diexNumber: true,
            issuedAt: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
        serviceOrders: {
          select: {
            serviceOrderNumber: true,
            issuedAt: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        projectCode: "asc",
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SAGEP";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Projetos");
    worksheet.columns = [
      { header: "Código do projeto", key: "projectCode", width: 18 },
      { header: "Título", key: "title", width: 36 },
      { header: "Status", key: "status", width: 18 },
      { header: "Etapa", key: "stage", width: 28 },
      { header: "Responsável", key: "owner", width: 28 },
      { header: "OM", key: "om", width: 24 },
      { header: "Cidade", key: "city", width: 22 },
      { header: "UF", key: "uf", width: 10 },
      { header: "Tipo de ata", key: "ataType", width: 16 },
      { header: "Valor estimado", key: "estimatedAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "Número do DIEx", key: "diexNumber", width: 22 },
      { header: "Número da OS", key: "serviceOrderNumber", width: 22 },
      { header: "Data de início", key: "startDate", width: 18 },
      { header: "Data de fim", key: "endDate", width: 18 },
      { header: "Próxima ação", key: "nextAction", width: 28 },
      { header: "Última atualização", key: "updatedAt", width: 22 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columns.length },
    };

    for (const project of projects) {
      const primaryEstimate =
        project.estimates.find((estimate) => estimate.status === "FINALIZADA") ??
        project.estimates[0];
      const latestDiex = project.diexRequests[0];
      const latestServiceOrder = project.serviceOrders[0];
      const nextAction = workflowService.getNextAction({
        id: project.id,
        projectCode: project.projectCode,
        stage: project.stage,
        creditNoteNumber: project.creditNoteNumber,
        creditNoteReceivedAt: project.creditNoteReceivedAt,
        diexNumber: project.diexNumber,
        diexIssuedAt: project.diexIssuedAt,
        commitmentNoteNumber: project.commitmentNoteNumber,
        commitmentNoteReceivedAt: project.commitmentNoteReceivedAt,
        serviceOrderNumber: project.serviceOrderNumber,
        serviceOrderIssuedAt: project.serviceOrderIssuedAt,
        executionStartedAt: project.executionStartedAt,
        asBuiltReceivedAt: project.asBuiltReceivedAt,
        invoiceAttestedAt: project.invoiceAttestedAt,
        serviceCompletedAt: project.serviceCompletedAt,
      });

      worksheet.addRow({
        projectCode: `PRJ-${project.projectCode}`,
        title: project.title,
        status: project.status,
        stage: project.stage,
        owner: project.owner.name,
        om: primaryEstimate?.omName ?? "",
        city: primaryEstimate?.destinationCityName ?? "",
        uf: primaryEstimate?.destinationStateUf ?? "",
        ataType: primaryEstimate?.ata.type ?? "",
        estimatedAmount: primaryEstimate ? Number(primaryEstimate.totalAmount) : 0,
        diexNumber: project.diexNumber ?? latestDiex?.diexNumber ?? "",
        serviceOrderNumber:
          project.serviceOrderNumber ?? latestServiceOrder?.serviceOrderNumber ?? "",
        startDate: project.startDate ?? "",
        endDate: project.endDate ?? "",
        nextAction: nextAction.label,
        updatedAt: project.updatedAt,
      });
    }

    worksheet.getColumn("startDate").numFmt = "dd/mm/yyyy";
    worksheet.getColumn("endDate").numFmt = "dd/mm/yyyy";
    worksheet.getColumn("updatedAt").numFmt = "dd/mm/yyyy hh:mm";

    return workbook;
  }
}
