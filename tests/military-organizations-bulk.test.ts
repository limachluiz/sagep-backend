import { describe, expect, it } from "vitest";
import { bulkMilitaryOrganizationsActionSchema, listMilitaryOrganizationsQuerySchema } from "../src/modules/military-organizations/military-organizations.schemas.js";

describe("ações em lote de Organizações Militares", () => {
  it("exige seleção explícita ou todos os resultados filtrados", () => {
    expect(bulkMilitaryOrganizationsActionSchema.safeParse({ action: "ARCHIVE", allMatching: false, ids: [] }).success).toBe(false);
    expect(bulkMilitaryOrganizationsActionSchema.parse({ action: "INACTIVATE", ids: ["om-1"], allMatching: false })).toMatchObject({ ids: ["om-1"] });
  });

  it("limita as ações e permite consultar arquivadas", () => {
    expect(bulkMilitaryOrganizationsActionSchema.safeParse({ action: "RESTORE", ids: ["om-1"], allMatching: false }).success).toBe(false);
    expect(listMilitaryOrganizationsQuerySchema.parse({ archived: "archived" }).archived).toBe("archived");
  });
});
