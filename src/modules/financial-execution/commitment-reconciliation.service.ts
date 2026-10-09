import { z } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { ataItemBalanceService } from "../ata-items/ata-item-balance.service.js";
import { archivedFinancial } from "./portfolio-summary.js";

const codeSchema = z.string().regex(/^\d{15}NE\d{6}$/);
export const confirmReconciliationSchema = z.object({
  projectId: z.string().min(1),
  ataId: z.string().min(1),
  reason: z.string().trim().max(1000).nullable().optional(),
  applyToBalance: z.boolean().default(true),
  allocations: z.array(z.object({ ataItemId: z.string().min(1), quantity: z.coerce.number().positive() })).min(1).max(200),
});
export const reverseReconciliationSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

type Actor = { id: string; name?: string; email?: string };
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

async function noteByCode(code: string) {
  const note = await prisma.discoveredCommitment.findUnique({ where: { externalCode: codeSchema.parse(code) }, include: { attendedOm: { select: { id: true, sigla: true, name: true } } } });
  if (!note) throw new AppError("NE importada não encontrada", 404);
  return note;
}

export async function reconciliationSuggestions(code: string) {
  const note = await noteByCode(code);
  const financial = archivedFinancial(note.snapshot, note.externalCode);
  const ug = note.externalCode.slice(0, 6);
  const cnpj = digits(financial.supplierCnpj);
  const searchable = JSON.stringify(note.snapshot).toUpperCase();
  const atas = await prisma.ata.findMany({
    where: {
      isActive: true,
      ...(cnpj ? { vendorCnpj: { not: null } } : {}),
    },
    include: {
      pregao: { select: { id: true, number: true, year: true, uasg: true } },
      items: { where: { isActive: true, deletedAt: null }, orderBy: { referenceCode: "asc" } },
      coverageGroups: { include: { localities: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const candidates = [];
  for (const ata of atas) {
    const evidence: string[] = [];
    let score = 0;
    if (cnpj && digits(ata.vendorCnpj) === cnpj) { score += 40; evidence.push("CNPJ do fornecedor coincide"); }
    if (ata.pregao?.uasg === ug || ata.externalUasg === ug) { score += 25; evidence.push("UASG coincide"); }
    const number = ata.pregao?.number ?? ata.externalPregaoNumber;
    if (number && searchable.includes(String(number).replace(/^0+/, ""))) { score += 20; evidence.push("Pregão localizado nos dados da NE"); }
    if (note.attendedOmId) { score += 5; evidence.push(`OM atendida informada: ${note.attendedOm?.sigla ?? note.attendedOm?.name}`); }
    // A supplier match alone is not enough: at least one independent signal
    // (UASG, procurement number or informed OM) must support the suggestion.
    if (evidence.length < 2 || (cnpj && digits(ata.vendorCnpj) !== cnpj)) continue;
    const balances = await ataItemBalanceService.getBalanceMapForAtaItems(ata.items);
    candidates.push({
      ata: { id: ata.id, number: ata.number, vendorName: ata.vendorName, vendorCnpj: ata.vendorCnpj, type: ata.type, pregao: ata.pregao },
      confidenceScore: Math.min(score, 100), evidence,
      items: ata.items.map((item) => ({ id: item.id, referenceCode: item.referenceCode, description: item.description, unit: item.unit, unitPrice: item.unitPrice.toString(), balance: balances.get(item.id) })),
    });
  }
  candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
  const ataIds = candidates.map((candidate) => candidate.ata.id);
  const projects = await prisma.project.findMany({
    where: { archivedAt: null, deletedAt: null, OR: [
      ...(ataIds.length ? [{ estimates: { some: { ataId: { in: ataIds } } } }] : []),
      ...(note.attendedOmId ? [{ omId: note.attendedOmId }] : []),
    ] },
    select: { id: true, projectCode: true, title: true, omId: true, om: { select: { sigla: true, name: true } }, estimates: { select: { ataId: true } } },
    orderBy: { projectCode: "desc" }, take: 200,
  });
  const active = await prisma.commitmentReconciliation.findFirst({ where: { discoveredCommitmentId: note.id, status: "CONFIRMED" }, include: { allocations: true } });
  return { note: { id: note.id, externalCode: note.externalCode, financial, attendedOm: note.attendedOm, observation: note.observation }, candidates, projects, active };
}

export async function confirmReconciliation(code: string, input: z.infer<typeof confirmReconciliationSchema>, actor: Actor) {
  const note = await noteByCode(code);
  const suggestion = await reconciliationSuggestions(code);
  const candidate = suggestion.candidates.find((item) => item.ata.id === input.ataId);
  if (!candidate) throw new AppError("A ATA selecionada não possui evidência suficiente para esta NE", 422);
  const project = await prisma.project.findFirst({ where: { id: input.projectId, archivedAt: null, deletedAt: null }, select: { id: true, projectCode: true } });
  if (!project) throw new AppError("Projeto ativo não encontrado", 404);
  const byId = new Map(candidate.items.map((item) => [item.id, item]));
  const allocations = input.allocations.map((line) => {
    const item = byId.get(line.ataItemId);
    if (!item) throw new AppError("Um dos itens não pertence à ATA selecionada", 422);
    const quantity = new Prisma.Decimal(line.quantity).toDecimalPlaces(5);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    if (quantity.greaterThan(new Prisma.Decimal(item.balance?.availableQuantity ?? 0))) throw new AppError(`Saldo insuficiente no item ${item.referenceCode}`, 409);
    return { item, quantity, unitPrice, totalAmount: unitPrice.mul(quantity).toDecimalPlaces(2) };
  });
  const allocated = allocations.reduce((sum, item) => sum.add(item.totalAmount), new Prisma.Decimal(0));
  const neAmount = suggestion.note.financial.current;
  if (neAmount !== null && allocated.greaterThan(new Prisma.Decimal(neAmount).add(0.01))) throw new AppError("A alocação supera o valor atual da NE", 422);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${note.externalCode}))`;
    const active = await tx.commitmentReconciliation.findFirst({ where: { discoveredCommitmentId: note.id, status: "CONFIRMED" } });
    if (active) throw new AppError("Esta NE já possui uma conciliação confirmada", 409);
    const lockedItems = await tx.ataItem.findMany({ where: { id: { in: allocations.map((line) => line.item.id) }, ataId: input.ataId, isActive: true, deletedAt: null } });
    if (lockedItems.length !== allocations.length) throw new AppError("Um dos itens deixou de estar disponível", 409);
    const currentBalances = await ataItemBalanceService.getBalanceMapForAtaItems(lockedItems, tx);
    for (const line of allocations) if (line.quantity.greaterThan(new Prisma.Decimal(currentBalances.get(line.item.id)?.availableQuantity ?? 0))) throw new AppError(`Saldo alterado durante a conciliação no item ${line.item.referenceCode}`, 409);
    const reconciliation = await tx.commitmentReconciliation.create({ data: {
      discoveredCommitmentId: note.id, projectId: project.id, ataId: input.ataId, confidenceScore: candidate.confidenceScore,
      evidence: candidate.evidence, reason: input.reason ?? null, applyToBalance: input.applyToBalance, confirmedById: actor.id,
      allocations: { create: allocations.map(({ item, quantity, unitPrice, totalAmount }) => ({ ataItemId: item.id, quantity, unitPrice, totalAmount })) },
    }, include: { allocations: true } });
    if (input.applyToBalance) for (const line of allocations) {
      const common = { ataItemId: line.item.id, projectId: project.id, actorUserId: actor.id, actorName: actor.name ?? actor.email ?? null, quantity: line.quantity, unitPrice: line.unitPrice, totalAmount: line.totalAmount, metadata: { reconciliationId: reconciliation.id, externalCode: note.externalCode } };
      await tx.ataItemBalanceMovement.create({ data: { ...common, movementType: "RESERVE", summary: `Reserva técnica da conciliação da ${note.externalCode.slice(11)}` } });
      await tx.ataItemBalanceMovement.create({ data: { ...common, movementType: "CONSUME", summary: `Consumo confirmado pela ${note.externalCode.slice(11)}` } });
    }
    return reconciliation;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await auditService.log({ entityType: "COMMITMENT_NOTE", entityId: note.id, action: "UPDATE", actor: { id: actor.id, name: actor.name ?? actor.email ?? null }, summary: `NE ${note.externalCode.slice(11)} conciliada com PRJ-${project.projectCode} e ATA ${candidate.ata.number}`, after: { reconciliationId: result.id, projectId: result.projectId, ataId: result.ataId, confidenceScore: result.confidenceScore, applyToBalance: result.applyToBalance, allocations: result.allocations.map((item) => ({ ataItemId: item.ataItemId, quantity: item.quantity.toString(), totalAmount: item.totalAmount.toString() })) } });
  return result;
}

export async function reverseReconciliation(id: string, input: z.infer<typeof reverseReconciliationSchema>, actor: Actor) {
  const reconciliation = await prisma.commitmentReconciliation.findUnique({ where: { id }, include: { allocations: true } });
  if (!reconciliation) throw new AppError("Conciliação não encontrada", 404);
  if (reconciliation.status === "REVERSED") throw new AppError("Conciliação já revertida", 409);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reconciliation.discoveredCommitmentId}))`;
    if (reconciliation.applyToBalance) for (const line of reconciliation.allocations) await tx.ataItemBalanceMovement.create({ data: {
      ataItemId: line.ataItemId, projectId: reconciliation.projectId, actorUserId: actor.id, actorName: actor.name ?? actor.email ?? null,
      movementType: "REVERSE_CONSUME", quantity: line.quantity, unitPrice: line.unitPrice, totalAmount: line.totalAmount,
      summary: "Reversão de conciliação de NE", metadata: { reconciliationId: reconciliation.id, reason: input.reason },
    } });
    return tx.commitmentReconciliation.update({ where: { id }, data: { status: "REVERSED", reversedById: actor.id, reversedAt: new Date(), reversalReason: input.reason } });
  });
  await auditService.log({ entityType: "COMMITMENT_NOTE", entityId: reconciliation.discoveredCommitmentId, action: "UPDATE", actor: { id: actor.id, name: actor.name ?? actor.email ?? null }, summary: "Conciliação de NE revertida", before: { reconciliationId: reconciliation.id, status: reconciliation.status }, after: { reconciliationId: updated.id, status: updated.status, reversalReason: updated.reversalReason, reversedAt: updated.reversedAt } });
  return updated;
}
