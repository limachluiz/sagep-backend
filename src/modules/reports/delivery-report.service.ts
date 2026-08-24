import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";
import { pdfService } from "../../shared/pdf.service.js";
import { permissionsService } from "../permissions/permissions.service.js";

type CurrentUser = { id: string; email: string; role: string; permissions?: string[] };
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const date = (value: Date | null | undefined) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus" }).format(value) : "Não informado";
const money = (value: unknown) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export class DeliveryReportService {
  async generate(projectId: string, user: CurrentUser) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        om: true, owner: true, members: { include: { user: true } },
        estimates: { where: { status: "FINALIZADA", archivedAt: null, deletedAt: null }, include: { items: true, ata: true } },
        serviceOrders: { where: { archivedAt: null, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, include: { items: true } },
        commitmentNotes: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        tasks: { where: { deletedAt: null }, include: { assignee: true }, orderBy: { createdAt: "asc" } },
        evidences: { where: { includeInReport: true }, include: { task: true, uploadedBy: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!project || project.deletedAt) throw new AppError("Projeto não encontrado", 404);
    const related = project.ownerId === user.id || project.members.some((member) => member.userId === user.id);
    if (!permissionsService.hasPermission(user, "projects.view_all") && !related) throw new AppError("Você não possui acesso ao projeto", 403);
    if (project.stage !== "ENTREGA_TECNICA" && project.stage !== "SERVICO_CONCLUIDO") throw new AppError("O relatório de entrega só pode ser gerado na etapa de Entrega Técnica", 409);
    if (!project.evidences.length) throw new AppError("Selecione ao menos uma evidência para o relatório", 409);

    const logo = await readFile(path.resolve("src/assets/logos/cta-logo.png")).then((buffer) => `data:image/png;base64,${buffer.toString("base64")}`).catch(() => "");
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page{size:A4;margin:15mm 15mm 19mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1e271e;font-size:10pt;line-height:1.42}.institutional-header{display:grid;grid-template-columns:68px 1fr 68px;align-items:center;min-height:70px;padding-bottom:8px;border-bottom:1px solid #8a9877}.institutional-header img{display:block;width:58px;height:58px;object-fit:contain;margin:auto}.institutional-copy{text-align:center;line-height:1.28}.institutional-copy span{display:block;font-size:8.5pt;letter-spacing:.25px}.institutional-copy b{display:block;margin-top:3px;font-size:10pt}.report-heading{text-align:center;padding:12px 8px 11px;margin-bottom:16px;border-bottom:3px solid #556b2f}.report-heading h1{font-size:14pt;line-height:1.22;margin:0;text-transform:uppercase;letter-spacing:.25px}.report-heading p{margin:5px 0 0;color:#56604f;font-size:9pt}.section-title{display:flex;align-items:center;gap:8px;margin:18px 0 9px;color:#405522;font-size:11.5pt;break-after:avoid}.section-title:after{content:"";height:1px;flex:1;background:#a9b798}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.field{border:1px solid #cdd6c5;border-radius:4px;padding:7px 8px;min-height:49px;background:#fbfcfa}.field span{display:block;color:#66705f;font-size:7.5pt;text-transform:uppercase;letter-spacing:.2px}.field b{display:block;margin-top:2px;font-size:9.5pt}p{orphans:3;widows:3}table{width:100%;border-collapse:collapse;font-size:8.5pt;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #c8d1c0;padding:5px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#516b2c;color:white;font-weight:700}th:nth-child(1){width:8%}th:nth-child(3){width:11%}th:nth-child(4){width:8%}th:nth-child(5){width:14%}.evidence{break-inside:avoid;margin:9px 0;border:1px solid #cdd6c5;border-radius:5px;overflow:hidden;background:#fbfcfa}.evidence img{display:block;width:100%;max-height:145mm;object-fit:contain;background:white}.evidence div{padding:8px 9px}.evidence p{margin:3px 0}.evidence small{color:#66705f}.signature{break-inside:avoid;margin:36px auto 0;width:72%;text-align:center}.signature:before{content:"";display:block;border-top:1px solid #222;margin:0 0 6px}.muted{color:#66705f}.empty{text-align:center;color:#66705f;padding:12px}</style></head><body>
      <header><div class="institutional-header"><div>${logo ? `<img src="${logo}">` : ""}</div><div class="institutional-copy"><span>MINISTÉRIO DA DEFESA</span><span>EXÉRCITO BRASILEIRO</span><b>4º CENTRO DE TELEMÁTICA DE ÁREA</b></div><div></div></div><div class="report-heading"><h1>Relatório de Entrega Técnica do Serviço</h1><p>Projeto PRJ-${project.projectCode} · ${escape(project.om?.sigla || "OM não informada")}</p></div></header>
      <h2 class="section-title">1. Identificação</h2><div class="grid"><div class="field"><span>Projeto</span><b>${escape(project.title)}</b></div><div class="field"><span>OM atendida</span><b>${escape(project.om ? `${project.om.sigla} — ${project.om.name}` : "Não informada")}</b></div><div class="field"><span>Tipo</span><b>${escape(project.projectType === "CFTV" ? "CFTV" : "Fibra óptica / ponto lógico")}</b></div><div class="field"><span>Período de execução</span><b>${date(project.executionStartedAt)} a ${date(project.serviceCompletedAt)}</b></div><div class="field"><span>Nota de Empenho</span><b>${escape(commitment?.number || project.commitmentNoteNumber || "Não informada")}</b></div><div class="field"><span>Ordem de Serviço</span><b>${escape(serviceOrder?.serviceOrderNumber || project.serviceOrderNumber || "Não informada")}</b></div></div>
      <h2 class="section-title">2. Objeto e escopo</h2><p>${escape(project.description || "Serviço executado conforme documentação vinculada ao projeto.")}</p>
      <h2 class="section-title">3. Itens executados</h2><table><thead><tr><th>Item</th><th>Descrição</th><th>Un.</th><th>Qtd.</th><th>Valor</th></tr></thead><tbody>${items.map((item: any) => `<tr><td>${escape(item.itemCode || item.referenceCode || "—")}</td><td>${escape(item.description)}</td><td>${escape(item.supplyUnit || item.unit || "—")}</td><td>${escape(item.quantityRequested || item.quantity || "—")}</td><td>${money(item.totalPrice || item.subtotal)}</td></tr>`).join("") || `<tr><td class="empty" colspan="5">Nenhum item estruturado localizado.</td></tr>`}</tbody></table>
      <h2 class="section-title">4. Evidências técnicas</h2>${evidenceBlocks.join("")}
      <h2 class="section-title">5. Situação das tarefas</h2><table><thead><tr><th>Tarefa</th><th>Situação</th><th>Responsável</th></tr></thead><tbody>${project.tasks.map((task) => `<tr><td>TSK-${task.taskCode} · ${escape(task.title)}</td><td>${escape(task.status)}</td><td>${escape(task.assignee?.name || "Não atribuído")}</td></tr>`).join("") || `<tr><td class="empty" colspan="3">Nenhuma tarefa vinculada ao projeto.</td></tr>`}</tbody></table>
      <h2 class="section-title">6. Conclusão técnica</h2><p>Os serviços e evidências apresentados neste relatório correspondem aos registros mantidos no SAGEP. As ressalvas e pendências eventualmente existentes permanecem registradas nas tarefas e documentos vinculados ao projeto.</p>
      <div class="signature"><b>${escape(project.owner.rank ? `${project.owner.rank} ${project.owner.warName || project.owner.name}` : project.owner.name)}</b><br><span class="muted">Responsável pelo projeto</span></div>
    </body></html>`;
    const generatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Manaus" }).format(new Date());
    const pdf = await pdfService.renderPdf({ label: `delivery-report-${projectId}`, buildHtml: async () => html, pdfOptions: {
      format: "A4", printBackground: true, displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `<div style="width:100%;padding:0 15mm;font-family:Arial,sans-serif;font-size:8px;color:#677161;display:flex;justify-content:space-between"><span>SAGEP · Gerado em ${generatedAt}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
    } });
    await prisma.project.update({ where: { id: projectId }, data: { deliveryReportGeneratedAt: new Date(), deliveryReportSignedAt: null, deliveryReportSignedLink: null } });
    return { pdf, projectCode: project.projectCode };
  }
}
