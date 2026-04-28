import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { permissionsService } from "../permissions/permissions.service.js";
import { renderEstimateDocumentHtml } from "./estimate-document.template.js";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

export class EstimateDocumentService {
  private isPrivileged(role: string) {
    return permissionsService.hasPermission({ role }, "estimates.view_all");
  }

  private async fileToDataUrl(relativePath: string) {
    const absolutePath = path.resolve(projectRoot, relativePath);
    const fileBuffer = await fs.readFile(absolutePath);
    const base64 = fileBuffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  }

  private async getLogos() {
    return {
      citex: await this.fileToDataUrl("src/assets/logos/citex-logo.png"),
      cta: await this.fileToDataUrl("src/assets/logos/cta-logo.png"),
    };
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
            description: true,
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
        om: {
          select: {
            omCode: true,
            sigla: true,
            name: true,
            cityName: true,
            stateUf: true,
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
    const [data, logos] = await Promise.all([
      this.getEstimateDocumentData(estimateId, user),
      this.getLogos(),
    ]);

    return renderEstimateDocumentHtml({
      ...data,
      logos,
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
        landscape: true,
        printBackground: true,
        margin: {
          top: "8mm",
          right: "8mm",
          bottom: "8mm",
          left: "8mm",
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
