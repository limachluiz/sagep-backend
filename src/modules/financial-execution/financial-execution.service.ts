import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import type {
  CreateInvoiceInput,
  ListCommitmentNotesInput,
  PreviewCommitmentNoteInput,
  RegisterCommitmentNoteInput,
  StandaloneCommitmentNoteLookupInput,
} from "./financial-execution.schemas.js";
import {
  portalTransparenciaClient,
  type PortalCommitmentSnapshot,
} from "./portal-transparencia.client.js";

type CurrentUser = {
  id: string;
  name?: string;
  email: string;
  role: string;
  permissions?: string[];
};

const projectsService = new ProjectsService();

function digits(value?: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

function numberValue(value: Prisma.Decimal | number | string | null | undefined) {
  return value == null ? 0 : Number(value);
}

function serializeNote<T extends Record<string, unknown>>(note: T) {
  const decimalKeys = ["originalAmount", "currentAmount", "liquidatedAmount", "paidAmount", "cancelledAmount"];
  return Object.fromEntries(Object.entries(note).map(([key, value]) => [
    key,
    decimalKeys.includes(key) && value != null ? Number(value) : value,
  ]));
}

export class FinancialExecutionService {
  private actor(user?: CurrentUser) {
    return user ? { id: user.id, name: user.name ?? user.email } : undefined;
  }

  private projectAccessWhere(user: CurrentUser): Prisma.ProjectWhereInput {
    if (user.role === "ADMIN" || user.role === "GESTOR") return {};
    return {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    };
  }

  private async expectedProjectFinancials(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectCode: true,
        title: true,
        stage: true,
        serviceOrders: {
          where: { archivedAt: null, deletedAt: null },
          select: { contractorName: true, contractorCnpj: true, totalAmount: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        diexRequests: {
          where: { archivedAt: null, deletedAt: null },
          select: { supplierName: true, supplierCnpj: true, totalAmount: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        estimates: {
          where: { status: "FINALIZADA", archivedAt: null, deletedAt: null },
          select: { totalAmount: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!project) throw new AppError("Projeto não encontrado", 404);
    const serviceOrder = project.serviceOrders[0];
    const diex = project.diexRequests[0];
    return {
      project,
      supplierName: serviceOrder?.contractorName ?? diex?.supplierName ?? null,
      supplierCnpj: serviceOrder?.contractorCnpj ?? diex?.supplierCnpj ?? null,
      expectedAmount: numberValue(serviceOrder?.totalAmount ?? diex?.totalAmount ?? project.estimates[0]?.totalAmount),
    };
  }

  async lookup(input: StandaloneCommitmentNoteLookupInput, user: CurrentUser) {
    const snapshot = await portalTransparenciaClient.fetchCommitmentNote(
      input.managementUnit,
      input.management,
      input.number,
    );
    const registered = await prisma.commitmentNote.findFirst({
      where: {
        externalCode: snapshot.externalCode,
        project: this.projectAccessWhere(user),
      },
      select: {
        id: true,
        active: true,
        financialStatus: true,
        syncStatus: true,
        lastSyncAt: true,
        project: { select: { id: true, projectCode: true, title: true, stage: true, status: true } },
      },
    });

    await auditService.log({
      entityType: "COMMITMENT_NOTE",
      entityId: snapshot.externalCode,
      action: "SYNC",
      actor: this.actor(user),
      summary: `Consulta avulsa da NE ${snapshot.number}`,
      metadata: {
        managementUnit: snapshot.managementUnit,
        management: snapshot.management,
        registeredCommitmentNoteId: registered?.id ?? null,
      },
    });

    return { snapshot, registered };
  }

  private compare(snapshot: PortalCommitmentSnapshot, expected: Awaited<ReturnType<FinancialExecutionService["expectedProjectFinancials"]>>) {
    const divergences: string[] = [];
    if (snapshot.supplierCnpj && expected.supplierCnpj && digits(snapshot.supplierCnpj) !== digits(expected.supplierCnpj)) {
      divergences.push(`CNPJ da NE (${snapshot.supplierCnpj}) difere do fornecedor do projeto (${expected.supplierCnpj})`);
    }
    if (snapshot.currentAmount > 0 && expected.expectedAmount > 0 && Math.abs(snapshot.currentAmount - expected.expectedAmount) > 0.01) {
      divergences.push(`Valor atual da NE (R$ ${snapshot.currentAmount.toFixed(2)}) difere do valor do projeto (R$ ${expected.expectedAmount.toFixed(2)})`);
    }
    return divergences;
  }

  async preview(input: PreviewCommitmentNoteInput, user: CurrentUser) {
    await projectsService.findById(input.projectId, user);
    const [snapshot, expected] = await Promise.all([
      portalTransparenciaClient.fetchCommitmentNote(input.managementUnit, input.management, input.number),
      this.expectedProjectFinancials(input.projectId),
    ]);
    const divergences = this.compare(snapshot, expected);
    return {
      snapshot,
      validation: {
        status: divergences.length ? "DIVERGENTE" : "VALIDADO",
        divergences,
        expected: {
          supplierName: expected.supplierName,
          supplierCnpj: expected.supplierCnpj,
          amount: expected.expectedAmount,
        },
      },
      project: {
        id: expected.project.id,
        projectCode: expected.project.projectCode,
        title: expected.project.title,
        stage: expected.project.stage,
      },
    };
  }

  async register(input: RegisterCommitmentNoteInput, user: CurrentUser) {
    const preview = await this.preview(input, user);
    if (preview.validation.divergences.length && !input.acceptDivergence) {
      throw new AppError("A Nota de Empenho possui divergências que precisam ser confirmadas", 409, "COMMITMENT_NOTE_DIVERGENCE", preview.validation);
    }

    const project = await projectsService.updateFlow(input.projectId, {
      stage: "AGUARDANDO_NOTA_EMPENHO",
      commitmentNoteNumber: preview.snapshot.number,
      commitmentNoteReceivedAt: input.receivedAt,
    }, user, {
      commitmentNoteSnapshot: preview.snapshot,
      commitmentNoteSyncStatus: preview.validation.divergences.length ? "DIVERGENTE" : "VALIDADO",
      commitmentNoteDivergenceReason: preview.validation.divergences.join("; ") || null,
    });

    const note = await prisma.commitmentNote.findUnique({
      where: { externalCode: preview.snapshot.externalCode },
      include: { documents: { orderBy: { issuedAt: "asc" } } },
    });
    if (!note) throw new AppError("Falha ao persistir a Nota de Empenho validada", 500);

    await auditService.log({
      entityType: "COMMITMENT_NOTE",
      entityId: note.id,
      action: "CREATE",
      actor: this.actor(user),
      summary: `NE ${note.number} validada e vinculada ao projeto PRJ-${project.projectCode}`,
      after: {
        number: note.number,
        externalCode: note.externalCode,
        syncStatus: note.syncStatus,
        financialStatus: note.financialStatus,
        currentAmount: Number(note.currentAmount),
      },
      metadata: { divergences: preview.validation.divergences },
    });

    return { project, commitmentNote: serializeNote(note), validation: preview.validation };
  }

  async list(filters: ListCommitmentNotesInput, user: CurrentUser) {
    const where: Prisma.CommitmentNoteWhereInput = {
      active: true,
      project: this.projectAccessWhere(user),
      ...(filters.projectId && { projectId: filters.projectId }),
      ...(filters.financialStatus && { financialStatus: filters.financialStatus }),
      ...(filters.syncStatus && { syncStatus: filters.syncStatus }),
      ...(filters.search && {
        OR: [
          { number: { contains: filters.search, mode: "insensitive" } },
          { supplierName: { contains: filters.search, mode: "insensitive" } },
          { supplierCnpj: { contains: filters.search.replace(/\D/g, "") } },
          { project: { title: { contains: filters.search, mode: "insensitive" } } },
        ],
      }),
    };
    const [totalItems, items, summary] = await Promise.all([
      prisma.commitmentNote.count({ where }),
      prisma.commitmentNote.findMany({
        where,
        include: {
          project: { select: { id: true, projectCode: true, title: true, stage: true, status: true, om: { select: { sigla: true, stateUf: true } } } },
          invoices: { select: { id: true, invoiceCode: true, number: true, grossAmount: true, attestedAmount: true, attestedAt: true } },
          _count: { select: { documents: true, invoices: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { commitmentNoteCode: "desc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.summary(where),
    ]);
    return {
      items: items.map((item) => ({
        ...serializeNote(item),
        invoices: item.invoices.map((invoice) => ({ ...invoice, grossAmount: Number(invoice.grossAmount), attestedAmount: invoice.attestedAmount == null ? null : Number(invoice.attestedAmount) })),
      })),
      summary,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize)),
      },
    };
  }

  async details(id: string, user: CurrentUser) {
    const note = await prisma.commitmentNote.findFirst({
      where: { id, project: this.projectAccessWhere(user) },
      include: {
        project: { include: { om: true } },
        documents: { orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }] },
        invoices: { orderBy: { issuedAt: "asc" } },
      },
    });
    if (!note) throw new AppError("Nota de Empenho não encontrada", 404);
    return {
      ...serializeNote(note),
      documents: note.documents.map((document) => ({ ...document, amount: Number(document.amount) })),
      invoices: note.invoices.map((invoice) => ({ ...invoice, grossAmount: Number(invoice.grossAmount), attestedAmount: invoice.attestedAmount == null ? null : Number(invoice.attestedAmount) })),
    };
  }

  async summary(where: Prisma.CommitmentNoteWhereInput = { active: true }) {
    const notes = await prisma.commitmentNote.findMany({ where, select: { currentAmount: true, liquidatedAmount: true, paidAmount: true, financialStatus: true, syncStatus: true } });
    const byStatus: Record<string, number> = {};
    const bySyncStatus: Record<string, number> = {};
    const totals = notes.reduce((result, note) => {
      const current = Number(note.currentAmount);
      const liquidated = Number(note.liquidatedAmount);
      const paid = Number(note.paidAmount);
      result.committed += current;
      result.liquidated += liquidated;
      result.paid += paid;
      result.toLiquidate += Math.max(0, current - liquidated);
      result.toPay += Math.max(0, liquidated - paid);
      byStatus[note.financialStatus] = (byStatus[note.financialStatus] ?? 0) + 1;
      bySyncStatus[note.syncStatus] = (bySyncStatus[note.syncStatus] ?? 0) + 1;
      return result;
    }, { committed: 0, liquidated: 0, paid: 0, toLiquidate: 0, toPay: 0 });
    return { total: notes.length, totals, byStatus, bySyncStatus };
  }

  async summaryForUser(user: CurrentUser) {
    return this.summary({ active: true, project: this.projectAccessWhere(user) });
  }

  async syncOne(id: string, user?: CurrentUser) {
    const current = await prisma.commitmentNote.findFirst({
      where: { id, ...(user && { project: this.projectAccessWhere(user) }) },
      include: { project: true },
    });
    if (!current) throw new AppError("Nota de Empenho não encontrada", 404);
    try {
      const snapshot = await portalTransparenciaClient.fetchCommitmentNote(current.managementUnit, current.management, current.number);
      const expected = await this.expectedProjectFinancials(current.projectId);
      const divergences = this.compare(snapshot, expected);
      const updated = await prisma.$transaction(async (tx) => {
        const note = await tx.commitmentNote.update({
          where: { id },
          data: {
            supplierName: snapshot.supplierName,
            supplierCnpj: snapshot.supplierCnpj,
            issuedAt: snapshot.issuedAt,
            originalAmount: snapshot.originalAmount,
            currentAmount: snapshot.currentAmount,
            liquidatedAmount: snapshot.liquidatedAmount,
            paidAmount: snapshot.paidAmount,
            cancelledAmount: snapshot.cancelledAmount,
            financialStatus: snapshot.financialStatus,
            syncStatus: divergences.length ? "DIVERGENTE" : "VALIDADO",
            divergenceReason: divergences.join("; ") || null,
            rawSnapshot: snapshot.rawSnapshot as Prisma.InputJsonValue,
            lastSyncAt: snapshot.fetchedAt,
            lastSyncError: null,
          },
        });
        await tx.financialDocument.deleteMany({ where: { commitmentNoteId: id } });
        if (snapshot.documents.length) {
          await tx.financialDocument.createMany({ data: snapshot.documents.map((document) => ({
            commitmentNoteId: id,
            externalCode: document.externalCode,
            number: document.number,
            phase: document.phase,
            species: document.species,
            issuedAt: document.issuedAt,
            amount: document.amount,
            supplierName: document.supplierName,
            supplierCnpj: document.supplierCnpj,
            rawSnapshot: document.rawSnapshot as Prisma.InputJsonValue,
          })) });
        }
        return note;
      });
      await auditService.log({
        entityType: "COMMITMENT_NOTE",
        entityId: id,
        action: "SYNC",
        actor: this.actor(user),
        summary: `NE ${current.number} sincronizada com o Portal da Transparência`,
        before: { financialStatus: current.financialStatus, liquidatedAmount: Number(current.liquidatedAmount), paidAmount: Number(current.paidAmount) },
        after: { financialStatus: updated.financialStatus, liquidatedAmount: Number(updated.liquidatedAmount), paidAmount: Number(updated.paidAmount), syncStatus: updated.syncStatus },
      });
      return serializeNote(updated);
    } catch (error) {
      await prisma.commitmentNote.update({ where: { id }, data: { syncStatus: "ERRO", lastSyncError: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async syncAll(user?: CurrentUser) {
    const notes = await prisma.commitmentNote.findMany({
      where: { active: true, ...(user && { project: this.projectAccessWhere(user) }) },
      select: { id: true },
    });
    const result = { total: notes.length, synchronized: 0, failed: 0, errors: [] as Array<{ id: string; message: string }> };
    for (const note of notes) {
      try {
        await this.syncOne(note.id, user);
        result.synchronized += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({ id: note.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
  }

  async createInvoice(input: CreateInvoiceInput, user: CurrentUser) {
    await projectsService.findById(input.projectId, user);
    const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true, projectCode: true, invoiceAttestedAt: true } });
    if (!project) throw new AppError("Projeto não encontrado", 404);
    const note = input.commitmentNoteId ? await prisma.commitmentNote.findUnique({ where: { id: input.commitmentNoteId } }) : null;
    if (input.commitmentNoteId && (!note || note.projectId !== input.projectId)) throw new AppError("A NE informada não pertence ao projeto", 409);
    const warnings: string[] = [];
    if (note?.supplierCnpj && digits(note.supplierCnpj) !== digits(input.supplierCnpj)) warnings.push("CNPJ da NFe difere do favorecido da NE");
    if (note && input.grossAmount > Number(note.currentAmount) + 0.01) warnings.push("Valor da NFe supera o valor atual da NE");
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({ data: { ...input, registeredById: user.id } });
      if (input.attestedAt) await tx.project.update({ where: { id: input.projectId }, data: { invoiceAttestedAt: input.attestedAt } });
      return created;
    });
    await auditService.log({
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "CREATE",
      actor: this.actor(user),
      summary: `NFe ${invoice.number} registrada no projeto PRJ-${project.projectCode}`,
      after: { number: invoice.number, supplierCnpj: invoice.supplierCnpj, grossAmount: Number(invoice.grossAmount), attestedAmount: invoice.attestedAmount == null ? null : Number(invoice.attestedAmount), attestedAt: invoice.attestedAt },
      metadata: { warnings },
    });
    return { invoice: { ...invoice, grossAmount: Number(invoice.grossAmount), attestedAmount: invoice.attestedAmount == null ? null : Number(invoice.attestedAmount) }, warnings };
  }
}

export const financialExecutionService = new FinancialExecutionService();
