import { describe, expect, it } from "vitest";
import { buildContextualDeliverySections, classifyDeliveryItem, defaultDeliveryReportSections, inferDeliveryUnit, parseDeliveryReportDraft, suggestDeliveryItemText } from "../src/modules/projects/delivery-report-draft.js";

describe("memória técnica do relatório de entrega", () => {
  it("sugere metro para cabo linear e unidade para equipamentos e pontos", () => {
    expect(inferDeliveryUnit("Lançamento e instalação de cabo de fibra óptica tipo DROP", "SERVIÇO")).toBe("m");
    expect(inferDeliveryUnit("Instalação com fornecimento de Câmera IP PoE Bullet", "SERVIÇO")).toBe("Und.");
    expect(inferDeliveryUnit("Instalação de Ponto Lógico com cabo UTP", "SERVIÇO")).toBe("Und.");
    expect(inferDeliveryUnit("Fornecimento de cabo óptico", "METRO")).toBe("METRO");
  });

  it("cria os blocos profissionais sem inserir instruções no conteúdo do PDF", () => {
    const sections = defaultDeliveryReportSections("CFTV");
    expect(sections.some((section) => section.key === "executive-project")).toBe(true);
    expect(sections.find((section) => section.key === "executive-project")?.content).toContain("CFTV");
    expect(sections.find((section) => section.key === "legal-contractual-basis")?.content).toContain("14.133");
    expect(sections.find((section) => section.key === "technical-conclusion")?.content).toContain("SAGEP");
  });

  it("preserva um rascunho salvo", () => {
    const stored = { version: 1 as const, sections: [{ key: "custom-test", title: "Memória", content: "Conteúdo", included: true, reviewed: true }], itemDetails: [{ itemId: "item-1", unit: "m", quantity: "320", technicalDescription: "Cabo DROP." }] };
    expect(parseDeliveryReportDraft(stored, "CFTV")).toMatchObject({ version: 2, sections: stored.sections, itemDetails: stored.itemDetails, formalization: { requiresOmAcknowledgement: false } });
  });

  it("gera memória técnica contextual a partir do item real", () => {
    const fiber = { itemId: "1", itemCode: "0001", description: "Lançamento de cabo de fibra óptica 12 fibras tipo DROP", sourceUnit: "m", sourceQuantity: "850", totalPrice: "1000" };
    const nvr = { ...fiber, itemId: "2", description: "Gravador NVR 32 canais com armazenamento de 10TB", sourceUnit: "UND", sourceQuantity: "1" };
    expect(classifyDeliveryItem(fiber.description)).toBe("FIBER");
    expect(suggestDeliveryItemText(fiber)).toContain("850 m");
    expect(suggestDeliveryItemText(fiber)).toContain("12 fibras");
    expect(classifyDeliveryItem(nvr.description)).toBe("NVR");
    expect(suggestDeliveryItemText(nvr)).toContain("10TB");
  });

  it("distribui o escopo misto nos blocos técnicos corretos", () => {
    const base = { itemCode: "1", sourceUnit: "Und.", sourceQuantity: "1", totalPrice: "1000" };
    const items = [
      { ...base, itemId: "camera", description: "Câmera IP Bullet PoE 4 MP" },
      { ...base, itemId: "nvr", description: "NVR de 32 canais com armazenamento de 10TB" },
      { ...base, itemId: "switch", description: "Switch gerenciável 24 portas PoE" },
      { ...base, itemId: "fiber", description: "Lançamento de fibra óptica DROP 12 fibras", sourceUnit: "m", sourceQuantity: "850" },
      { ...base, itemId: "dio", description: "DIO 12 fibras com conectores" },
      { ...base, itemId: "rack", description: "Rack 12U para equipamentos" },
    ];
    const sections = buildContextualDeliverySections(items, { projectCode: 21, title: "CFTV integrado", projectType: "CFTV", omAcronym: "CRO/12", diexNumber: "10/2026", serviceOrderNumber: "09/2026" });
    expect(sections["executive-summary"]).toContain("PRJ-21");
    expect(sections["executive-summary"]).toContain("CRO/12");
    expect(sections["legal-contractual-basis"]).toContain("DIEx 10/2026");
    expect(sections["infrastructure"]).toContain("850 m de Lançamento de fibra óptica DROP 12 fibras");
    expect(sections["equipment-solution"]).toContain("NVR de 32 canais com armazenamento de 10TB");
    expect(sections["topology-operation"]).toContain("switches PoE");
    expect(sections["tests-results"]).toContain("gravação, reprodução");
    expect(sections["operation-maintenance"]).toContain("retenção das imagens");
  });

  it("não declara resultados de ensaio que não estejam cadastrados", () => {
    const items = [{ itemId: "fiber", itemCode: "1", description: "Lançamento de cabo óptico 12 fibras", sourceUnit: "m", sourceQuantity: "500", totalPrice: "1000" }];
    const sections = buildContextualDeliverySections(items, { projectCode: 22, title: "Enlace óptico" });
    expect(sections["tests-results"]).toContain("devem ser confirmados e registrados");
    expect(sections["tests-results"]).toContain("substituir esta orientação pelos resultados efetivamente obtidos");
  });
});
