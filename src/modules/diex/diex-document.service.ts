import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { pdfService } from "../../shared/pdf.service.js";
import { renderDiexDocumentHtml } from "./diex-document.template.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { permissionsService } from "../permissions/permissions.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

type CurrentUser = {
  id: string;
  email: string;
  role: string;
  permissions?: string[];
};

export class DiexDocumentService {
  private isPrivileged(user: CurrentUser) {
    return permissionsService.hasPermission(user, "projects.view_all");
  }

  private async ensureCanViewDiex(diexId: string, user: CurrentUser) {
    const diex = await prisma.diexRequest.findUnique({
      where: { id: diexId },
      select: {
        id: true,
        archivedAt: true,
        deletedAt: true,
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

    if (!diex || diex.deletedAt || diex.archivedAt) {
      throw new AppError("DIEx não encontrado", 404);
    }

    if (this.isPrivileged(user)) {
      return;
    }

    const isOwner = diex.project.ownerId === user.id;
    const isMember = diex.project.members.some((member) => member.userId === user.id);

    if (!isOwner && !isMember) {
      throw new AppError("Você não tem acesso a este DIEx", 403);
    }
  }

  async getDiexDocumentData(diexId: string, user: CurrentUser) {
    await this.ensureCanViewDiex(diexId, user);

    const diex = await prisma.diexRequest.findUnique({
      where: { id: diexId },
      select: {
        id: true,
        archivedAt: true,
        deletedAt: true,
        diexCode: true,
        diexNumber: true,
        issuedAt: true,
        issuingOrganization: true,
        commandName: true,
        pregaoNumber: true,
        uasg: true,
        supplierName: true,
        supplierCnpj: true,
        requesterName: true,
        requesterRank: true,
        requesterRole: true,
        notes: true,
        totalAmount: true,
        project: {
          select: {
            projectCode: true,
            title: true,
            description: true,
          },
        },
        estimate: {
          select: {
            estimateCode: true,
            omName: true,
            destinationCityName: true,
            destinationStateUf: true,
            om: {
              select: {
                omCode: true,
                sigla: true,
                name: true,
                cityName: true,
                stateUf: true,
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
          },
        },
        items: {
          select: {
            diexItemCode: true,
            itemCode: true,
            description: true,
            supplyUnit: true,
            quantityRequested: true,
            unitPrice: true,
            totalPrice: true,
            notes: true,
          },
          orderBy: {
            diexItemCode: "asc",
          },
        },
      },
    });

    if (!diex) {
      throw new AppError("DIEx não encontrado", 404);
    }

    if (!diex.diexNumber || !diex.issuedAt) {
      throw new AppError(
        "O documento do DIEx só pode ser gerado após o preenchimento do número e da data pela SALC",
        409
      );
    }

    if (!diex || diex.deletedAt || diex.archivedAt) {
      throw new AppError("DIEx não encontrado", 404);
    }

    return diex;
  }

  async generateDiexHtml(diexId: string, user: CurrentUser) {
    const [data, images] = await Promise.all([
      this.getDiexDocumentData(diexId, user),
      this.getImages(),
    ]);

    return renderDiexDocumentHtml({
      ...data,
      images,
      issuedAt: data.issuedAt?.toISOString() ?? null,
      totalAmount: data.totalAmount.toString(),
      items: data.items.map((item) => ({
        ...item,
        quantityRequested: item.quantityRequested.toString(),
        unitPrice: item.unitPrice.toString(),
        totalPrice: item.totalPrice.toString(),
      })),
    });
  }

  async generateDiexPdf(diexId: string, user: CurrentUser) {
    return pdfService.renderPdf({
      label: `diex:${diexId}`,
      buildHtml: () => this.generateDiexHtml(diexId, user),
      pdfOptions: {
        format: "A4",
        landscape: false,
        printBackground: true,
        margin: {
          top: "10mm",
          right: "8mm",
          bottom: "10mm",
          left: "8mm",
        },
      },
    });
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
      selo: await this.fileToDataUrl("src/assets/img/selo.png"),
    };
  }
}
