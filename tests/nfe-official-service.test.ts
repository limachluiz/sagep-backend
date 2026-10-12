import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ project: vi.fn(), note: vi.fn(), cached: vi.fn(), byId: vi.fn(), state: vi.fn(), stateUpdate: vi.fn(), stateUpsert: vi.fn(), saveConsultation: vi.fn(), duplicate: vi.fn(), duplicateDuringImport: vi.fn(), saveInvoice: vi.fn(), consult: vi.fn(), audit: vi.fn(), lock: vi.fn() }));
vi.mock("../src/config/env.js", () => ({ env: { NFE_ENVIRONMENT: "PRODUCTION", NFE_INTERESTED_CNPJ: "configured-institution" } }));
vi.mock("../src/modules/projects/projects.service.js", () => ({ ProjectsService: class { findById = mocks.project } }));
vi.mock("../src/modules/audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));
vi.mock("../src/modules/financial-execution/nfe-distribution.client.js", () => ({ nfeDistributionClient: { configuration: () => ({ configured: true, message: "Configured" }), consult: mocks.consult } }));
vi.mock("../src/config/prisma.js", () => {
  const client = { commitmentNote: { findUnique: mocks.note }, nfeOfficialConsultation: { findFirst: mocks.cached, findUnique: mocks.byId, create: mocks.saveConsultation }, nfeDistributionState: { findUnique: mocks.state, update: mocks.stateUpdate, upsert: mocks.stateUpsert }, invoice: { findUnique: mocks.duplicate, findFirst: mocks.duplicateDuringImport, create: mocks.saveInvoice }, $executeRaw: mocks.lock };
  return { prisma: { ...client, $transaction: (callback: (tx: unknown) => unknown) => callback(client) } };
});
import { nfeOfficialService } from "../src/modules/financial-execution/nfe-official.service.js";
const user = { id: "fiscal", role: "GESTOR", email: "fiscal@example.invalid" };
const input = { projectId: "project", commitmentNoteId: "note", accessKey: "key" };
const result = { source: "SEFAZ", environment: "PRODUCTION", queriedAt: new Date().toISOString(), statusCode: "138", documentKind: "SUMMARY", fiscalStatus: "AUTHORIZED_IN_SUMMARY", warnings: ["Summary only"], summary: { number: "1", series: "1", accessKey: "key", supplierCnpj: "1".repeat(14), issuerName: "Fixture", recipientCnpj: null, issuedAt: "2026-10-01T00:00:00Z", grossAmount: 100, itemCount: 0, hasXmlSignature: false, xmlChecksumSha256: "" } };
const record = { id: "consultation", ...input, queriedAt: new Date(), result };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.project.mockResolvedValue({ id: "project" });
  mocks.note.mockResolvedValue({ id: "note", projectId: "project", supplierCnpj: "1".repeat(14), currentAmount: 200 });
  mocks.consult.mockResolvedValue(result);
  mocks.saveConsultation.mockResolvedValue(record);
  mocks.byId.mockResolvedValue(record);
  mocks.saveInvoice.mockImplementation(async ({ data }) => ({ id: "invoice", ...data }));
});
describe("official fiscal consultation governance", () => {
  it("checks project and NE authorization before calling SEFAZ", async () => {
    mocks.project.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(nfeOfficialService.consult(input, user)).rejects.toThrow("Forbidden");
    expect(mocks.consult).not.toHaveBeenCalled();
    mocks.note.mockResolvedValueOnce({ projectId: "another-project" });
    await expect(nfeOfficialService.consult(input, user)).rejects.toMatchObject({ code: "INVOICE_COMMITMENT_MISMATCH" });
  });
  it("reuses a recent preview without consuming the service again", async () => {
    mocks.cached.mockResolvedValue(record);
    expect(await nfeOfficialService.consult(input, user)).toMatchObject({ cached: true, conferenceStatus: "PENDING" });
    expect(mocks.consult).not.toHaveBeenCalled();
  });
  it("honours persistent cooldown and prevents concurrent requests", async () => {
    mocks.state.mockResolvedValueOnce({ blockedUntil: new Date(Date.now() + 60_000) });
    await expect(nfeOfficialService.consult(input, user)).rejects.toMatchObject({ code: "NFE_QUERY_COOLDOWN" });
    mocks.state.mockResolvedValueOnce({ busyUntil: new Date(Date.now() + 60_000) });
    await expect(nfeOfficialService.consult(input, user)).rejects.toMatchObject({ code: "NFE_QUERY_BUSY" });
    expect(mocks.consult).not.toHaveBeenCalled();
  });
  it("persists a one-hour block for official code 656", async () => {
    mocks.consult.mockResolvedValue({ ...result, statusCode: "656", summary: null });
    await expect(nfeOfficialService.consult(input, user)).rejects.toMatchObject({ statusCode: 429 });
    const data = mocks.stateUpdate.mock.calls[0][0].data;
    expect(data.blockedUntil.getTime()).toBeGreaterThan(Date.now() + 3_599_000);
    expect(data.busyUntil).toBeNull();
  });
  it("imports reviewed summaries with traceability and without attestation or workflow changes", async () => {
    const saved = await nfeOfficialService.import({ consultationId: "consultation", confirmed: true }, user);
    expect(saved.invoice).toMatchObject({ source: "SEFAZ", conferenceStatus: "PENDING", grossAmount: 100 });
    const data = mocks.saveInvoice.mock.calls[0][0].data;
    expect(data.attestedAt).toBeUndefined();
    expect(data.attestedAmount).toBeUndefined();
    expect(data.itemCount).toBeNull();
    expect(data.conferenceDetails).toMatchObject({ source: "SEFAZ", consultationId: "consultation" });
  });
  it("blocks expired previews, cancelled notes and duplicate imports", async () => {
    mocks.byId.mockResolvedValueOnce({ ...record, queriedAt: new Date(Date.now() - 16 * 60_000) });
    await expect(nfeOfficialService.import({ consultationId: "consultation", confirmed: true }, user)).rejects.toMatchObject({ code: "NFE_PREVIEW_EXPIRED" });
    mocks.byId.mockResolvedValueOnce({ ...record, result: { ...result, fiscalStatus: "CANCELLED" } });
    await expect(nfeOfficialService.import({ consultationId: "consultation", confirmed: true }, user)).rejects.toMatchObject({ code: "NFE_IMPORT_NOT_ALLOWED" });
    mocks.duplicateDuringImport.mockResolvedValueOnce({ id: "existing-invoice" });
    await expect(nfeOfficialService.import({ consultationId: "consultation", confirmed: true }, user)).rejects.toMatchObject({ code: "INVOICE_ALREADY_REGISTERED" });
    expect(mocks.saveInvoice).not.toHaveBeenCalled();
  });
});
