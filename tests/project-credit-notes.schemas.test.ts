import { describe, expect, it } from "vitest";

import { updateProjectFlowSchema } from "../src/modules/projects/projects.schemas.js";

describe("Notas de Crédito do projeto", () => {
  it("aceita crédito composto por múltiplas NCs", () => {
    const result = updateProjectFlowSchema.safeParse({
      stage: "DIEX_REQUISITORIO",
      creditNoteMode: "MULTIPLE",
      creditNotes: [
        { number: "2026NC000001", receivedAt: "2026-09-03", amount: 6000 },
        {
          number: "2026NC000002",
          receivedAt: "2026-09-04",
          amount: "4000.50",
          issuingManagementUnit: "160091",
          documentLink: "https://intranet.exemplo/nc-2",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.creditNotes).toHaveLength(2);
      expect(result.data.creditNotes?.[1]?.amount).toBe(4000.5);
    }
  });

  it("rejeita NC sem valor positivo", () => {
    const result = updateProjectFlowSchema.safeParse({
      stage: "DIEX_REQUISITORIO",
      creditNoteMode: "SINGLE",
      creditNotes: [{ number: "2026NC000001", receivedAt: "2026-09-03", amount: 0 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejeita link comprobatório inválido", () => {
    const result = updateProjectFlowSchema.safeParse({
      stage: "DIEX_REQUISITORIO",
      creditNotes: [{
        number: "2026NC000001",
        receivedAt: "2026-09-03",
        amount: 100,
        documentLink: "documento local",
      }],
    });

    expect(result.success).toBe(false);
  });
});
