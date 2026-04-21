import puppeteer from "puppeteer";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { renderServiceOrderDocumentHtml } from "./service-order-document.template.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

export class ServiceOrderDocumentService {
  private isPrivileged(role: string) {
    return role === "ADMIN" || role === "GESTOR";
  }

  private async ensureCanViewServiceOrder(serviceOrderId: string, user: CurrentUser) {
    const serviceOrder = await prisma.serviceOrder.findUnique({
      where: { id: serviceOrderId },
      select: {
        id: true,
        project: {
          select: {
            ownerId: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!serviceOrder) {
      throw new AppError("OS não encontrada", 404);
    }

    if (this.isPrivileged(user.role)) {
      return;
    }

    const isOwner = serviceOrder.project.ownerId === user.id;
    const isMember = serviceOrder.project.members.some((member) => member.userId === user.id);

    if (!isOwner && !isMember) {
      throw new AppError("Você não tem acesso a esta OS", 403);
    }
  }

  async getServiceOrderDocumentData(serviceOrderId: string, user: CurrentUser) {
    await this.ensureCanViewServiceOrder(serviceOrderId, user);

    const serviceOrder = await prisma.serviceOrder.findUnique({
      where: { id: serviceOrderId },
      select: {
        id: true,
        serviceOrderCode: true,
        serviceOrderNumber: true,
        issuedAt: true,
        contractorName: true,
        contractorCnpj: true,
        commitmentNoteNumber: true,
        requesterName: true,
        requesterRank: true,
        requesterRole: true,
        issuingOrganization: true,
        isEmergency: true,
        plannedStartDate: true,
        plannedEndDate: true,
        notes: true,
        totalAmount: true,
        requestingArea: true,
        projectDisplayName: true,
        projectAcronym: true,
        contractNumber: true,
        executionLocation: true,
        executionHours: true,
        contactName: true,
        contactPhone: true,
        contactExtension: true,
        contractTotalTerm: true,
        originProcess: true,
        requesterCpf: true,
        contractorRepresentativeName: true,
        contractorRepresentativeRole: true,
        items: {
          select: {
            itemCode: true,
            description: true,
            supplyUnit: true,
            quantityOrdered: true,
            unitPrice: true,
            totalPrice: true,
          },
          orderBy: {
            serviceOrderItemCode: "asc",
          },
        },
        scheduleItems: {
          select: {
            orderIndex: true,
            taskStep: true,
            scheduleText: true,
          },
          orderBy: {
            orderIndex: "asc",
          },
        },
        deliveredDocuments: {
          select: {
            description: true,
            isChecked: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!serviceOrder) {
      throw new AppError("OS não encontrada", 404);
    }

    return serviceOrder;
  }

  async generateServiceOrderHtml(serviceOrderId: string, user: CurrentUser) {
    const [data, images] = await Promise.all([
      this.getServiceOrderDocumentData(serviceOrderId, user),
      this.getImages(),
    ]);

    return renderServiceOrderDocumentHtml({
      ...data,
      images,
      issuedAt: data.issuedAt.toISOString(),
      plannedStartDate: data.plannedStartDate?.toISOString() ?? null,
      plannedEndDate: data.plannedEndDate?.toISOString() ?? null,
      totalAmount: data.totalAmount.toString(),
      items: data.items.map((item) => ({
        ...item,
        quantityOrdered: item.quantityOrdered.toString(),
        unitPrice: item.unitPrice.toString(),
        totalPrice: item.totalPrice.toString(),
      })),
    });
  }

  async generateServiceOrderPdf(serviceOrderId: string, user: CurrentUser) {
    const html = await this.generateServiceOrderHtml(serviceOrderId, user);

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
          top: "10mm",
          right: "9mm",
          bottom: "12mm",
          left: "9mm",
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
  
  private async fileToDataUrl(relativePath: string) {
    const absolutePath = path.resolve(projectRoot, relativePath);
    const fileBuffer = await fs.readFile(absolutePath);
    const base64 = fileBuffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  }

  private async getImages() {
    return {
      brasao: await this.fileToDataUrl("src/assets/img/brasao.png"),
    };
  }
}