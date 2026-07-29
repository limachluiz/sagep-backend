import { describe, expect, it } from "vitest";

import { dashboardExecutiveQuerySchema } from "../src/modules/dashboard/dashboard.schemas.js";
import { kanbanProjectsQuerySchema } from "../src/modules/projects/projects.schemas.js";
import { ganttServiceOrdersQuerySchema } from "../src/modules/service-orders/service-orders.schemas.js";

describe("planning filters", () => {
  it("accepts portfolio filters on the executive dashboard", () => {
    expect(dashboardExecutiveQuerySchema.parse({
      periodType: "year",
      referenceDate: "2026-07-27",
      stateUf: "AM",
      omId: "om-test",
      projectType: "CFTV",
      ownerId: "user-test",
    })).toMatchObject({
      periodType: "year",
      stateUf: "AM",
      projectType: "CFTV",
    });
  });

  it("accepts the same organizational dimensions on Kanban and Gantt", () => {
    expect(kanbanProjectsQuerySchema.parse({
      stateUf: "RO",
      projectType: "FIBRA_OPTICA_PONTO_LOGICO",
      omId: "om-test",
      ownerId: "user-test",
    }).stateUf).toBe("RO");

    expect(ganttServiceOrdersQuerySchema.parse({
      stateUf: "AC",
      projectType: "CFTV",
      ownerId: "user-test",
    }).stateUf).toBe("AC");
  });

  it("rejects unsupported federative units", () => {
    expect(() => dashboardExecutiveQuerySchema.parse({ stateUf: "SP" })).toThrow();
    expect(() => kanbanProjectsQuerySchema.parse({ stateUf: "PA" })).toThrow();
    expect(() => ganttServiceOrdersQuerySchema.parse({ stateUf: "DF" })).toThrow();
  });
});
