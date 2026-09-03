import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";
import { pdfService } from "../../shared/pdf.service.js";
import { permissionsService } from "../permissions/permissions.service.js";
import { inferDeliveryUnit, parseDeliveryReportDraft, sanitizeDeliveryNarrative } from "../projects/delivery-report-draft.js";

type CurrentUser = { id: string; email: string; role: string; permissions?: string[] };
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const date = (value: Date | null | undefined) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus" }).format(value) : "Não informado";
const money = (value: unknown) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quantity = (value: unknown) => Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 5 });
const paragraphs = (value: string) => value.split(/\n{2,}/).map((paragraph) => `<p>${escape(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
const taskStatus: Record<string, string> = { PENDENTE: "Pendente", EM_ANDAMENTO: "Em andamento", REVISAO: "Em revisão", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };

export class DeliveryReportService {
  async generate(projectId: string, user: CurrentUser, persistGeneration = true) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        om: true, owner: true, members: { include: { user: true } },
        estimates: { where: { status: "FINALIZADA", archivedAt: null, deletedAt: null }, include: { items: true, ata: true } },
        diexRequests: { where: { archivedAt: null, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
        serviceOrders: { where: { archivedAt: null, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, include: { items: true } },
        commitmentNotes: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        tasks: { where: { deletedAt: null }, include: { assignee: true }, orderBy: { createdAt: "asc" } },
        evidences: { where: { includeInReport: true }, include: { task: true, uploadedBy: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!project || project.deletedAt) throw new AppError("Projeto não encontrado", 404);
    const related = project.ownerId === user.id || project.members.some((member) => member.userId === user.id);
    if (!permissionsService.hasPermission(user, "projects.view_all") && !related) throw new AppError("Você não possui acesso ao projeto", 403);
    if (persistGeneration && project.stage !== "ENTREGA_TECNICA") throw new AppError("Uma nova versão do relatório só pode ser gerada na etapa de Entrega Técnica", 409);
    if (!persistGeneration && !project.deliveryReportGeneratedAt) throw new AppError("O relatório técnico ainda não foi emitido", 404);
    if (!project.evidences.length) throw new AppError("Selecione ao menos uma evidência para o relatório", 409);

    const imageData = async (asset: string) => readFile(path.resolve(asset)).then((buffer) => `data:image/png;base64,${buffer.toString("base64")}`).catch(() => "");
    const [coatOfArms, citexLogo, ctaLogo] = await Promise.all([
      imageData("src/assets/img/brasao.png"),
      imageData("src/assets/logos/citex-logo.png"),
      imageData("src/assets/logos/cta-logo.png"),
    ]);
    const evidenceBlocks = await Promise.all(project.evidences.map(async (item, index) => {
      const isImage = item.mimeType.startsWith("image/");
      let image = "";
      if (isImage) {
        const content = await readFile(path.resolve(env.EVIDENCE_DIRECTORY, item.storageKey)).catch(() => null);
        if (content) image = `<img src="data:${item.mimeType};base64,${content.toString("base64")}" alt="${escape(item.title)}">`;
      }
      return `<article class="evidence">${image}<div><b>Figura/Anexo ${index + 1} — ${escape(item.title)}</b><p>${escape(item.description || "Sem legenda complementar.")}</p><small>${escape(item.category)}${item.task ? ` · Tarefa TSK-${item.task.taskCode}` : ""} · ${escape(item.originalName)}</small></div></article>`;
    }));
    const estimate = project.estimates[0];
    const serviceOrder = project.serviceOrders[0];
    const commitment = project.commitmentNotes[0];
    const items = serviceOrder?.items?.length ? serviceOrder.items : estimate?.items ?? [];
    const draft = parseDeliveryReportDraft(project.deliveryReportDraft, project.projectType);
    const itemDetails = new Map(draft.itemDetails.map((item) => [item.itemId, item]));
    const includedSections = draft.sections.filter((section) => section.included && section.content.trim());
    if (!project.deliveryReportDraft) throw new AppError("Prepare e salve a memória técnica antes de gerar o relatório", 409, "DELIVERY_REPORT_DRAFT_REQUIRED");
    const incompleteSections = draft.sections.filter((section) => section.included && (!section.reviewed || !section.content.trim()));
    if (!includedSections.length || incompleteSections.length) throw new AppError("Revise todos os blocos incluídos antes de gerar o relatório", 409, "DELIVERY_REPORT_SECTIONS_INCOMPLETE", { sections: incompleteSections.map((section) => section.title) });
    const undocumentedItems = items.filter((item: any) => !itemDetails.get(item.estimateItemId || item.id)?.technicalDescription.trim());
    if (undocumentedItems.length) throw new AppError("Registre a memória técnica de todos os itens executados antes de gerar o relatório", 409, "DELIVERY_REPORT_ITEMS_INCOMPLETE", { items: undocumentedItems.map((item: any) => item.itemCode || item.referenceCode) });
    if (draft.formalization.requiresOmAcknowledgement && (!draft.formalization.recipientName.trim() || !draft.formalization.recipientRole.trim() || !draft.formalization.recipientOrganization.trim())) {
      throw new AppError("Preencha os dados de quem dará ciência pela OM antes de gerar o relatório", 409, "DELIVERY_REPORT_RECIPIENT_INCOMPLETE");
    }
    const sectionBlocks = includedSections.map((section, index) => `<section class="technical-section"><h3>${index + 1}. ${escape(section.title)}</h3>${paragraphs(sanitizeDeliveryNarrative(section.content))}</section>`).join("");
    const itemRows = items.map((item: any) => {
      const itemId = item.estimateItemId || item.id;
      const detail = itemDetails.get(itemId);
      const sourceUnit = item.supplyUnit || item.unit;
      const sourceQuantity = item.quantityOrdered ?? item.quantityRequested ?? item.quantity;
      const reportUnit = detail?.unit || inferDeliveryUnit(item.description, sourceUnit);
      const reportQuantity = detail?.quantity || quantity(sourceQuantity);
      return `<tr><td>${escape(item.itemCode || item.referenceCode || "—")}</td><td><b>${escape(item.description)}</b>${detail?.technicalDescription ? `<div class="item-tech">${paragraphs(sanitizeDeliveryNarrative(detail.technicalDescription))}</div>` : ""}</td><td>${escape(reportUnit)}</td><td>${escape(reportQuantity || "—")}</td><td>${money(item.totalPrice || item.subtotal)}</td></tr>`;
    }).join("");
    const diex = project.diexRequests[0];
    const omAcknowledgement = draft.formalization.requiresOmAcknowledgement ? `<div class="signature"><b>${escape([draft.formalization.recipientRank, draft.formalization.recipientName].filter(Boolean).join(" "))}</b><br><span class="muted">${escape(draft.formalization.recipientRole)} · ${escape(draft.formalization.recipientOrganization)}</span><br><small>Ciência da Organização Militar atendida</small>${draft.formalization.acknowledgementNotes ? `<p>${escape(draft.formalization.acknowledgementNotes)}</p>` : ""}</div>` : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page{size:A4;margin:15mm 15mm 19mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1e271e;font-size:10pt;line-height:1.42}.institutional-header{display:grid;grid-template-columns:72px 1fr 72px;align-items:center;min-height:94px;padding:0 3px 9px}.side-mark{display:flex;align-items:center;justify-content:center;height:78px}.side-mark img{display:block;max-width:55px;max-height:72px;object-fit:contain}.institutional-center{text-align:center;line-height:1.23}.institutional-center>img{display:block;width:46px;height:51px;object-fit:contain;margin:0 auto 3px}.institutional-copy span{display:block;font-size:8.2pt;letter-spacing:.2px}.institutional-copy b{display:block;margin-top:3px;font-size:9.8pt}.report-heading{text-align:center;padding:12px 8px 11px;margin-bottom:16px;border-bottom:3px solid #556b2f}.report-heading h1{font-size:14pt;line-height:1.22;margin:0;text-transform:uppercase;letter-spacing:.25px}.report-heading p{margin:5px 0 0;color:#56604f;font-size:9pt}.section-title{display:flex;align-items:center;gap:8px;margin:18px 0 9px;color:#405522;font-size:11.5pt;break-after:avoid}.section-title:after{content:"";height:1px;flex:1;background:#a9b798}.technical-section{break-inside:auto;margin:0 0 13px}.technical-section h3{margin:0 0 5px;color:#405522;font-size:10.2pt;break-after:avoid}.technical-section p{margin:0 0 6px;text-align:justify}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.field{border:1px solid #cdd6c5;border-radius:4px;padding:7px 8px;min-height:49px;background:#fbfcfa}.field span{display:block;color:#66705f;font-size:7.5pt;text-transform:uppercase;letter-spacing:.2px}.field b{display:block;margin-top:2px;font-size:9.5pt}p{orphans:3;widows:3}table{width:100%;border-collapse:collapse;font-size:8.3pt;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #c8d1c0;padding:5px 6px;text-align:left;vertical-align:top;overflow-wrap:break-word}th{background:#516b2c;color:white;font-weight:700}.items-table th:nth-child(1){width:8%}.items-table th:nth-child(3){width:9%}.items-table th:nth-child(4){width:9%}.items-table th:nth-child(5){width:14%}.item-tech{margin-top:6px;padding-top:5px;border-top:1px solid #dce3d7;color:#394333;font-size:8pt}.item-tech p{margin:0 0 4px}.tasks-table th:nth-child(1){width:44%}.tasks-table th:nth-child(2){width:28%}.tasks-table th:nth-child(3){width:28%}.tasks-table th,.tasks-table td{white-space:normal;word-break:normal;overflow-wrap:break-word}.evidence{break-inside:avoid;margin:9px 0;border:1px solid #cdd6c5;border-radius:5px;overflow:hidden;background:#fbfcfa}.evidence img{display:block;width:100%;max-height:145mm;object-fit:contain;background:white}.evidence div{padding:8px 9px}.evidence p{margin:3px 0}.evidence small{color:#66705f}.signature{break-inside:avoid;margin:36px auto 0;width:72%;text-align:center}.signature:before{content:"";display:block;border-top:1px solid #222;margin:0 0 6px}.muted{color:#66705f}.empty{text-align:center;color:#66705f;padding:12px}</style></head><body>
      <header><div class="institutional-header"><div class="side-mark">${citexLogo ? `<img src="${citexLogo}" alt="CITEx">` : ""}</div><div class="institutional-center">${coatOfArms ? `<img src="${coatOfArms}" alt="Brasão da República">` : ""}<div class="institutional-copy"><span>MINISTÉRIO DA DEFESA</span><span>EXÉRCITO BRASILEIRO</span><span>DEPARTAMENTO DE CIÊNCIA E TECNOLOGIA</span><b>4º CENTRO DE TELEMÁTICA DE ÁREA</b></div></div><div class="side-mark">${ctaLogo ? `<img src="${ctaLogo}" alt="4º CTA">` : ""}</div></div><div class="report-heading"><h1>Relatório Técnico de Conclusão e Entrega</h1><p>Projeto PRJ-${project.projectCode} · ${escape(project.om?.sigla || "OM não informada")}</p></div></header>
      <h2 class="section-title">1. Identificação</h2><div class="grid"><div class="field"><span>Projeto</span><b>${escape(project.title)}</b></div><div class="field"><span>OM atendida</span><b>${escape(project.om ? `${project.om.sigla} — ${project.om.name}` : "Não informada")}</b></div><div class="field"><span>Tipo</span><b>${escape(project.projectType === "CFTV" ? "CFTV" : "Fibra óptica / ponto lógico")}</b></div><div class="field"><span>Período de execução</span><b>${date(project.executionStartedAt)} a ${date(project.serviceCompletedAt)}</b></div><div class="field"><span>DIEx requisitório</span><b>${escape(diex?.diexNumber || (diex ? `DIEX-${diex.diexCode}` : "Não informado"))}</b></div><div class="field"><span>Nota de Empenho</span><b>${escape(commitment?.number || project.commitmentNoteNumber || "Não informada")}</b></div><div class="field"><span>Ordem de Serviço</span><b>${escape(serviceOrder?.serviceOrderNumber || project.serviceOrderNumber || "Não informada")}</b></div><div class="field"><span>Ata / fornecedor</span><b>${escape(estimate ? `${estimate.ata.number} · ${estimate.ata.vendorName}` : "Não informada")}</b></div></div>
      <h2 class="section-title">2. Memória técnica da solução</h2>${sectionBlocks || `<p>${escape(project.description || "Serviço executado conforme documentação vinculada ao projeto.")}</p>`}
      <h2 class="section-title">3. Itens executados e memória dos componentes</h2><table class="items-table"><thead><tr><th>Item</th><th>Descrição e especificação aplicada</th><th>Un.</th><th>Qtd.</th><th>Valor</th></tr></thead><tbody>${itemRows || `<tr><td class="empty" colspan="5">Nenhum item estruturado localizado.</td></tr>`}</tbody></table>
      <h2 class="section-title">4. Evidências técnicas e anexos</h2>${evidenceBlocks.join("")}
      <h2 class="section-title">5. Situação das tarefas</h2><table class="tasks-table"><thead><tr><th>Tarefa</th><th>Situação</th><th>Responsável</th></tr></thead><tbody>${project.tasks.map((task) => `<tr><td>TSK-${task.taskCode} · ${escape(task.title)}</td><td>${escape(taskStatus[task.status] || task.status)}</td><td>${escape(task.assignee?.name || "Não atribuído")}</td></tr>`).join("") || `<tr><td class="empty" colspan="3">Nenhuma tarefa vinculada ao projeto.</td></tr>`}</tbody></table>
      <h2 class="section-title">6. Formalização da entrega</h2><p>O presente relatório consolida a memória técnica, os itens executados, as evidências e a situação documental do projeto para fins de validação, assinatura e disponibilização da solução à OM atendida. A eventual ciência da OM não substitui os atos formais de recebimento provisório ou definitivo quando exigidos pela legislação, pelo contrato ou por designação da autoridade competente.</p>
      <div class="signature"><b>${escape(project.owner.rank ? `${project.owner.rank} ${project.owner.warName || project.owner.name}` : project.owner.name)}</b><br><span class="muted">Responsável pelo projeto</span></div>
      ${omAcknowledgement}
    </body></html>`;
    const generatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Manaus" }).format(new Date());
    const pdf = await pdfService.renderPdf({ label: `delivery-report-${projectId}`, buildHtml: async () => html, pdfOptions: {
      format: "A4", printBackground: true, displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `<div style="width:100%;padding:0 15mm;font-family:Arial,sans-serif;font-size:8px;color:#677161;display:flex;justify-content:space-between"><span>SAGEP · Gerado em ${generatedAt}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
    } });
    if (persistGeneration) await prisma.project.update({ where: { id: projectId }, data: { deliveryReportGeneratedAt: new Date(), deliveryReportSignedAt: null, deliveryReportSignedLink: null } });
    return { pdf, projectCode: project.projectCode };
  }

  view(projectId: string, user: CurrentUser) {
    return this.generate(projectId, user, false);
  }
}
