import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), renderPdf: vi.fn(), hasPermission: vi.fn(() => true) }));
vi.mock("../src/config/prisma.js", () => ({ prisma: { project: { findUnique: mocks.findUnique, update: mocks.update } } }));
vi.mock("../src/shared/pdf.service.js", () => ({ pdfService: { renderPdf: mocks.renderPdf } }));
vi.mock("../src/modules/permissions/permissions.service.js", () => ({ permissionsService: { hasPermission: mocks.hasPermission } }));
import { DeliveryReportService } from "../src/modules/reports/delivery-report.service.js";
import type { DeliveryReportDraft } from "../src/modules/projects/delivery-report-draft.js";
const user = { id: "u1", email: "user@example.test", role: "ADMIN" };
const draft: DeliveryReportDraft = { version: 2, sections: [{ key: "scope", title: "Escopo", content: "", included: true, reviewed: false }], itemDetails: [], formalization: { requiresOmAcknowledgement: false, recipientName: "", recipientRank: "", recipientRole: "", recipientOrganization: "", acknowledgementNotes: "" } };
describe("prévia da entrega técnica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ id: "p1", projectCode: 1, title: "Projeto", projectType: "CFTV", stage: "ENTREGA_TECNICA", ownerId: "u1", owner: { name: "Responsável" }, members: [], estimates: [], diexRequests: [], serviceOrders: [], commitmentNotes: [], tasks: [], evidences: [], deliveryReportDraft: null, deliveryReportGeneratedAt: null });
    mocks.renderPdf.mockResolvedValue(Buffer.from("preview"));
  });
  it("renderiza um documento incompleto sem emitir versão nem registrar aprovação", async () => {
    const result = await new DeliveryReportService().generate("p1", user, false, draft);
    expect(result.pdf.toString()).toBe("preview");
    const html = await mocks.renderPdf.mock.calls[0][0].buildHtml();
    expect(html).toContain("Escopo");
    expect(html).toContain("Em construção");
    expect(html).toContain("MINISTÉRIO DA DEFESA");
    expect(html).not.toContain('section-title:after{content:""');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("usa as alterações ainda não salvas na prévia", async () => {
    await new DeliveryReportService().generate("p1", user, false, { ...draft, sections: [{ ...draft.sections[0], content: "Texto novo & revisável" }] });
    expect(await mocks.renderPdf.mock.calls[0][0].buildHtml()).toContain("Texto novo &amp; revisável");
  });
  it("mantém as validações de emissão final", async () => {
    await expect(new DeliveryReportService().generate("p1", user)).rejects.toThrow("Selecione ao menos uma evidência");
    expect(mocks.renderPdf).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("mantém o controle de acesso à prévia", async () => {
    mocks.hasPermission.mockReturnValueOnce(false);
    await expect(new DeliveryReportService().generate("p1", { ...user, id: "outro" }, false, draft)).rejects.toThrow("acesso ao projeto");
    expect(mocks.renderPdf).not.toHaveBeenCalled();
  });
});
