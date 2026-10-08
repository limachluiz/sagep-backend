import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";

const CLAIM_TIMEOUT_MS = 10 * 60_000;

export async function registerDiscoveredCommitments(codes: string[]) {
  const now = new Date();
  await prisma.$transaction([...new Set(codes)].map((externalCode) => prisma.commitmentImportRegistry.upsert({
    where: { externalCode }, create: { externalCode, lastSeenAt: now }, update: { lastSeenAt: now },
  })));
  return commitmentImportStatuses(codes);
}

async function reconcileRegistered(codes: string[]) {
  if (!codes.length) return;
  const [projectNotes, archived] = await Promise.all([
    prisma.commitmentNote.findMany({ where: { externalCode: { in: codes } }, select: { id: true, externalCode: true } }),
    prisma.discoveredCommitment.findMany({ where: { externalCode: { in: codes } }, select: { id: true, externalCode: true, origin: true, importedById: true, importedAt: true } }),
  ]);
  type ImportedRecord = { externalCode: string; targetId: string; origin: string; importedById: string | null; importedAt: Date | null };
  const recordsByCode = new Map<string, ImportedRecord>();
  archived.forEach((note) => recordsByCode.set(note.externalCode, { externalCode: note.externalCode, targetId: note.id, origin: note.origin, importedById: note.importedById, importedAt: note.importedAt }));
  projectNotes.forEach((note) => recordsByCode.set(note.externalCode, { externalCode: note.externalCode, targetId: note.id, origin: "PROJECT", importedById: null, importedAt: null }));
  const records = [...recordsByCode.values()];
  if (records.length) await prisma.$transaction(records.map((record) => prisma.commitmentImportRegistry.upsert({
    where: { externalCode: record.externalCode },
    create: { externalCode: record.externalCode, status: "IMPORTED", targetId: record.targetId, importedOrigin: record.origin, importedById: record.importedById, importedAt: record.importedAt ?? new Date() },
    update: { status: "IMPORTED", targetId: record.targetId, importedOrigin: record.origin, importedById: record.importedById, importedAt: record.importedAt ?? undefined, claimedAt: null, claimedById: null, lastError: null },
  })));
}

export async function commitmentImportStatuses(codes: string[]) {
  const unique = [...new Set(codes)];
  await reconcileRegistered(unique);
  const items = await prisma.commitmentImportRegistry.findMany({ where: { externalCode: { in: unique } } });
  const userIds = [...new Set(items.flatMap((item) => [item.claimedById, item.importedById]).filter((value): value is string => Boolean(value)))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, warName: true, email: true } }) : [];
  const names = new Map(users.map((user) => [user.id, user.warName || user.name || user.email]));
  return Object.fromEntries(items.map((item) => [item.externalCode, { ...item, claimedByName: item.claimedById ? names.get(item.claimedById) ?? null : null, importedByName: item.importedById ? names.get(item.importedById) ?? null : null }]));
}

export async function claimCommitmentImport(externalCode: string, userId: string, allowImported = false) {
  await reconcileRegistered([externalCode]);
  const stale = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  await prisma.$transaction(async (tx) => {
    // Uma trava transacional por código impede dois gestores de obterem a mesma NE
    // entre a leitura do estado e a gravação da reivindicação.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${externalCode}))`;
    const current = await tx.commitmentImportRegistry.findUnique({ where: { externalCode } });
    if (!current) {
      await tx.commitmentImportRegistry.create({ data: { externalCode, status: "IMPORTING", claimedById: userId, claimedAt: new Date() } });
      return;
    }
    const staleClaim = current.status === "IMPORTING" && Boolean(current.claimedAt && current.claimedAt < stale);
    const available = current.status === "AVAILABLE" || current.status === "FAILED" || staleClaim || (allowImported && current.status === "IMPORTED");
    if (available) {
      await tx.commitmentImportRegistry.update({ where: { externalCode }, data: { status: "IMPORTING", claimedById: userId, claimedAt: new Date(), lastError: null } });
      return;
    }
    if (current.status === "IMPORTED") throw new AppError("Esta NE já foi importada. Abra o registro existente na Carteira de Empenhos.", 409, "NE_ALREADY_IMPORTED", { externalCode, targetId: current.targetId, importedAt: current.importedAt, importedById: current.importedById, origin: current.importedOrigin });
    throw new AppError("Esta NE já está sendo importada por outro usuário. Aguarde a conclusão.", 409, "NE_IMPORT_IN_PROGRESS", { externalCode, claimedAt: current.claimedAt, claimedById: current.claimedById });
  });
}

export async function completeCommitmentImport(externalCode: string, userId: string, targetId: string, origin: string) {
  const importedAt = new Date();
  await prisma.commitmentImportRegistry.upsert({ where: { externalCode }, create: { externalCode, status: "IMPORTED", importedById: userId, importedAt, targetId, importedOrigin: origin }, update: { status: "IMPORTED", importedById: userId, importedAt, targetId, importedOrigin: origin, claimedById: null, claimedAt: null, lastError: null } });
  await prisma.notificationAutomationEvent.updateMany({ where: { eventKey: `NE_DISCOVERED:${externalCode}`, resolvedAt: null }, data: { resolvedAt: importedAt } })
    .catch((error) => console.error("NE importada, mas o alerta não pôde ser resolvido", { externalCode, error }));
}

export async function failCommitmentImport(externalCode: string, userId: string, error: unknown) {
  await prisma.commitmentImportRegistry.updateMany({ where: { externalCode, claimedById: userId, status: "IMPORTING" }, data: { status: "FAILED", claimedById: null, claimedAt: null, lastError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) } });
}
