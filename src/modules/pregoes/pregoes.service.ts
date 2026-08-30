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
  uasg?: string;
  number?: string;
  year?: string;
  modality?: string;
  object?: string | null;
  type?: "CFTV" | "FIBRA_OPTICA" | null;
  managingAgency?: string | null;
  openingAt?: string | null;
  homologatedAt?: string | null;
  isActive?: boolean;
};

type CreateInput = UpdateInput & {
  uasg: string;
  number: string;
  year: string;
};

const optionalDate = (value?: string | null) => value ? new Date(value) : null;

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
  async create(data: CreateInput) {
    const duplicate = await prisma.pregao.findUnique({
      where: { uasg_number_year: { uasg: data.uasg.trim(), number: data.number.trim(), year: data.year.trim() } },
      select: { id: true },
    });
    if (duplicate) throw new AppError("Já existe um pregão com esta UASG, número e ano", 409);
    const pregao = await prisma.pregao.create({
      data: {
        uasg: data.uasg.trim(), number: data.number.trim(), year: data.year.trim(),
        modality: data.modality?.trim() || "PREGÃO ELETRÔNICO",
        object: data.object?.trim() || null, type: data.type ?? null,
        managingAgency: data.managingAgency?.trim() || null,
        openingAt: optionalDate(data.openingAt), homologatedAt: optionalDate(data.homologatedAt),
        isActive: data.isActive ?? true, externalSource: "MANUAL",
      },
      include: { atas: { select: ataSummarySelect }, _count: { select: { atas: true } } },
    });
    return (await this.withMetrics([pregao]))[0];
  }
  private async withMetrics<T extends {
    id: string;
    atas: Array<{ id: string; isActive: boolean; vendorName: string; validFrom: Date | null; validUntil: Date | null }>;
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
          activeAtaCount: pregao.atas.filter((ata) => {
            const now = Date.now();
            return ata.isActive && (!ata.validFrom || ata.validFrom.getTime() <= now) && (!ata.validUntil || ata.validUntil.getTime() >= now);
          }).length,
          supplierCount: new Set(pregao.atas.map((ata) => ata.vendorName).filter(Boolean)).size,
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
    const current = await this.findById(id);
    const identity = {
      uasg: data.uasg?.trim() ?? current.uasg,
      number: data.number?.trim() ?? current.number,
      year: data.year?.trim() ?? current.year,
    };
    const duplicate = await prisma.pregao.findFirst({
      where: { ...identity, id: { not: id } }, select: { id: true },
    });
    if (duplicate) throw new AppError("Já existe um pregão com esta UASG, número e ano", 409);
    const pregao = await prisma.pregao.update({
      where: { id },
      data: {
        ...(data.uasg !== undefined && { uasg: data.uasg.trim() }),
        ...(data.number !== undefined && { number: data.number.trim() }),
        ...(data.year !== undefined && { year: data.year.trim() }),
        ...(data.modality !== undefined && { modality: data.modality.trim() }),
        ...(data.object !== undefined && { object: data.object?.trim() || null }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.managingAgency !== undefined && { managingAgency: data.managingAgency?.trim() || null }),
        ...(data.openingAt !== undefined && { openingAt: optionalDate(data.openingAt) }),
        ...(data.homologatedAt !== undefined && { homologatedAt: optionalDate(data.homologatedAt) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        atas: { select: ataSummarySelect, orderBy: [{ number: "asc" }, { ataCode: "asc" }] },
        _count: { select: { atas: true } },
      },
    });
    return (await this.withMetrics([pregao]))[0];
  }

  async remove(id: string) {
    const pregao = await prisma.pregao.findUnique({
      where: { id },
      select: { id: true, _count: { select: { atas: true } } },
    });
    if (!pregao) throw new AppError("Pregão não encontrado", 404);
    if (pregao._count.atas > 0) {
      throw new AppError("Exclua primeiro as ATAs vinculadas a este pregão", 409);
    }
    await prisma.pregao.delete({ where: { id } });
    return { message: "Pregão excluído com sucesso" };
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

  async checkUpdates(id: string) {
    const pregao = await prisma.pregao.findUnique({ where: { id } });
    if (!pregao) throw new AppError("Pregão não encontrado", 404);
    if (pregao.externalSource !== "COMPRAS_GOV") throw new AppError("Este pregão não possui origem no Compras.gov.br", 409);
    const preview = await new ComprasGovService().preview({
      uasg: pregao.uasg, numeroPregao: pregao.number, anoPregao: pregao.year,
    });
    const statuses = preview.atasFound.reduce<Record<string, number>>((result, ata) => {
      const status = ata.importStatus ?? "NOT_IMPORTED";
      result[status] = (result[status] ?? 0) + 1;
      return result;
    }, {});
    return { pregaoId: id, checkedAt: new Date(), totalAtas: preview.atasFound.length, statuses, atas: preview.atasFound };
  }
}