import type { CommitmentNoteReportData } from "./commitment-note-report.service.js";

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const money = (value: number | null) => value == null ? "Não informado" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const liquidatedMoney = (value: number | null) => value == null ? "Não liquidado" : money(value);
const paidMoney = (value: number | null) => value == null ? "Não pago" : money(value);
const date = (value: string | Date | null, time = false) => {
  if (!value) return "Não informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", dateStyle: "short", ...(time && { timeStyle: "short" }) }).format(parsed);
};
const statusLabel = (value: string) => ({ PAGA: "Paga", LIQUIDADA: "Liquidada", PARCIALMENTE_PAGA: "Parcialmente paga", PARCIALMENTE_LIQUIDADA: "Parcialmente liquidada", NAO_LIQUIDADA: "Não liquidada", A_CONFERIR: "A conferir", DIVERGENTE: "Divergente", ANULADA: "Anulada", PARCIALMENTE_ANULADA: "Parcialmente anulada" } as Record<string, string>)[value] ?? value;
const originLabel = (value: string) => ({ PROJECT: "Projeto", IMPORTED: "Importada", STANDALONE: "Avulsa" } as Record<string, string>)[value] ?? value;

function metric(label: string, value: string, detail: string, tone = "") {
  return `<article class="metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`;
}

function bars(items: Array<{ label: string; value: number; amount: number }>) {
  const max = Math.max(...items.map((item) => item.amount), 1);
  return items.slice(0, 8).map((item) => `<div class="bar"><div><strong>${esc(item.label)}</strong><span>${item.value} NE(s) · ${money(item.amount)}</span></div><i><b style="width:${Math.max(2, item.amount / max * 100)}%"></b></i></div>`).join("") || '<div class="empty">Sem dados no recorte.</div>';
}

function consolidated(report: CommitmentNoteReportData) {
  return `<section class="grid two">
    <article class="panel"><h2>Distribuição por situação</h2>${bars(report.charts.byStatus)}</article>
    <article class="panel"><h2>Execução por fornecedor</h2>${bars(report.charts.bySupplier)}</article>
  </section>
  <section class="panel page-break"><div class="section-head"><div><small>CARTEIRA ANALÍTICA</small><h2>Notas de Empenho do recorte</h2></div><span>${report.rows.length} registro(s)</span></div>
    <table><thead><tr><th>NE / origem</th><th>UG</th><th>Fornecedor</th><th>Empenhado</th><th>Liquidado</th><th>Pago</th><th>Situação</th><th>Atualização</th></tr></thead><tbody>
    ${report.rows.map((row) => `<tr><td><strong>${esc(row.number)}</strong><small>${esc(originLabel(row.origin))}${row.project ? ` · PRJ-${row.project.projectCode}` : ""}</small></td><td>${esc(row.managementUnit)}</td><td>${esc(row.supplierName)}<small>${esc(row.supplierCnpj || "CNPJ não informado")}</small></td><td>${money(row.current)}</td><td>${liquidatedMoney(row.liquidated)}</td><td>${paidMoney(row.paid)}${(row.deductions ?? 0) > 0 ? `<small>OB ${money(row.paidNet ?? null)} + DR/DF ${money(row.deductions ?? null)}</small>` : ""}</td><td><span class="status">${esc(statusLabel(row.status))}</span>${row.incomplete && row.status !== "A_CONFERIR" ? "<small>A conferir</small>" : ""}</td><td>${date(row.updatedAt, true)}</td></tr>`).join("")}
    </tbody></table>
  </section>`;
}

function individual(report: CommitmentNoteReportData) {
  const row = report.rows[0];
  if (!row) return '<section class="panel empty">Nenhuma Nota de Empenho encontrada.</section>';
  return `<section class="individual">
    <div class="identity"><div><small>NOTA DE EMPENHO</small><h2>${esc(row.number)}</h2><p>${esc(row.externalCode)}</p></div><span class="status big">${esc(statusLabel(row.status))}</span></div>
    <div class="metrics three">${metric("Empenhado", money(row.current), "Valor atual informado")}${metric("Liquidado", liquidatedMoney(row.liquidated), row.liquidationCompleted ? "NS localizada" : "Cobertura não confirmada")}${metric("Pago", paidMoney(row.paid), row.paymentCompleted ? "OB localizada" : "Cobertura não confirmada")}</div>
    <section class="grid two"><article class="panel"><h2>Identificação</h2><dl><dt>Fornecedor</dt><dd>${esc(row.supplierName)}</dd><dt>CNPJ</dt><dd>${esc(row.supplierCnpj || "Não informado")}</dd><dt>UG</dt><dd>${esc(row.managementUnit)}</dd><dt>Origem</dt><dd>${esc(originLabel(row.origin))}</dd><dt>Emissão</dt><dd>${date(row.issuedAt)}</dd>${row.project ? `<dt>Projeto</dt><dd>PRJ-${row.project.projectCode} · ${esc(row.project.title)}</dd>` : ""}</dl></article>
    <article class="panel"><h2>Conciliação financeira</h2><dl><dt>Repassado por OB</dt><dd>${paidMoney(row.paidNet ?? row.paid)}</dd><dt>Deduções DR/DF</dt><dd>${money(row.deductions ?? 0)}</dd><dt>Última atualização</dt><dd>${date(row.updatedAt, true)}</dd><dt>Conferência</dt><dd>${row.incomplete ? "Existem dados pendentes de confirmação" : "Dados consolidados"}</dd></dl></article></section>
    <section class="panel page-break"><div class="section-head"><div><small>RASTREABILIDADE</small><h2>Documentos financeiros relacionados</h2></div><span>${row.documents.length} documento(s)</span></div>
      <table><thead><tr><th>Documento</th><th>Fase</th><th>Espécie</th><th>Data</th><th>Valor atribuído</th></tr></thead><tbody>${row.documents.map((document) => `<tr><td><strong>${esc(document.number || document.externalCode)}</strong><small>${esc(document.externalCode)}</small></td><td>${esc(document.phase)}</td><td>${esc(document.species || "Não informada")}</td><td>${date(document.issuedAt)}</td><td>${money(document.amount)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">Nenhum documento relacionado salvo.</td></tr>'}</tbody></table>
    </section>
  </section>`;
}

export function renderCommitmentNoteReportHtml(report: CommitmentNoteReportData) {
  const individualMode = report.rows.length === 1 && report.filters.codes.length === 1;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;color:#263020;font:10px Arial,sans-serif;background:#fff}header{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;color:white;background:linear-gradient(120deg,#1d2916,#526331)}header img{width:58px;height:58px;object-fit:contain;background:#fff;border-radius:10px;padding:4px}header .brand{display:flex;gap:14px;align-items:center}header small,.section-head small,.identity small{font-size:8px;letter-spacing:1.5px}h1{font-size:22px;margin:4px 0}header p{margin:0;color:#d9e0d3}.meta{text-align:right;line-height:1.6}main{padding:14px 22px}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}.metrics.three{grid-template-columns:repeat(3,1fr)}.metric,.panel{border:1px solid #d8ddcf;border-radius:9px;padding:12px;background:#fff}.metric span{display:block;color:#6c7565;font-size:8px;text-transform:uppercase}.metric strong{display:block;margin:7px 0 4px;font-size:16px}.metric small,td small{display:block;margin-top:4px;color:#697064}.metric.warn{background:#fff8eb;border-color:#e9c574}.grid{display:grid;gap:10px}.grid.two{grid-template-columns:1fr 1fr;margin:12px 0}.panel h2{margin:0 0 10px;font-size:13px}.bar{margin:9px 0}.bar div{display:flex;justify-content:space-between;gap:10px}.bar span{color:#697064}.bar i{display:block;height:6px;margin-top:4px;border-radius:6px;background:#edf0e8;overflow:hidden}.bar b{display:block;height:100%;background:#70833c}.section-head,.identity{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.section-head h2,.identity h2{margin:3px 0;font-size:17px}.identity{padding:14px 2px}.status{display:inline-block;border-radius:99px;padding:3px 7px;background:#e8eddc;color:#425223;font-weight:bold}.status.big{font-size:12px;padding:7px 12px}table{width:100%;border-collapse:collapse}th{background:#293622;color:#fff;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.4px}th,td{padding:7px;border-bottom:1px solid #dfe3d9;vertical-align:top}td{line-height:1.35}dl{display:grid;grid-template-columns:115px 1fr;margin:0}dt,dd{margin:0;padding:6px;border-bottom:1px solid #e6e9e1}dt{color:#697064}.empty{text-align:center;color:#737b6c;padding:20px}.notice{margin-top:12px;padding:10px;border:1px solid #d8ddcf;border-radius:8px;color:#5f6859;background:#f7f8f5}.page-break{break-inside:auto}tr,.metric,.panel{break-inside:avoid}
  </style></head><body><header><div class="brand">${report.branding.ctaLogo ? `<img src="${report.branding.ctaLogo}">` : ""}<div><small>4º CENTRO DE TELEMÁTICA DE ÁREA · DIVISÃO TÉCNICA</small><h1>${individualMode ? "Ficha Financeira da Nota de Empenho" : "Posição das Notas de Empenho"}</h1><p>Execução, liquidação, pagamento e rastreabilidade documental</p></div></div><div class="meta"><strong>${esc(report.scopeLabel)}</strong><br>Emitido em ${date(report.generatedAt, true)}<br>Responsável: ${esc(report.generatedBy)}</div></header><main>
    ${!individualMode ? `<div class="metrics">${metric("Notas de Empenho", String(report.summary.total), "registros únicos")}${metric("Empenhado", money(report.summary.committed), `${report.summary.coverage.committed} com valor utilizável`)}${metric("Liquidado", money(report.summary.liquidated), `${report.summary.coverage.liquidated} com valor utilizável`)}${metric("Pago", money(report.summary.paid), `${report.summary.coverage.paid} com valor utilizável`)}${metric("A conferir", String(report.summary.pending), "ausências ou divergências", report.summary.pending ? "warn" : "")}</div>` : ""}
    ${individualMode ? individual(report) : consolidated(report)}
    <div class="notice">Fonte: dados financeiros persistidos no SAGEP. “Não liquidado” e “Não pago” indicam ausência desses registros na última atualização; uma nova sincronização pode atualizar a situação. Os totais excluem registros inconsistentes e preservam uma única ocorrência por NE.</div>
  </main></body></html>`;
}
