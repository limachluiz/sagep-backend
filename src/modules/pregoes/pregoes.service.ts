import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

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

    return prisma.pregao.findMany({
      where,
      include: {
        atas: { select: ataSummarySelect, orderBy: [{ number: "asc" }, { ataCode: "asc" }] },
        _count: { select: { atas: true } },
      },
      orderBy: [{ year: "desc" }, { number: "desc" }, { pregaoCode: "desc" }],
    });
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
    return pregao;
  }

  async update(id: string, data: UpdateInput) {
    await this.findById(id);
    return prisma.pregao.update({
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
  }
}
