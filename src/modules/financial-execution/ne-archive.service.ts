import { archivedFinancial } from "./portfolio-summary.js";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/app-error.js";
import { discoveryDocuments } from "./ne-discovery.service.js";

export const archiveCodeSchema = z.string().regex(/^\d{15}NE\d{6}$/);
export const archiveQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().refine(n => [10,20,30,50].includes(n)).default(10), search: z.string().trim().max(100).default("") });
const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]).transform(value => typeof value === "string" ? value || null : value);
const attendedOmIdSchema = nullableText(64);
const observationSchema = nullableText(1000);
export const archiveImportSchema = z.object({ origin: z.enum(["IMPORTED", "STANDALONE"]).default("IMPORTED"), replaceOrigin: z.enum(["IMPORTED", "STANDALONE"]).optional(), attendedOmId: attendedOmIdSchema.optional(), observation: observationSchema.optional() });
export const archiveMetadataSchema = z.object({ attendedOmId: attendedOmIdSchema, observation: observationSchema });
export const archiveBulkDeleteSchema = z.object({ codes: z.array(archiveCodeSchema).min(1).max(5000) });

const attendedOmSelect = { id: true, sigla: true, name: true, cityName: true, stateUf: true, isActive: true } as const;
const archiveInclude = { attendedOm: { select: attendedOmSelect } } as const;

async function ensureAttendedOm(attendedOmId: string | null | undefined) {
  if (!attendedOmId) return;
  const organization = await prisma.militaryOrganization.findFirst({ where: { id: attendedOmId, isActive: true, archivedAt: null }, select: { id: true } });
  if (!organization) throw new AppError("OM atendida não encontrada, inativa ou arquivada", 422);
}

export async function attendedOmOptions() {
  return prisma.militaryOrganization.findMany({
    where: { isActive: true, archivedAt: null },
    select: attendedOmSelect,
    orderBy: [{ stateUf: "asc" }, { cityName: "asc" }, { sigla: "asc" }],
  });
}

export async function importDiscoveredNote(code: string, userId: string, input = archiveImportSchema.parse({})) {
  archiveCodeSchema.parse(code);
  await ensureAttendedOm(input.attendedOmId);
  const existing = await prisma.discoveredCommitment.findUnique({ where: { externalCode: code }, include: archiveInclude });
  if (existing && existing.origin !== input.origin && input.replaceOrigin !== existing.origin) {
    throw new AppError("Esta NE já existe com outra origem. Escolha manter o cadastro existente ou substituí-lo pelo novo.", 409, "NE_DUPLICATE_ORIGIN", { externalCode: code, existingOrigin: existing.origin });
  }
  const snapshot = await discoveryDocuments(code, true);
  const data = {
    snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
    importedById: userId,
    origin: input.origin,
    ...(input.attendedOmId !== undefined && { attendedOmId: input.attendedOmId }),
    ...(input.observation !== undefined && { observation: input.observation }),
  };
  if (existing) {
    const result = await prisma.discoveredCommitment.updateMany({ where: { id: existing.id, updatedAt: existing.updatedAt, origin: existing.origin }, data });
    if (!result.count) throw new AppError("NE alterada durante a operação; atualize e tente novamente", 409);
    return prisma.discoveredCommitment.findUniqueOrThrow({ where: { id: existing.id }, include: archiveInclude });
  }
  try { return await prisma.discoveredCommitment.create({ data: { externalCode: code, attendedOmId: input.attendedOmId ?? null, observation: input.observation ?? null, ...data }, include: archiveInclude }); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError("NE cadastrada durante a operação; atualize e confira a duplicidade", 409); throw error; }
}

export async function listArchivedNotes(query: z.infer<typeof archiveQuerySchema>) {
  const where = query.search ? {
    OR: [
      { externalCode: { contains: query.search, mode: "insensitive" as const } },
      { observation: { contains: query.search, mode: "insensitive" as const } },
      { attendedOm: { is: { OR: [
        { sigla: { contains: query.search, mode: "insensitive" as const } },
        { name: { contains: query.search, mode: "insensitive" as const } },
        { cityName: { contains: query.search, mode: "insensitive" as const } },
      ] } } },
    ],
  } : {};
  const [items, total] = await prisma.$transaction([
    prisma.discoveredCommitment.findMany({ where, include: archiveInclude, orderBy: { externalCode: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.discoveredCommitment.count({ where }),
  ]);
  return { items: items.map(item => ({ ...item, financial: archivedFinancial(item.snapshot, item.externalCode) })), total, page: query.page, pageSize: query.pageSize };
}
export async function archiveKeys(search: string) {
  const items = await prisma.discoveredCommitment.findMany({ where: { externalCode: { contains: search, mode: "insensitive" } }, select: { externalCode: true }, take: 5001 });
  if (items.length > 5000) throw new AppError("Restrinja a busca para excluir até 5000 registros por vez", 422);
  return items.map(item => item.externalCode);
}
export async function updateArchivedNoteMetadata(code: string, input: z.infer<typeof archiveMetadataSchema>) {
  await ensureAttendedOm(input.attendedOmId);
  const note = await prisma.discoveredCommitment.update({
    where: { externalCode: archiveCodeSchema.parse(code) },
    data: { attendedOmId: input.attendedOmId, observation: input.observation },
    include: archiveInclude,
  });
  return { ...note, financial: archivedFinancial(note.snapshot, note.externalCode) };
}
export async function deleteArchivedNotes(codes: string[]) {
  return prisma.discoveredCommitment.deleteMany({ where: { externalCode: { in: codes.map(code => archiveCodeSchema.parse(code)) } } });
}
export async function deleteArchivedNote(code: string) { await deleteArchivedNotes([code]); }

export async function archivedNote(code: string) {
  const note = await prisma.discoveredCommitment.findUnique({ where: { externalCode: archiveCodeSchema.parse(code) }, include: archiveInclude });
  if (!note) throw new AppError("NE não encontrada na base de consulta", 404);
  return { ...note, financial: archivedFinancial(note.snapshot, note.externalCode) };
}
export async function refreshArchivedNote(code: string, userId: string) {
  const note = await archivedNote(code);
  return importDiscoveredNote(code, userId, archiveImportSchema.parse({ origin: note.origin }));
}
