import { describe, expect, it } from "vitest";
import { WorkflowService } from "../src/modules/workflow/workflow.service.js";
import { evidenceUploadHeadersSchema } from "../src/modules/evidences/evidences.schemas.js";

const base = {
  id: "project-1", stage: "ENTREGA_TECNICA" as const, creditNoteNumber: "NC-1", diexNumber: "DIEX-1",
  commitmentNoteNumber: "NE-1", serviceOrderNumber: "OS-1", executionStartedAt: new Date(),
  asBuiltReceivedAt: new Date(), asBuiltApprovedAt: new Date(), asBuiltLink: "https://example.test/as-built",
  invoiceAttestedAt: new Date(), serviceCompletedAt: new Date(),
};

describe("technical delivery workflow", () => {
  it("positions technical delivery between invoice and conclusion", () => {
    const workflow = new WorkflowService();
    expect(workflow.getAllowedNextStages("ATESTAR_NF")).toContain("ENTREGA_TECNICA");
    expect(workflow.getAllowedNextStages("ENTREGA_TECNICA")).toContain("SERVICO_CONCLUIDO");
    expect(workflow.getNextAction(base).code).toBe("GERAR_RELATORIO_ENTREGA");
  });

  it("blocks conclusion until the report is generated and signed", () => {
    const workflow = new WorkflowService();
    expect(() => workflow.validateStageRequirements("SERVICO_CONCLUIDO", { ...base, stage: "SERVICO_CONCLUIDO" }, 1)).toThrow(/Gere o Relatório/);
    expect(() => workflow.validateStageRequirements("SERVICO_CONCLUIDO", { ...base, stage: "SERVICO_CONCLUIDO", deliveryReportGeneratedAt: new Date() }, 1)).toThrow(/assinatura/);
    expect(() => workflow.validateStageRequirements("SERVICO_CONCLUIDO", { ...base, stage: "SERVICO_CONCLUIDO", deliveryReportGeneratedAt: new Date(), deliveryReportSignedAt: new Date() }, 1)).not.toThrow();
  });

  it("rejects a signature from before the current report version", () => {
    const workflow = new WorkflowService();
    expect(() => workflow.validateStageRequirements("SERVICO_CONCLUIDO", {
      ...base,
      stage: "SERVICO_CONCLUIDO",
      deliveryReportGeneratedAt: new Date("2026-08-26T14:35:00.000Z"),
      deliveryReportSignedAt: new Date("2026-08-25T00:00:00.000Z"),
    }, 1)).toThrow(/anterior à versão atual/);
  });

  it("validates evidence metadata", () => {
    expect(evidenceUploadHeadersSchema.parse({ projectId: "p1", filename: "rota.kmz", title: "Traçado da fibra", category: "KMZ_KML", phase: "AFTER", includeInReport: true })).toMatchObject({ category: "KMZ_KML", includeInReport: true });
  });
});
