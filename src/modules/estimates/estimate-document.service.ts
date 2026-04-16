import puppeteer from "puppeteer";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { renderEstimateDocumentHtml } from "./estimate-document.template.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

export class EstimateDocumentService {
  private isPrivileged(role: string) {
    return role === "ADMIN" || role === "GESTOR";
  }

  private async ensureCanViewEstimate(estimateId: string, user: CurrentUser) {
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
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

    if (!estimate) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    if (this.isPrivileged(user.role)) {
      return;
    }

    const isOwner = estimate.project.ownerId === user.id;
    const isMember = estimate.project.members.some((member) => member.userId === user.id);

    if (!isOwner && !isMember) {
      throw new AppError("Você não tem acesso a esta estimativa", 403);
    }
  }

  async getEstimateDocumentData(estimateId: string, user: CurrentUser) {
    await this.ensureCanViewEstimate(estimateId, user);

    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: {
        id: true,
        estimateCode: true,
        createdAt: true,
        status: true,
        omName: true,
        destinationCityName: true,
        destinationStateUf: true,
        notes: true,
        totalAmount: true,
        project: {
          select: {
            projectCode: true,
            title: true,
            stage: true,
          },
        },
        ata: {
          select: {
            ataCode: true,
            number: true,
            type: true,
            vendorName: true,
          },
        },
        coverageGroup: {
          select: {
            code: true,
            name: true,
            description: true,
          },
        },
        items: {
          select: {
            estimateItemCode: true,
            referenceCode: true,
            description: true,
            unit: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            notes: true,
          },
          orderBy: {
            estimateItemCode: "asc",
          },
        },
      },
    });

    if (!estimate) {
      throw new AppError("Estimativa não encontrada", 404);
    }

    return estimate;
  }

  async generateEstimateHtml(estimateId: string, user: CurrentUser) {
    const data = await this.getEstimateDocumentData(estimateId, user);
    return renderEstimateDocumentHtml({
      ...data,
      createdAt: data.createdAt.toISOString(),
      totalAmount: data.totalAmount.toString(),
      items: data.items.map((item) => ({
        ...item,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        subtotal: item.subtotal.toString(),
      })),
    });
  }

  async generateEstimatePdf(estimateId: string, user: CurrentUser) {
    const html = await this.generateEstimateHtml(estimateId, user);

    const browser = await puppeteer.launch({
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdf = await page.pdf({
        format: "A4",
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