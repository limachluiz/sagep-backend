import { describe, expect, it } from "vitest";
import { renderServiceOrderDocumentHtml } from "../src/modules/service-orders/service-order-document.template.js";

const base = {
  serviceOrderCode: 1, serviceOrderNumber: "OS-2026-001", issuedAt: "2026-09-03T12:00:00.000Z",
  contractorName: "Empresa", contractorCnpj: "00000000000100", commitmentNoteNumber: "2026NE000001",
  requesterName: "Luiz Lima", requesterRank: "2º Ten", requesterRole: "Requisitante da Solução",
  requesterCpf: "12345678901", issuingOrganization: "4º CTA", isEmergency: false,
  totalAmount: "100", items: [], scheduleItems: [], deliveredDocuments: [], images: { brasao: "data:image/png;base64," },
};

describe("documento da Ordem de Serviço", () => {
  it("não cria coluna vazia quando não há fiscal", () => {
    const html = renderServiceOrderDocumentHtml({ ...base, hasProjectInspector: false });
    expect(html).not.toContain("Fiscal do Projeto");
    expect(html).toContain('<col style="width: 50%" />');
  });

  it("inclui o fiscal como signatário opcional", () => {
    const html = renderServiceOrderDocumentHtml({
      ...base, hasProjectInspector: true, projectInspectorName: "Maria da Silva",
      projectInspectorRank: "1º Ten", projectInspectorCpf: "98765432100", projectInspectorRole: "Fiscal do Projeto",
    });
    expect(html).toContain("Maria da Silva - 1º Ten");
    expect(html).toContain("CPF: 98765432100");
    expect(html).toContain('colspan="2"');
  });

  it("aplica respiro próprio somente às seções numeradas", () => {
    const html = renderServiceOrderDocumentHtml({ ...base, hasProjectInspector: false });
    expect(html.match(/section-title numbered-section/g)).toHaveLength(5);
    expect(html).toContain("margin-top: 8px");
    expect(html).toContain("margin-bottom: 3px");
  });
});
