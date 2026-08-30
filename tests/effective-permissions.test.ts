import { describe, expect, it } from "vitest";
import { permissionsService } from "../src/modules/permissions/permissions.service.js";

describe("effective permissions", () => {
  it("honors the explicit permission list instead of falling back to the role", () => {
    expect(
      permissionsService.hasPermission(
        {
          role: "GESTOR",
          permissions: [],
        },
        "projects.view_all",
      ),
    ).toBe(false);
  });

  it("supports an individual ALLOW outside the role base", () => {
    expect(
      permissionsService.hasPermission(
        {
          role: "CONSULTA",
          permissions: ["projects.view_all"],
        },
        "projects.view_all",
      ),
    ).toBe(true);
  });
});
