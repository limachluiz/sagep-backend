import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    project: { count: vi.fn() },
    estimate: { count: vi.fn() },
    militaryOrganization: { delete: vi.fn() },
    auditLog: { create: vi.fn() },
  };

  return {
    tx,
    findUnique: vi.fn(),
    transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    militaryOrganization: { findUnique: mocks.findUnique },
    $transaction: mocks.transaction,
  },
}));

import { MilitaryOrganizationsService } from "../src/modules/military-organizations/military-organizations.service.js";

const organization = {
  id: "om-1",
  omCode: 10,
  sigla: "4º CTA",
  name: "4º Centro de Telemática de Área",
  cityName: "Manaus",
  stateUf: "AM" as const,
  isActive: false,
};

const actor = { id: "user-1", name: "Administrador" };

describe("MilitaryOrganizationsService.remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(organization);
    mocks.tx.project.count.mockResolvedValue(0);
    mocks.tx.estimate.count.mockResolvedValue(0);
    mocks.tx.militaryOrganization.delete.mockResolvedValue(organization);
    mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("exige que a OM esteja inativa", async () => {
    mocks.findUnique.mockResolvedValue({ ...organization, isActive: true });

    await expect(new MilitaryOrganizationsService().remove("om-1", actor)).rejects.toMatchObject({
      statusCode: 409,
      code: "MILITARY_ORGANIZATION_MUST_BE_INACTIVE",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("bloqueia a exclusão quando existem projetos ou estimativas vinculados", async () => {
    mocks.tx.project.count.mockResolvedValue(2);
    mocks.tx.estimate.count.mockResolvedValue(1);

    await expect(new MilitaryOrganizationsService().remove("om-1", actor)).rejects.toMatchObject({
      statusCode: 409,
      code: "MILITARY_ORGANIZATION_HAS_LINKED_RECORDS",
      details: { reason: "LINKED_RECORDS", projects: 2, estimates: 1 },
    });
    expect(mocks.tx.militaryOrganization.delete).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("exclui e audita uma OM inativa sem vínculos", async () => {
    await expect(new MilitaryOrganizationsService().remove("om-1", actor)).resolves.toEqual({
      message: "OM excluída com sucesso",
    });

    expect(mocks.tx.militaryOrganization.delete).toHaveBeenCalledWith({ where: { id: "om-1" } });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "SYSTEM_SETTINGS",
        entityId: "om-1",
        action: "DELETE",
        actorUserId: "user-1",
      }),
    });
  });
});
