import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

type CreateMilitaryOrganizationInput = {
  sigla: string;
  name: string;
  cityName: string;
  stateUf: "AM" | "RO" | "RR" | "AC";
};

type UpdateMilitaryOrganizationInput = {
  sigla?: string;
  name?: string;
  cityName?: string;
  stateUf?: "AM" | "RO" | "RR" | "AC";
  isActive?: boolean;
};

type ListMilitaryOrganizationsFilters = {
  code?: number;
  sigla?: string;
  cityName?: string;
  stateUf?: "AM" | "RO" | "RR" | "AC";
  active?: boolean;
  search?: string;
};

export class MilitaryOrganizationsService {
  async create(data: CreateMilitaryOrganizationInput) {
    const exists = await prisma.militaryOrganization.findUnique({
      where: { sigla: data.sigla.trim() },
      select: { id: true },
    });

    if (exists) {
      throw new AppError("Já existe uma OM com esta sigla", 409);
    }

    return prisma.militaryOrganization.create({
      data: {
        sigla: data.sigla.trim(),
        name: data.name.trim(),
        cityName: data.cityName.trim(),
        stateUf: data.stateUf,
      },
    });
  }

  async list(filters: ListMilitaryOrganizationsFilters) {
    const andConditions: Prisma.MilitaryOrganizationWhereInput[] = [];

    if (filters.code) {
      andConditions.push({ omCode: filters.code });
    }

    if (filters.sigla) {
      andConditions.push({
        sigla: { contains: filters.sigla, mode: "insensitive" },
      });
    }

    if (filters.cityName) {
      andConditions.push({
        cityName: { contains: filters.cityName, mode: "insensitive" },
      });
    }

    if (filters.stateUf) {
      andConditions.push({ stateUf: filters.stateUf });
    }

    if (filters.active !== undefined) {
      andConditions.push({ isActive: filters.active });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          { sigla: { contains: filters.search, mode: "insensitive" } },
          { name: { contains: filters.search, mode: "insensitive" } },
          { cityName: { contains: filters.search, mode: "insensitive" } },
        ],
      });
    }

    return prisma.militaryOrganization.findMany({
      where: andConditions.length ? { AND: andConditions } : undefined,
      orderBy: [{ stateUf: "asc" }, { cityName: "asc" }, { sigla: "asc" }],
    });
  }

  async findById(id: string) {
    const om = await prisma.militaryOrganization.findUnique({
      where: { id },
    });

    if (!om) {
      throw new AppError("OM não encontrada", 404);
    }

    return om;
  }

  async findByCode(code: number) {
    const om = await prisma.militaryOrganization.findUnique({
      where: { omCode: code },
    });

    if (!om) {
      throw new AppError("OM não encontrada", 404);
    }

    return om;
  }

  private async validateUniqueSigla(sigla: string, excludeId?: string) {
    const conflict = await prisma.militaryOrganization.findFirst({
      where: {
        sigla: sigla.trim(),
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (conflict) {
      throw new AppError("Já existe outra OM com esta sigla", 409);
    }
  }

  async update(id: string, data: UpdateMilitaryOrganizationInput) {
    const existing = await prisma.militaryOrganization.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new AppError("OM não encontrada", 404);
    }

    if (data.sigla) {
      await this.validateUniqueSigla(data.sigla, id);
    }

    return prisma.militaryOrganization.update({
      where: { id },
      data: {
        ...(data.sigla !== undefined && { sigla: data.sigla.trim() }),
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.cityName !== undefined && { cityName: data.cityName.trim() }),
        ...(data.stateUf !== undefined && { stateUf: data.stateUf }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async updateByCode(code: number, data: UpdateMilitaryOrganizationInput) {
    const existing = await prisma.militaryOrganization.findUnique({
      where: { omCode: code },
      select: { id: true },
    });

    if (!existing) {
      throw new AppError("OM não encontrada", 404);
    }

    return this.update(existing.id, data);
  }

  async remove(id: string) {
    const existing = await prisma.militaryOrganization.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new AppError("OM não encontrada", 404);
    }

    await prisma.militaryOrganization.delete({
      where: { id },
    });

    return { message: "OM excluída com sucesso" };
  }

  async removeByCode(code: number) {
    const existing = await prisma.militaryOrganization.findUnique({
      where: { omCode: code },
      select: { id: true },
    });

    if (!existing) {
      throw new AppError("OM não encontrada", 404);
    }

    return this.remove(existing.id);
  }
}