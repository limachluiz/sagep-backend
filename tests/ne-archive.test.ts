import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), deleteMany: vi.fn(), source: vi.fn() }));
// Only the archive delegate is exposed: any write to project/ATA balances fails.
vi.mock("../src/config/prisma.js", () => ({ prisma: { discoveredCommitment: mocks } }));
vi.mock("../src/modules/financial-execution/ne-discovery.service.js", () => ({ discoveryDocuments: mocks.source }));
import { archiveImportSchema, archiveQuerySchema, importDiscoveredNote, deleteArchivedNotes } from "../src/modules/financial-execution/ne-archive.service.js";
const code = "160016000012026NE000534";
beforeEach(() => { vi.resetAllMocks(); mocks.source.mockResolvedValue({ document: { valor: "33.698,40" }, related: [], fetchedAt: "2026-09-15T12:00:00Z" }); mocks.findUnique.mockResolvedValue(null); });
describe("NE archive and origin conflicts", () => {
  it("imports authoritative snapshots without writing balances", async () => {
    await importDiscoveredNote(code, "user");
    expect(mocks.source).toHaveBeenCalledWith(code);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ importedById: "user", externalCode: code, origin: "IMPORTED", snapshot: expect.objectContaining({ related: [] }) }) });
  });
  it("refreshes the same origin without creating another NE", async () => {
    const existing = { id: "one", origin: "IMPORTED", updatedAt: new Date() };
    mocks.findUnique.mockResolvedValue(existing); mocks.updateMany.mockResolvedValue({ count: 1 });
    await importDiscoveredNote(code, "user");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: existing }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([['IMPORTED', 'STANDALONE'], ['STANDALONE', 'IMPORTED']] as const)("requires a choice before replacing %s with %s", async (existingOrigin, origin) => {
    mocks.findUnique.mockResolvedValue({ id: "one", origin: existingOrigin });
    await expect(importDiscoveredNote(code, "user", { origin })).rejects.toMatchObject({ statusCode: 409, code: "NE_DUPLICATE_ORIGIN", details: { existingOrigin, externalCode: code } });
    expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("replaces only the confirmed origin/version and rejects a concurrent edit", async () => {
    const existing = { id: "one", origin: "IMPORTED", updatedAt: new Date() };
    mocks.findUnique.mockResolvedValue(existing); mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(importDiscoveredNote(code, "user", { origin: "STANDALONE", replaceOrigin: "IMPORTED" })).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: existing, data: expect.objectContaining({ origin: "STANDALONE" }) });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not persist when the source fails", async () => {
    mocks.source.mockRejectedValue(new Error("unavailable"));
    await expect(importDiscoveredNote(code, "user")).rejects.toThrow("unavailable");
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("rejects malformed identifiers before contacting the source", async () => {
    await expect(importDiscoveredNote("bad", "user")).rejects.toThrow(); expect(mocks.source).not.toHaveBeenCalled();
  });
  it("deletes exactly the selected copies, never all rows implicitly", async () => {
    await deleteArchivedNotes([code]);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { externalCode: { in: [code] } } });
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it("defaults to 10 rows and accepts only the supported sizes", () => {
    expect(archiveQuerySchema.parse({}).pageSize).toBe(10);
    for (const pageSize of [10,20,30,50]) expect(archiveQuerySchema.parse({ pageSize }).pageSize).toBe(pageSize);
    expect(archiveQuerySchema.safeParse({ pageSize: 100000 }).success).toBe(false);
    expect(archiveImportSchema.parse({}).origin).toBe("IMPORTED");
  });
});
