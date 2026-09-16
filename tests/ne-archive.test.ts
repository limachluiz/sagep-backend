import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), deleteMany: vi.fn(), source: vi.fn() }));
// Only the isolated archive delegate is exposed: any write to balances/projects fails.
vi.mock("../src/config/prisma.js", () => ({ prisma: { discoveredCommitment: { upsert: mocks.upsert, deleteMany: mocks.deleteMany } } }));
vi.mock("../src/modules/financial-execution/ne-discovery.service.js", () => ({ discoveryDocuments: mocks.source }));
import { importDiscoveredNote, deleteArchivedNote } from "../src/modules/financial-execution/ne-archive.service.js";
const code = "160016000012026NE000534";
beforeEach(() => { vi.clearAllMocks(); mocks.source.mockResolvedValue({ document: { valor: "33.698,40" }, related: [], fetchedAt: "2026-09-15T12:00:00Z" }); });
describe("independent NE archive", () => {
  it("imports authoritative snapshots with an idempotent key and no balance writes", async () => {
    await importDiscoveredNote(code, "user");
    expect(mocks.source).toHaveBeenCalledWith(code);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { externalCode: code }, create: expect.objectContaining({ importedById: "user", externalCode: code }), update: expect.objectContaining({ snapshot: expect.objectContaining({ related: [] }) }) }));
  });
  it("does not persist when the source fails", async () => {
    mocks.source.mockRejectedValue(new Error("unavailable"));
    await expect(importDiscoveredNote(code, "user")).rejects.toThrow("unavailable");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects malformed identifiers before contacting the source", async () => {
    await expect(importDiscoveredNote("bad", "user")).rejects.toThrow();
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it("deletes only the archived copy, even when it no longer exists", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    await deleteArchivedNote(code);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { externalCode: code } });
    expect(mocks.source).not.toHaveBeenCalled();
  });
});
