import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { discoveryDocuments } from "./ne-discovery.service.js";

export const archiveCodeSchema = z.string().regex(/^\d{15}NE\d{6}$/);
export const archiveQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), search: z.string().trim().max(100).default("") });

export async function importDiscoveredNote(code: string, userId: string) {
  // Always read the source on the server; never trust client financial amounts.
  const snapshot = await discoveryDocuments(archiveCodeSchema.parse(code));
  const data = { snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue, importedById: userId };
  return prisma.discoveredCommitment.upsert({ where: { externalCode: code },
    create: { externalCode: code, ...data }, update: data });
}

export async function listArchivedNotes(query: z.infer<typeof archiveQuerySchema>) {
  const where = { externalCode: { contains: query.search, mode: "insensitive" as const } };
  const [items, total] = await prisma.$transaction([
    prisma.discoveredCommitment.findMany({ where, orderBy: { externalCode: "desc" }, skip: (query.page - 1) * 20, take: 20 }),
    prisma.discoveredCommitment.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: 20 };
}

export async function deleteArchivedNote(code: string) {
  // Does not touch CommitmentNote, financial documents, projects or ATA quantities.
  await prisma.discoveredCommitment.deleteMany({ where: { externalCode: archiveCodeSchema.parse(code) } });
}
