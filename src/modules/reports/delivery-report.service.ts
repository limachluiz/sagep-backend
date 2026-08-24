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
      @page{size:A4;margin:18mm 16mm 18mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172018;font-size:10.5pt;line-height:1.45}header{text-align:center;border-bottom:3px solid #556b2f;padding-bottom:12px;margin-bottom:20px}header img{width:62px;height:62px;object-fit:contain}h1{font-size:16pt;margin:8px 0 2px;text-transform:uppercase}h2{font-size:12pt;color:#415523;border-bottom:1px solid #a9b798;padding-bottom:5px;margin-top:22px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field{border:1px solid #d5dccd;border-radius:5px;padding:8px}.field span{display:block;color:#66705f;font-size:8pt;text-transform:uppercase}.field b{display:block;margin-top:2px}table{width:100%;border-collapse:collapse;font-size:9pt}th,td{border:1px solid #cdd6c5;padding:6px;text-align:left}th{background:#556b2f;color:white}.evidence{break-inside:avoid;margin:12px 0;border:1px solid #d5dccd;border-radius:6px;overflow:hidden}.evidence img{display:block;width:100%;max-height:160mm;object-fit:contain;background:#f5f7f3}.evidence div{padding:9px}.evidence p{margin:4px 0}.evidence small{color:#66705f}.signature{margin-top:44px;text-align:center}.signature:before{content:"";display:block;border-top:1px solid #222;width:70%;margin:0 auto 7px}footer{position:fixed;bottom:-10mm;left:0;right:0;text-align:center;color:#677161;font-size:8pt}</style></head><body>
      <header>${logo ? `<img src="${logo}">` : ""}<div>MINISTÉRIO DA DEFESA · EXÉRCITO BRASILEIRO</div><b>4º CENTRO DE TELEMÁTICA DE ÁREA</b><h1>Relatório Técnico de Conclusão e Entrega do Serviço</h1><div>Projeto PRJ-${project.projectCode}</div></header>
      <h2>1. Identificação</h2><div class="grid"><div class="field"><span>Projeto</span><b>${escape(project.title)}</b></div><div class="field"><span>OM atendida</span><b>${escape(project.om ? `${project.om.sigla} — ${project.om.name}` : "Não informada")}</b></div><div class="field"><span>Tipo</span><b>${escape(project.projectType === "CFTV" ? "CFTV" : "Fibra óptica / ponto lógico")}</b></div><div class="field"><span>Período de execução</span><b>${date(project.executionStartedAt)} a ${date(project.serviceCompletedAt)}</b></div><div class="field"><span>Nota de Empenho</span><b>${escape(commitment?.number || project.commitmentNoteNumber || "Não informada")}</b></div><div class="field"><span>Ordem de Serviço</span><b>${escape(serviceOrder?.serviceOrderNumber || project.serviceOrderNumber || "Não informada")}</b></div></div>
      <h2>2. Objeto e escopo</h2><p>${escape(project.description || "Serviço executado conforme documentação vinculada ao projeto.")}</p>
      <h2>3. Itens executados</h2><table><thead><tr><th>Item</th><th>Descrição</th><th>Un.</th><th>Qtd.</th><th>Valor</th></tr></thead><tbody>${items.map((item: any) => `<tr><td>${escape(item.itemCode || item.referenceCode || "—")}</td><td>${escape(item.description)}</td><td>${escape(item.supplyUnit || item.unit || "—")}</td><td>${escape(item.quantityRequested || item.quantity || "—")}</td><td>${money(item.totalPrice || item.subtotal)}</td></tr>`).join("") || `<tr><td colspan="5">Nenhum item estruturado localizado.</td></tr>`}</tbody></table>
      <h2>4. Evidências técnicas</h2>${evidenceBlocks.join("")}
      <h2>5. Situação das tarefas</h2><table><thead><tr><th>Tarefa</th><th>Situação</th><th>Responsável</th></tr></thead><tbody>${project.tasks.map((task) => `<tr><td>TSK-${task.taskCode} · ${escape(task.title)}</td><td>${escape(task.status)}</td><td>${escape(task.assignee?.name || "Não atribuído")}</td></tr>`).join("")}</tbody></table>
      <h2>6. Conclusão técnica</h2><p>Os serviços e evidências apresentados neste relatório correspondem aos registros mantidos no SAGEP. As ressalvas e pendências eventualmente existentes permanecem registradas nas tarefas e documentos vinculados ao projeto.</p>
      <div class="signature"><b>${escape(project.owner.rank ? `${project.owner.rank} ${project.owner.warName || project.owner.name}` : project.owner.name)}</b><br>Responsável pelo projeto</div><footer>SAGEP · Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Manaus" }).format(new Date())}</footer>
    </body></html>`;
    const pdf = await pdfService.renderPdf({ label: `delivery-report-${projectId}`, buildHtml: async () => html, pdfOptions: { format: "A4", printBackground: true, displayHeaderFooter: false } });
    await prisma.project.update({ where: { id: projectId }, data: { deliveryReportGeneratedAt: new Date(), deliveryReportSignedAt: null, deliveryReportSignedLink: null } });
    return { pdf, projectCode: project.projectCode };
  }
}
