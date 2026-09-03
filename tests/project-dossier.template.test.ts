import { describe, expect, it } from "vitest";

import { renderProjectDossierHtml } from "../src/modules/reports/project-dossier.template.js";

describe("dossiê do projeto", () => {
  it("lista a composição do crédito quando há múltiplas NCs", () => {
    const html = renderProjectDossierHtml({
      generatedAt: "2026-09-03T12:00:00.000Z",
      project: { projectCode: 10, title: "Projeto teste", members: [] },
      workflow: {
        status: "EM_ANDAMENTO",
        stage: "DIEX_REQUISITORIO",
        milestones: {},
        nextAction: { label: "Emitir DIEx" },
        creditFunding: {
          mode: "MULTIPLE",
          requiredAmount: "200.00",
          receivedAmount: "200.00",
          overflowJustification: null,
          notes: [
            { number: "2026NC000001", receivedAt: "2026-09-01", amount: "80.00", cancelledAmount: "0.00", status: "ACTIVE" },
            { number: "2026NC000002", receivedAt: "2026-09-02", amount: "120.00", cancelledAmount: "0.00", status: "ACTIVE" },
          ],
        },
      },
      documents: { estimates: [], diexRequests: [], serviceOrders: [] },
      financialSummary: {},
      timelineSummary: [],
      pendingActions: [],
    });

    expect(html).toContain("Composição do crédito");
    expect(html).toContain("Múltiplas Notas de Crédito");
    expect(html).toContain("2026NC000001");
    expect(html).toContain("2026NC000002");
  });
});
