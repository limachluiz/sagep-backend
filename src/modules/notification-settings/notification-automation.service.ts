import { Prisma } from "../../generated/prisma/client.js";
import { createHash } from "node:crypto";
import type { NotificationAutomationEventType, UserRole } from "../../generated/prisma/enums.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { contratosGovBalanceService } from "../compras-gov/contratos-gov-balance.service.js";
import { financialExecutionService } from "../financial-execution/financial-execution.service.js";
import { discoveryDocuments, discoveryPage } from "../financial-execution/ne-discovery.service.js";
import { archivedFinancial } from "../financial-execution/portfolio-summary.js";
import { systemSettingsService } from "../system-settings/system-settings.service.js";
import { notificationSettingsService } from "./notification-settings.service.js";
import type { NotificationAutomationInput } from "./notification-settings.schemas.js";

type Actor = { id: string; name?: string; email?: string };
type EventCandidate = {
  eventKey: string;
  type: NotificationAutomationEventType;
  title: string;
  description: string;
  detailsPath?: string;
  payload?: Prisma.InputJsonValue;
};

const SYSTEM_ACTOR = { id: "SYSTEM_AUTOMATION", name: "Automação do SAGEP", email: "sistema@sagep.local" };
const RUN_STALE_MS = 2 * 60 * 60_000;

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function money(value: unknown) { return Number(value ?? 0).toFixed(2); }
function dateOnly(value: Date) { return value.toISOString().slice(0, 10); }
function portalStatus(status: string) { return status === "PAGA" ? "PAGA" : ["LIQUIDADA", "PARCIALMENTE_PAGA"].includes(status) ? "LIQUIDADA" : null; }

export function zonedScheduleParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
    .formatToParts(now).reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), weekday: weekdays[parts.weekday!]! };
}

export class NotificationAutomationService {
  async configuration() {
    return prisma.notificationAutomationConfiguration.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  }

  async overview() {
    const [configuration, runs, events] = await Promise.all([
      this.configuration(),
      prisma.notificationAutomationRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
      prisma.notificationAutomationEvent.findMany({ orderBy: { occurredAt: "desc" }, take: 50 }),
    ]);
    return { configuration, runs, events };
  }

  async save(input: NotificationAutomationInput, actor: Actor) {
    if (input.emailListIds.length) {
      const count = await prisma.notificationEmailList.count({ where: { id: { in: input.emailListIds }, active: true } });
      if (count !== input.emailListIds.length) throw new AppError("Uma das listas de e-mail não existe ou está inativa", 422);
    }
    const saved = await prisma.notificationAutomationConfiguration.upsert({
      where: { id: "default" }, create: { id: "default", ...input, updatedById: actor.id }, update: { ...input, updatedById: actor.id },
    });
    await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: "NOTIFICATION_AUTOMATION", action: "UPDATE", actor: { id: actor.id, name: actor.name ?? actor.email ?? null }, summary: "Automação de notificações atualizada", after: input });
    return saved;
  }

  async claimScheduled(now = new Date()) {
    const config = await this.configuration();
    if (!config.enabled) return false;
    const parts = zonedScheduleParts(now, config.timeZone);
    if (!config.weekdays.includes(parts.weekday) || parts.hour !== config.hour || parts.minute !== config.minute) return false;
    const key = `${parts.date}@${String(config.hour).padStart(2, "0")}:${String(config.minute).padStart(2, "0")}`;
    const claimed = await prisma.notificationAutomationConfiguration.updateMany({ where: { id: "default", enabled: true, NOT: { lastScheduledKey: key } }, data: { lastScheduledKey: key } });
    return claimed.count === 1;
  }

  private async startRun(trigger: "MANUAL" | "SCHEDULED", requestedById?: string) {
    return prisma.$transaction(async (tx) => {
      const staleBefore = new Date(Date.now() - RUN_STALE_MS);
      const active = await tx.notificationAutomationRun.findFirst({ where: { status: "RUNNING", startedAt: { gt: staleBefore } }, select: { id: true } });
      if (active) throw new AppError("Já existe uma verificação automática em andamento", 409, "NOTIFICATION_AUTOMATION_RUNNING");
      await tx.notificationAutomationRun.updateMany({ where: { status: "RUNNING", startedAt: { lte: staleBefore } }, data: { status: "FAILED", finishedAt: new Date(), error: "Execução interrompida antes da conclusão" } });
      return tx.notificationAutomationRun.create({ data: { trigger, requestedById } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async persistEvents(candidates: EventCandidate[], runStartedAt: Date) {
    const unique = [...new Map(candidates.map((event) => [event.eventKey, event])).values()];
    if (!unique.length) return [];
    const now = new Date();
    await prisma.notificationAutomationEvent.createMany({ data: unique.map((event) => ({ ...event, occurredAt: now, lastSeenAt: now })), skipDuplicates: true });
    await prisma.notificationAutomationEvent.updateMany({ where: { eventKey: { in: unique.map((event) => event.eventKey) } }, data: { lastSeenAt: now } });
    return prisma.notificationAutomationEvent.findMany({ where: { eventKey: { in: unique.map((event) => event.eventKey) }, createdAt: { gte: runStartedAt } }, orderBy: { occurredAt: "asc" } });
  }

  private async trackedCommitments() {
    const failures: string[] = [];
    const result = await financialExecutionService.syncAll();
    failures.push(...result.errors.map((error) => error.message));
    const projectNotes = await prisma.commitmentNote.findMany({
      where: { active: true },
      select: { externalCode: true, number: true, supplierName: true, financialStatus: true, liquidatedAmount: true, paidAmount: true, lastSyncAt: true },
    });
    const archived = await prisma.discoveredCommitment.findMany({ select: { externalCode: true, snapshot: true } });
    for (const note of archived) {
      try {
        const snapshot = await discoveryDocuments(note.externalCode, true);
        await prisma.discoveredCommitment.update({ where: { externalCode: note.externalCode }, data: { snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue } });
      } catch (error) { failures.push(`${note.externalCode}: ${errorMessage(error)}`); }
    }
    const refreshedArchived = await prisma.discoveredCommitment.findMany({ select: { externalCode: true, snapshot: true } });
    const events: EventCandidate[] = [];
    for (const note of projectNotes) {
      const status = portalStatus(note.financialStatus);
      if (!status) continue;
      const amount = status === "PAGA" ? note.paidAmount : note.liquidatedAmount;
      events.push({ eventKey: `NE_${status}:${note.externalCode}:${money(amount)}`, type: status === "PAGA" ? "NE_PAID" : "NE_LIQUIDATED", title: `NE ${note.number} ${status === "PAGA" ? "paga" : "liquidada"}`, description: `${note.supplierName ?? "Fornecedor não informado"} · R$ ${money(amount)}`, detailsPath: "/financial-execution", payload: { externalCode: note.externalCode, amount: money(amount), status } });
    }
    for (const note of refreshedArchived) {
      const financial = archivedFinancial(note.snapshot, note.externalCode);
      const status = portalStatus(financial.status);
      if (!status) continue;
      const amount = status === "PAGA" ? financial.paid : financial.liquidated;
      events.push({ eventKey: `NE_${status}:${note.externalCode}:${money(amount)}`, type: status === "PAGA" ? "NE_PAID" : "NE_LIQUIDATED", title: `NE ${note.externalCode.slice(-10)} ${status === "PAGA" ? "paga" : "liquidada"}`, description: `${financial.supplierName} · R$ ${money(amount)}`, detailsPath: "/financial-execution", payload: { externalCode: note.externalCode, amount: money(amount), status } });
    }
    return { events, summary: { synchronized: result.synchronized, archived: refreshedArchived.length, failed: failures.length }, failures };
  }

  private async discoverCommitments(config: Awaited<ReturnType<NotificationAutomationService["configuration"]>>) {
    const settings = await systemSettingsService.getEffective();
    const managementUnits = config.managementUnits.length ? config.managementUnits : [settings.uasg];
    const atas = await prisma.ata.findMany({
      where: { isActive: true, vendorCnpj: { not: null }, pregao: { is: { isActive: true } } },
      select: { id: true, number: true, vendorName: true, vendorCnpj: true, validFrom: true, validUntil: true, pregaoId: true, pregao: { select: { uasg: true } } },
    });
    const valid = atas.filter((ata) => /^\d{14}$/.test(ata.vendorCnpj?.replace(/\D/g, "") ?? "") && ata.pregaoId);
    type Group = { pregaoId: string; cnpj: string; supplier: string; ataIds: string[]; ataNumbers: string[]; start: string; end: string; pregaoUasg?: string };
    const groups = new Map<string, Group>();
    for (const ata of valid) {
      const cnpj = ata.vendorCnpj!.replace(/\D/g, "");
      const start = dateOnly(ata.validFrom ?? new Date(new Date().getUTCFullYear(), 0, 1));
      const end = dateOnly(ata.validUntil ?? new Date());
      const key = `${ata.pregaoId}:${cnpj}`;
      const current = groups.get(key);
      if (current) {
        current.ataIds.push(ata.id); current.ataNumbers.push(ata.number);
        if (start < current.start) current.start = start;
        if (end > current.end) current.end = end;
      } else groups.set(key, { pregaoId: ata.pregaoId!, cnpj, supplier: ata.vendorName, ataIds: [ata.id], ataNumbers: [ata.number], start, end, pregaoUasg: ata.pregao?.uasg });
    }
    const events: EventCandidate[] = [];
    const failures: string[] = [];
    let pages = 0;
    for (const group of groups.values()) {
      const startYear = Number(group.start.slice(0, 4)), endYear = Number(group.end.slice(0, 4));
      const units = [...new Set([group.pregaoUasg, ...managementUnits].filter((value): value is string => Boolean(value && /^\d{6}$/.test(value))))];
      for (const ug of units) for (let year = startYear; year <= endYear; year++) {
        for (let page = 1; page <= config.maxDiscoveryPages; page++) {
          try {
            const response = await discoveryPage({ pregaoIds: [group.pregaoId], ataIds: group.ataIds, cnpj: group.cnpj, ug, startDate: group.start, endDate: group.end, year, page });
            pages++;
            for (const item of response.items) {
              const row = item as Record<string, unknown> & { sagepImport?: { status?: string } };
              const code = String(row.documento ?? "");
              if (!/^\d{15}NE\d{6}$/.test(code)) continue;
              const importStatus = row.sagepImport?.status;
              if (importStatus && !["AVAILABLE", "FAILED"].includes(importStatus)) continue;
              events.push({ eventKey: `NE_DISCOVERED:${code}`, type: "NE_DISCOVERED", title: `Nova NE ${code.slice(-10)} no radar`, description: `${group.supplier} · UG ${ug} · ATA(s) ${group.ataNumbers.join(", ")}`, detailsPath: "/financial-execution", payload: { externalCode: code, ataIds: group.ataIds, ataNumbers: group.ataNumbers, supplier: group.supplier, ug } });
            }
            if (response.exhausted) break;
          } catch (error) { failures.push(`ATA(s) ${group.ataNumbers.join(", ")} · UG ${ug} · ${year}: ${errorMessage(error)}`); break; }
        }
      }
    }
    return { events, summary: { atas: valid.length, groups: groups.size, pages, found: events.length, failed: failures.length }, failures };
  }

  private async synchronizeAtaBalances() {
    const atas = await prisma.ata.findMany({
      where: { isActive: true, externalSource: "COMPRAS_GOV", externalUasg: { not: null }, externalPregaoNumber: { not: null }, externalPregaoYear: { not: null }, items: { some: { isActive: true, deletedAt: null, externalItemNumber: { not: null } } } },
      select: { id: true, number: true, items: { where: { isActive: true, deletedAt: null }, select: { id: true, referenceCode: true, externalBalanceSnapshot: { select: { managerAvailableQuantity: true } } } } },
    });
    const events: EventCandidate[] = [];
    const failures: string[] = [];
    for (const ata of atas) {
      const before = new Map(ata.items.map((item) => [item.id, item.externalBalanceSnapshot?.managerAvailableQuantity?.toString() ?? null]));
      try {
        const result = await contratosGovBalanceService.importAtaBalance(ata.id, SYSTEM_ACTOR);
        for (const item of result.items) {
          const previous = before.get(item.ataItemId) ?? null;
          const current = item.managerAvailableQuantity == null ? null : String(item.managerAvailableQuantity);
          if (previous === current) continue;
          events.push({ eventKey: `ATA_BALANCE_CHANGED:${item.ataItemId}:${previous ?? "null"}:${current ?? "null"}:${dateOnly(new Date(result.checkedAt))}`, type: "ATA_BALANCE_CHANGED", title: `Saldo oficial alterado na ATA ${ata.number}`, description: `Item ${item.referenceCode}: ${previous ?? "não informado"} → ${current ?? "não informado"}. Snapshot atualizado sem alterar o saldo operacional.`, detailsPath: `/atas/${ata.id}`, payload: { ataId: ata.id, ataNumber: ata.number, ataItemId: item.ataItemId, previous, current, checkedAt: result.checkedAt } });
        }
      } catch (error) { failures.push(`ATA ${ata.number}: ${errorMessage(error)}`); }
    }
    return { events, summary: { atas: atas.length, changed: events.length, failed: failures.length }, failures };
  }

  private async execute(run: { id: string; startedAt: Date }, config: Awaited<ReturnType<NotificationAutomationService["configuration"]>>) {
    const candidates: EventCandidate[] = [];
    const failures: string[] = [];
    const summary: Record<string, unknown> = {};
    try {
      if (config.syncTrackedCommitments) { const result = await this.trackedCommitments(); candidates.push(...result.events); failures.push(...result.failures); summary.commitments = result.summary; }
      if (config.discoverCommitments) { const result = await this.discoverCommitments(config); candidates.push(...result.events); failures.push(...result.failures); summary.discovery = result.summary; }
      if (config.syncAtaBalances) { const result = await this.synchronizeAtaBalances(); candidates.push(...result.events); failures.push(...result.failures); summary.atas = result.summary; }
      if (failures.length) {
        const digest = createHash("sha256").update(failures.slice(0, 20).join("\n")).digest("hex").slice(0, 16);
        candidates.push({ eventKey: `AUTOMATION_FAILED:${dateOnly(new Date())}:${digest}`, type: "AUTOMATION_FAILED", title: "Automação concluída com pendências", description: `${failures.length} consulta(s) não puderam ser concluídas. Confira o histórico da execução.`, detailsPath: "/settings/notifications", payload: { failures: failures.slice(0, 20) } });
      }
      const events = await this.persistEvents(candidates, run.startedAt);
      summary.newEvents = events.length;
      const pendingSince = new Date(Date.now() - 30 * 24 * 60 * 60_000);
      const [pendingEmail, pendingTelegram] = await Promise.all([
        config.emailEnabled ? prisma.notificationAutomationEvent.findMany({ where: { emailSentAt: null, occurredAt: { gte: pendingSince } }, orderBy: { occurredAt: "asc" }, take: 100 }) : Promise.resolve([]),
        config.telegramEnabled ? prisma.notificationAutomationEvent.findMany({ where: { telegramSentAt: null, occurredAt: { gte: pendingSince } }, orderBy: { occurredAt: "asc" }, take: 100 }) : Promise.resolve([]),
      ]);
      const digest = (items: typeof events) => items.map((event) => `• ${event.title}\n  ${event.description}`).join("\n\n");
      const delivery: Record<string, unknown> = {};
      if (pendingEmail.length) {
        const sent = await notificationSettingsService.deliverAutomationDigest({ subject: `SAGEP · ${pendingEmail.length} alerta(s) financeiro(s)`, text: digest(pendingEmail), emailEnabled: true, telegramEnabled: false, emailListIds: config.emailListIds, notifyRoles: config.notifyRoles as UserRole[] });
        delivery.email = sent.email;
        await prisma.notificationAutomationEvent.updateMany({ where: { id: { in: pendingEmail.map((event) => event.id) } }, data: sent.email.sent ? { emailSentAt: new Date(), emailError: null } : { emailError: sent.email.error ?? null } });
      }
      if (pendingTelegram.length) {
        const sent = await notificationSettingsService.deliverAutomationDigest({ subject: `SAGEP · ${pendingTelegram.length} alerta(s) financeiro(s)`, text: digest(pendingTelegram), emailEnabled: false, telegramEnabled: true, emailListIds: [], notifyRoles: [] });
        delivery.telegram = sent.telegram;
        await prisma.notificationAutomationEvent.updateMany({ where: { id: { in: pendingTelegram.map((event) => event.id) } }, data: sent.telegram.sent ? { telegramSentAt: new Date(), telegramError: null } : { telegramError: sent.telegram.error ?? null } });
      }
      if (Object.keys(delivery).length) summary.delivery = delivery;
      const status = failures.length ? (Object.keys(summary).length ? "PARTIAL" : "FAILED") : "SUCCESS";
      return await prisma.notificationAutomationRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), summary: JSON.parse(JSON.stringify(summary)), error: failures.length ? failures.slice(0, 20).join("\n").slice(0, 5000) : null } });
    } catch (error) {
      await prisma.notificationAutomationRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), summary: JSON.parse(JSON.stringify(summary)), error: errorMessage(error).slice(0, 5000) } });
      throw error;
    }
  }

  async run(trigger: "MANUAL" | "SCHEDULED", actor?: Actor) {
    const config = await this.configuration();
    if (trigger === "SCHEDULED" && !config.enabled) return null;
    const run = await this.startRun(trigger, actor?.id);
    return this.execute(run, config);
  }

  async enqueueManual(actor: Actor) {
    const [config, run] = await Promise.all([this.configuration(), this.startRun("MANUAL", actor.id)]);
    setImmediate(() => void this.execute(run, config).catch((error) => console.error("Falha na execução manual da automação", { runId: run.id, error })));
    return run;
  }
}

export const notificationAutomationService = new NotificationAutomationService();
