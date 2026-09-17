import { archivedFinancial } from "./portfolio-summary.js";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/app-error.js";
import { discoveryDocuments } from "./ne-discovery.service.js";

export const archiveCodeSchema = z.string().regex(/^\d{15}NE\d{6}$/);
export const archiveQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().refine(n => [10,20,30,50].includes(n)).default(10), search: z.string().trim().max(100).default("") });
export const archiveImportSchema = z.object({ origin: z.enum(["IMPORTED", "STANDALONE"]).default("IMPORTED"), replaceOrigin: z.enum(["IMPORTED", "STANDALONE"]).optional() });
export const archiveBulkDeleteSchema = z.object({ codes: z.array(archiveCodeSchema).min(1).max(5000) });

export async function importDiscoveredNote(code: string, userId: string, input = archiveImportSchema.parse({})) {
  archiveCodeSchema.parse(code);
  const existing = await prisma.discoveredCommitment.findUnique({ where: { externalCode: code } });
  if (existing && existing.origin !== input.origin && input.replaceOrigin !== existing.origin) {
    throw new AppError("Esta NE já existe com outra origem. Escolha manter o cadastro existente ou substituí-lo pelo novo.", 409, "NE_DUPLICATE_ORIGIN", { externalCode: code, existingOrigin: existing.origin });
  }
  const snapshot = await discoveryDocuments(code, true);
  if (existing && snapshot.financial?.documents.some(d => d.error)) {
    throw new AppError("Não foi possível confirmar todos os valores de liquidação/pagamento. A cópia anterior foi preservada; tente atualizar novamente.", 502, "NE_PAYMENTS_INCOMPLETE");
  }
  const data = { snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue, importedById: userId, origin: input.origin };
  if (existing) {
    const result = await prisma.discoveredCommitment.updateMany({ where: { id: existing.id, updatedAt: existing.updatedAt, origin: existing.origin }, data });
    if (!result.count) throw new AppError("NE alterada durante a operação; atualize e tente novamente", 409);
    return prisma.discoveredCommitment.findUniqueOrThrow({ where: { id: existing.id } });
  }
  try { return await prisma.discoveredCommitment.create({ data: { externalCode: code, ...data } }); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError("NE cadastrada durante a operação; atualize e confira a duplicidade", 409); throw error; }
}

export async function listArchivedNotes(query: z.infer<typeof archiveQuerySchema>) {
  const where = { externalCode: { contains: query.search, mode: "insensitive" as const } };
  const [items, total] = await prisma.$transaction([
    prisma.discoveredCommitment.findMany({ where, orderBy: { externalCode: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.discoveredCommitment.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}
export async function archiveKeys(search: string) {
  const items = await prisma.discoveredCommitment.findMany({ where: { externalCode: { contains: search, mode: "insensitive" } }, select: { externalCode: true }, take: 5001 });
  if (items.length > 5000) throw new AppError("Restrinja a busca para excluir até 5000 registros por vez", 422);
  return items.map(item => item.externalCode);
}
export async function deleteArchivedNotes(codes: string[]) {
  return prisma.discoveredCommitment.deleteMany({ where: { externalCode: { in: codes.map(code => archiveCodeSchema.parse(code)) } } });
}
export async function deleteArchivedNote(code: string) { await deleteArchivedNotes([code]); }

export async function archivedNote(code: string) {
  const note = await prisma.discoveredCommitment.findUnique({ where: { externalCode: archiveCodeSchema.parse(code) } });
  if (!note) throw new AppError("NE não encontrada na base de consulta", 404);
  return { ...note, financial: archivedFinancial(note.snapshot, note.externalCode) };
}
export async function refreshArchivedNote(code: string, userId: string) {
  const note = await archivedNote(code);
  return importDiscoveredNote(code, userId, archiveImportSchema.parse({ origin: note.origin }));
}
