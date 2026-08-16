import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { militaryOrganizationsCsvTemplate, parseMilitaryOrganizationsCsv } from "./military-organizations.csv.js";

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
    const exists = await prisma.militaryOrganization.findFirst({
      where: { sigla: { equals: data.sigla.trim().toUpperCase(), mode: "insensitive" } },
      select: { id: true },
    });

    if (exists) {
      throw new AppError("Já existe uma OM com esta sigla", 409);
    }

    return prisma.militaryOrganization.create({
      data: {
        sigla: data.sigla.trim().toUpperCase(),
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
        sigla: { equals: sigla.trim().toUpperCase(), mode: "insensitive" },
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
        ...(data.sigla !== undefined && { sigla: data.sigla.trim().toUpperCase() }),
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

  csvTemplate() {
    return militaryOrganizationsCsvTemplate();
  }

  async previewCsv(content: string, mode: "CREATE_ONLY" | "UPSERT") {
    let parsedRows;
    try {
      parsedRows = parseMilitaryOrganizationsCsv(content);
    } catch (error) {
      throw new AppError(error instanceof Error ? error.message : "CSV inválido", 400, "INVALID_OM_CSV");
    }
    const existing = await prisma.militaryOrganization.findMany();
    const existingBySigla = new Map(existing.map((item) => [item.sigla.trim().toUpperCase(), item]));
    const rows = parsedRows.map((row) => {
      const current = existingBySigla.get(row.sigla);
      if (row.issues.length) return { ...row, action: "INVALID" as const, existingId: current?.id ?? null };
      if (!current) return { ...row, action: "CREATE" as const, existingId: null };
      if (mode === "CREATE_ONLY") return { ...row, action: "SKIP" as const, existingId: current.id };
      const unchanged = current.name === row.name && current.cityName === row.cityName && current.stateUf === row.stateUf && current.isActive === row.isActive;
      return { ...row, action: unchanged ? "UNCHANGED" as const : "UPDATE" as const, existingId: current.id };
    });
    const count = (action: typeof rows[number]["action"]) => rows.filter((row) => row.action === action).length;
    return {
      mode,
      rows,
      summary: {
        total: rows.length,
        valid: rows.filter((row) => row.action !== "INVALID").length,
        create: count("CREATE"),
        update: count("UPDATE"),
        unchanged: count("UNCHANGED"),
        skipped: count("SKIP"),
        invalid: count("INVALID"),
      },
    };
  }

  async importCsv(content: string, mode: "CREATE_ONLY" | "UPSERT", actor: { id: string; name?: string | null; email?: string | null }) {
    const preview = await this.previewCsv(content, mode);
    const actionable = preview.rows.filter((row) => row.action === "CREATE" || row.action === "UPDATE");
    if (!actionable.length) throw new AppError("Nenhuma OM válida disponível para importação", 400, "NO_OMS_TO_IMPORT");
    await prisma.$transaction(async (tx) => {
      for (const row of actionable) {
        if (row.action === "CREATE") {
          await tx.militaryOrganization.create({ data: { sigla: row.sigla, name: row.name, cityName: row.cityName, stateUf: row.stateUf as "AM" | "RO" | "RR" | "AC", isActive: row.isActive } });
        } else {
          await tx.militaryOrganization.update({ where: { id: row.existingId! }, data: { name: row.name, cityName: row.cityName, stateUf: row.stateUf as "AM" | "RO" | "RR" | "AC", isActive: row.isActive } });
        }
      }
    });
    await auditService.log({
      entityType: "SYSTEM_SETTINGS",
      entityId: "military-organizations-csv",
      action: "CREATE",
      actor: { id: actor.id, name: actor.name ?? actor.email },
      summary: "Importação em lote de Organizações Militares",
      metadata: { mode, created: preview.summary.create, updated: preview.summary.update, invalid: preview.summary.invalid, skipped: preview.summary.skipped },
    });
    return { message: "Importação de OMs concluída com sucesso", ...preview.summary, imported: actionable.length };
  }
}
