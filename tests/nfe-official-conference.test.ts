import { describe, expect, it, vi } from "vitest";
vi.mock("../src/config/prisma.js", () => ({ prisma: {} }));
import { nfeOfficialImportSchema, officialConference } from "../src/modules/financial-execution/nfe-official.service.js";
import type { OfficialNfeResult } from "../src/modules/financial-execution/nfe-distribution.client.js";
const result = { documentKind: "SUMMARY", fiscalStatus: "AUTHORIZED_IN_SUMMARY", summary: { supplierCnpj: "supplier", grossAmount: 100, hasXmlSignature: false } } as unknown as OfficialNfeResult;
describe("assisted official invoice confirmation", () => {
  it("requires explicit confirmation and rejects any automatic-attestation field", () => {
    expect(nfeOfficialImportSchema.safeParse({ consultationId: "id", confirmed: false }).success).toBe(false);
    expect(nfeOfficialImportSchema.safeParse({ consultationId: "id", confirmed: true, attestedAt: "2026-10-01" }).success).toBe(false);
    expect(nfeOfficialImportSchema.safeParse({ consultationId: "id", confirmed: true }).success).toBe(true);
  });
  it("keeps summary-only records pending and flags mismatches and cancellations", () => {
    expect(officialConference(result, { supplierCnpj: "supplier", currentAmount: 200 }).conferenceStatus).toBe("DIVERGENT");
    const numeric = { ...result, summary: { ...result.summary!, supplierCnpj: "1".repeat(14) } };
    expect(officialConference(numeric, { supplierCnpj: "1".repeat(14), currentAmount: 200 }).conferenceStatus).toBe("PENDING");
    expect(officialConference({ ...numeric, fiscalStatus: "CANCELLED" }, { supplierCnpj: "1".repeat(14), currentAmount: 200 }).conferenceStatus).toBe("DIVERGENT");
    expect(officialConference(numeric, { supplierCnpj: "2".repeat(14), currentAmount: 50 }).divergences).toHaveLength(2);
  });
});
