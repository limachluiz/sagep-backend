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
  archived?: "active" | "archived" | "all";
};

type MilitaryOrganizationActor = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export class MilitaryOrganizationsService {
  private where(filters: ListMilitaryOrganizationsFilters): Prisma.MilitaryOrganizationWhereInput {
    const AND: Prisma.MilitaryOrganizationWhereInput[] = [];
    if (filters.code) AND.push({ omCode: filters.code });
    if (filters.sigla) AND.push({ sigla: { contains: filters.sigla, mode: "insensitive" } });
    if (filters.cityName) AND.push({ cityName: { contains: filters.cityName, mode: "insensitive" } });
    if (filters.stateUf) AND.push({ stateUf: filters.stateUf });
    if (filters.active !== undefined) AND.push({ isActive: filters.active });
    if (filters.archived === "archived") AND.push({ archivedAt: { not: null } });
    else if (filters.archived !== "all") AND.push({ archivedAt: null });
    if (filters.search) AND.push({ OR: [
      { sigla: { contains: filters.search, mode: "insensitive" } },
      { name: { contains: filters.search, mode: "insensitive" } },
      { cityName: { contains: filters.search, mode: "insensitive" } },
    ] });
    return AND.length ? { AND } : {};
  }
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
    return prisma.militaryOrganization.findMany({
      where: this.where(filters),
      orderBy: [{ stateUf: "asc" }, { cityName: "asc" }, { sigla: "asc" }],
    });
  }

  async bulkAction(input: { action: "INACTIVATE" | "ARCHIVE" | "DELETE"; ids?: string[]; allMatching: boolean; filters?: ListMilitaryOrganizationsFilters }, actor: MilitaryOrganizationActor) {
    const targets = await prisma.militaryOrganization.findMany({
      where: input.allMatching ? this.where(input.filters ?? {}) : { id: { in: input.ids ?? [] } },
      select: { id: true, omCode: true, sigla: true, name: true, cityName: true, stateUf: true, isActive: true, archivedAt: true, _count: { select: { projects: true, estimates: true } } },
    });
    if (!targets.length) throw new AppError("Nenhuma OM encontrada para a operação", 404, "MILITARY_ORGANIZATIONS_BULK_EMPTY");
    const now = new Date();
    const succeeded: string[] = [];
    const failed: Array<{ id: string; sigla: string; reason: string }> = [];
    await prisma.$transaction(async (tx) => {
      for (const target of targets) {
        if (input.action === "DELETE" && (target._count.projects || target._count.estimates)) {
          failed.push({ id: target.id, sigla: target.sigla, reason: `Possui ${target._count.projects} projeto(s) e ${target._count.estimates} estimativa(s) vinculados` });
          continue;
        }
        const before = { ...target, _count: undefined };
        if (input.action === "DELETE") await tx.militaryOrganization.delete({ where: { id: target.id } });
        else await tx.militaryOrganization.update({ where: { id: target.id }, data: input.action === "ARCHIVE" ? { archivedAt: now, isActive: false } : { isActive: false } });
        const action = input.action === "DELETE" ? "DELETE" : input.action === "ARCHIVE" ? "ARCHIVE" : "STATUS_CHANGE";
        await tx.auditLog.create({ data: {
          entityType: "SYSTEM_SETTINGS", entityId: target.id, action,
          actorUserId: actor.id, actorName: actor.name ?? actor.email,
          summary: `Organização Militar ${target.sigla} ${input.action === "DELETE" ? "excluída" : input.action === "ARCHIVE" ? "arquivada" : "inativada"} em lote`,
          beforeJson: before, afterJson: input.action === "DELETE" ? undefined : { ...before, isActive: false, archivedAt: input.action === "ARCHIVE" ? now : target.archivedAt },
          metadata: { bulkAction: input.action, selectedAllMatching: input.allMatching },
        } });
        succeeded.push(target.id);
      }
    });
    return { action: input.action, requested: targets.length, succeeded: succeeded.length, failed: failed.length, succeededIds: succeeded, failures: failed };
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

  async remove(id: string, actor: MilitaryOrganizationActor) {
    const existing = await prisma.militaryOrganization.findUnique({
      where: { id },
      select: {
        id: true,
        omCode: true,
        sigla: true,
        name: true,
        cityName: true,
        stateUf: true,
        isActive: true,
      },
    });

    if (!existing) {
      throw new AppError("OM não encontrada", 404);
    }

    if (existing.isActive) {
      throw new AppError(
        "Inative a OM antes de excluí-la",
        409,
        "MILITARY_ORGANIZATION_MUST_BE_INACTIVE",
        { reason: "ACTIVE" },
      );
    }

    const linkedRecords = await prisma.$transaction(async (tx) => {
      const [projects, estimates] = await Promise.all([
        tx.project.count({ where: { omId: id } }),
        tx.estimate.count({ where: { omId: id } }),
      ]);

      if (projects > 0 || estimates > 0) {
        return { projects, estimates, deleted: false as const };
      }

      await tx.militaryOrganization.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          entityType: "SYSTEM_SETTINGS",
          entityId: id,
          action: "DELETE",
          actorUserId: actor.id,
          actorName: actor.name ?? actor.email,
          summary: `Organização Militar ${existing.sigla} excluída`,
          beforeJson: existing,
          metadata: { omCode: existing.omCode },
        },
      });

      return { projects, estimates, deleted: true as const };
    });

    if (!linkedRecords.deleted) {
      const projectLabel = `${linkedRecords.projects} projeto(s)`;
      const estimateLabel = `${linkedRecords.estimates} estimativa(s)`;
      throw new AppError(
        `Não é possível excluir ${existing.sigla}: existem ${projectLabel} e ${estimateLabel} vinculados. Inative a OM para impedir novos usos e preservar o histórico.`,
        409,
        "MILITARY_ORGANIZATION_HAS_LINKED_RECORDS",
        {
          reason: "LINKED_RECORDS",
          projects: linkedRecords.projects,
          estimates: linkedRecords.estimates,
        },
      );
    }

    return { message: "OM excluída com sucesso" };
  }

  async removeByCode(code: number, actor: MilitaryOrganizationActor) {
    const existing = await prisma.militaryOrganization.findUnique({
      where: { omCode: code },
      select: { id: true },
    });

    if (!existing) {
      throw new AppError("OM não encontrada", 404);
    }

    return this.remove(existing.id, actor);
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
