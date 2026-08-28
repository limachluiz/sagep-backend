import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";
import { ComprasGovService } from "../compras-gov/compras-gov.service.js";

type ListFilters = {
  search?: string;
  year?: string;
  uasg?: string;
  type?: "CFTV" | "FIBRA_OPTICA";
  active?: boolean;
};

type UpdateInput = {
  modality?: string;
  object?: string;
  type?: "CFTV" | "FIBRA_OPTICA" | null;
  managingAgency?: string;
  isActive?: boolean;
};

const ataSummarySelect = {
  id: true,
  ataCode: true,
  number: true,
  type: true,
  vendorName: true,
  managingAgency: true,
  validFrom: true,
  validUntil: true,
  isActive: true,
  externalAtaNumber: true,
  externalLastSyncAt: true,
  coverageGroups: {
    select: {
      id: true,
      code: true,
      name: true,
      localities: { select: { id: true, cityName: true, stateUf: true, createdAt: true } },
      createdAt: true,
      description: true,
    },
    orderBy: { code: "asc" },
  },
  _count: { select: { items: true, estimates: true } },
} satisfies Prisma.AtaSelect;

export class PregoesService {
  private async withMetrics<T extends {
    id: string;
    atas: Array<{ id: string; isActive: boolean; vendorName: string }>;
  }>(pregoes: T[]) {
    if (!pregoes.length) return [];
    const items = await prisma.ataItem.findMany({
      where: { ata: { pregaoId: { in: pregoes.map((pregao) => pregao.id) } }, deletedAt: null },
      select: {
        id: true,
        ataId: true,
        unitPrice: true,
        initialQuantity: true,
        isActive: true,
        deletedAt: true,
        ata: { select: { pregaoId: true } },
      },
    });
    const balances = await ataItemBalanceService.getBalanceMapForAtaItems(items);

    return pregoes.map((pregao) => {
      const pregaoItems = items.filter((item) => item.ata.pregaoId === pregao.id);
      const sum = (field: "initialAmount" | "reservedAmount" | "consumedAmount" | "availableAmount") =>
        pregaoItems.reduce((total, item) => total + Number(balances.get(item.id)?.[field] ?? 0), 0).toFixed(2);
      return {
        ...pregao,
        metrics: {
          ataCount: pregao.atas.length,
          activeAtaCount: pregao.atas.filter((ata) => ata.isActive).length,
          supplierCount: new Set(pregao.atas.map((ata) => ata.vendorName)).size,
          itemCount: pregaoItems.length,
          totalAmount: sum("initialAmount"),
          reservedAmount: sum("reservedAmount"),
          consumedAmount: sum("consumedAmount"),
          availableAmount: sum("availableAmount"),
        },
      };
    });
  }

  async list(filters: ListFilters) {
    const where: Prisma.PregaoWhereInput = {
      ...(filters.year && { year: filters.year }),
      ...(filters.uasg && { uasg: { contains: filters.uasg, mode: "insensitive" } }),
      ...(filters.type && { type: filters.type }),
      ...(filters.active !== undefined && { isActive: filters.active }),
      ...(filters.search && {
        OR: [
          { number: { contains: filters.search, mode: "insensitive" } },
          { uasg: { contains: filters.search, mode: "insensitive" } },
          { object: { contains: filters.search, mode: "insensitive" } },
          { managingAgency: { contains: filters.search, mode: "insensitive" } },
          { atas: { some: { vendorName: { contains: filters.search, mode: "insensitive" } } } },
        ],
      }),
    };

    const pregoes = await prisma.pregao.findMany({
      where,
      include: {
        atas: { select: ataSummarySelect, orderBy: [{ number: "asc" }, { ataCode: "asc" }] },
        _count: { select: { atas: true } },
      },
      orderBy: [{ year: "desc" }, { number: "desc" }, { pregaoCode: "desc" }],
    });
    return this.withMetrics(pregoes);
  }

  async findById(id: string) {
    const pregao = await prisma.pregao.findUnique({
      where: { id },
      include: {
        atas: { select: ataSummarySelect, orderBy: [{ number: "asc" }, { ataCode: "asc" }] },
        _count: { select: { atas: true } },
      },
    });
    if (!pregao) throw new AppError("Pregão não encontrado", 404);
    return (await this.withMetrics([pregao]))[0];
  }

  async update(id: string, data: UpdateInput) {
    await this.findById(id);
    const pregao = await prisma.pregao.update({
      where: { id },
      data: {
        ...(data.modality !== undefined && { modality: data.modality.trim() }),
        ...(data.object !== undefined && { object: data.object?.trim() || null }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.managingAgency !== undefined && { managingAgency: data.managingAgency?.trim() || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        atas: { select: ataSummarySelect, orderBy: [{ number: "asc" }, { ataCode: "asc" }] },
        _count: { select: { atas: true } },
      },
    });
    return (await this.withMetrics([pregao]))[0];
  }

  async sync(id: string) {
    const pregao = await prisma.pregao.findUnique({
      where: { id },
      include: {
        atas: {
          where: { externalSource: "COMPRAS_GOV", externalAtaNumber: { not: null } },
          include: { coverageGroups: { include: { localities: true }, orderBy: { createdAt: "asc" } } },
        },
      },
    });
    if (!pregao) throw new AppError("Pregão não encontrado", 404);
    if (!pregao.externalSource || pregao.externalSource !== "COMPRAS_GOV") {
      throw new AppError("Este pregão não possui origem no Compras.gov.br", 409);
    }
    if (!pregao.type) throw new AppError("Classifique o tipo do pregão antes de sincronizar", 409);

    const comprasGov = new ComprasGovService();
    const results = [];
    for (const ata of pregao.atas) {
      const fallbackGroup = ata.coverageGroups[0];
      const fallbackLocalities = fallbackGroup?.localities.map((locality) => ({
        cityName: locality.cityName,
        stateUf: locality.stateUf,
      }));
      results.push(await comprasGov.importAta({
        uasg: pregao.uasg,
        numeroPregao: pregao.number,
        anoPregao: pregao.year,
        numeroAta: ata.externalAtaNumber ?? undefined,
        ataType: pregao.type,
        autoDetectCoverage: true,
        coverageGroupId: fallbackGroup?.id,
        coverageGroupCode: fallbackGroup?.code,
        coverageGroupName: fallbackGroup?.name,
        coverageGroupLocalities: fallbackLocalities,
      }));
    }

    return {
      pregaoId: id,
      synchronizedAt: new Date(),
      atasProcessed: results.length,
      itemsCreated: results.reduce((sum, result) => sum + result.itemsCreated, 0),
      itemsUpdated: results.reduce((sum, result) => sum + result.itemsUpdated, 0),
    };
  }
}
