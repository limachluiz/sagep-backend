import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let current: Record<string, unknown> | null = null;
  const registry = {
    findUnique: vi.fn(async () => current),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { current = { ...data, importedAt: null, importedById: null, importedOrigin: null, targetId: null }; return current; }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { current = { ...current, ...data }; return current; }),
  };
  return { registry, reset: () => { current = null; }, executeRaw: vi.fn(), empty: vi.fn(async () => []) };
});

vi.mock("../src/config/prisma.js", () => ({ prisma: {
  commitmentNote: { findMany: mocks.empty },
  discoveredCommitment: { findMany: mocks.empty },
  commitmentImportRegistry: mocks.registry,
  $transaction: vi.fn(async (operation: unknown) => typeof operation === "function" ? operation({ commitmentImportRegistry: mocks.registry, $executeRaw: mocks.executeRaw }) : Promise.all(operation as Promise<unknown>[])),
} }));

import { claimCommitmentImport } from "../src/modules/financial-execution/commitment-import-registry.service.js";

describe("trava global de importação de NE", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.reset(); });

  it("entrega a reivindicação ao primeiro gestor e bloqueia o segundo", async () => {
    await claimCommitmentImport("160016000012026NE000021", "gestor-1");
    await expect(claimCommitmentImport("160016000012026NE000021", "gestor-2")).rejects.toMatchObject({ statusCode: 409, code: "NE_IMPORT_IN_PROGRESS" });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
  });
});
