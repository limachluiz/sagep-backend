export type ConsolidatedReportType = "executive" | "operational" | "financial";

const STAGE_LABELS: Record<string, string> = {
  ESTIMATIVA_PRECO: "Estimativa de preço",
  AGUARDANDO_NOTA_CREDITO: "Aguardando NC",
  DIEX_REQUISITORIO: "DIEx requisitório",
  AGUARDANDO_NOTA_EMPENHO: "Aguardando NE",
  OS_LIBERADA: "OS liberada",
  AGUARDANDO_OS_ASSINADA: "Aguardando OS assinada",
  AGUARDANDO_INICIO_EXECUCAO: "Aguardando início",
  SERVICO_EM_EXECUCAO: "Serviço em execução",
  ANALISANDO_AS_BUILT: "Analisando As-Built",
  ATESTAR_NF: "Atestar NF",
  SERVICO_CONCLUIDO: "Serviço concluído",
};

const TYPE_LABELS: Record<string, string> = {
  CFTV: "CFTV",
  FIBRA_OPTICA_PONTO_LOGICO: "Fibra óptica / ponto lógico",
};

const REPORT_META: Record<ConsolidatedReportType, {
  title: string;
  subtitle: string;
  audience: string;
}> = {
  executive: {
    title: "Relatório Executivo da Seção de Projetos",
    subtitle: "Síntese da carteira, desempenho, recursos e riscos para tomada de decisão",
    audience: "Comando e Chefia da Divisão Técnica",
  },
  operational: {
    title: "Relatório Operacional da Seção de Projetos",
    subtitle: "Fluxo de trabalho, prazos, pendências, responsáveis e próximas ações",
    audience: "Chefia e equipe da Seção de Projetos",
  },
  financial: {
    title: "Relatório Financeiro da Seção de Projetos",
    subtitle: "Posição consolidada da carteira, comprometimento e distribuição dos recursos",
    audience: "Comando, Chefia e gestão de recursos",
  },
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function amount(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function date(value: unknown, includeTime = false) {
  if (!value) return "Não informado";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Manaus",
    dateStyle: "short",
    ...(includeTime && { timeStyle: "short" }),
  }).format(parsed);
}

function stage(value: string) {
  return STAGE_LABELS[value] ?? value;
}

function type(value: string) {
  return TYPE_LABELS[value] ?? value;
}

function metric(label: string, value: string | number, detail: string, tone = "") {
  return `<div class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function numberBars(
  items: Array<{ label: string; count: number; percentage?: number }>,
  label: (value: string) => string = stage,
) {
  if (!items.length) return '<div class="empty">Nenhum dado disponível.</div>';
  const max = Math.max(...items.map((item) => item.count), 1);
  return items.slice(0, 9).map((item) => `<div class="bar-row">
    <div class="bar-label"><span>${escapeHtml(label(item.label))}</span><strong>${item.count}</strong></div>
    <div class="bar-track"><i style="width:${Math.max((item.count / max) * 100, 2)}%"></i></div>
  </div>`).join("");
}

function amountBars(items: Array<{ label: string; count: number; totalAmount: string }>) {
  if (!items.length) return '<div class="empty">Nenhum dado disponível.</div>';
  const max = Math.max(...items.map((item) => Number(item.totalAmount)), 1);
  return items.slice(0, 8).map((item) => `<div class="bar-row">
    <div class="bar-label"><span>${escapeHtml(item.label)} · ${item.count} projeto(s)</span><strong>${amount(item.totalAmount)}</strong></div>
    <div class="bar-track gold"><i style="width:${Math.max((Number(item.totalAmount) / max) * 100, 2)}%"></i></div>
  </div>`).join("");
}

function healthPanel(report: any) {
  const critical = report.summary.projectsCritical ?? 0;
  const warning = report.summary.projectsWarning ?? 0;
  const regular = Math.max(report.summary.projectsOpen - critical - warning, 0);
  const total = Math.max(report.summary.projectsOpen, 1);
  const degree = (value: number) => Math.round((value / total) * 360);
  const criticalEnd = degree(critical);
  const warningEnd = criticalEnd + degree(warning);
  return `<div class="health-layout">
    <div class="donut" style="background:conic-gradient(#a6433b 0 ${criticalEnd}deg,#c88d2c ${criticalEnd}deg ${warningEnd}deg,#60713b ${warningEnd}deg 360deg)"><div><strong>${report.summary.projectsOpen}</strong><span>ativos</span></div></div>
    <div class="legend">
      <div><i class="red"></i><span>Críticos</span><strong>${critical}</strong></div>
      <div><i class="amber"></i><span>Atenção</span><strong>${warning}</strong></div>
      <div><i class="green"></i><span>Regulares</span><strong>${regular}</strong></div>
    </div>
  </div>`;
}

function attention(report: any, heading: string) {
  const items = report.commandAttention ?? [];
  return `<section class="section"><div class="section-head"><div><span>PRIORIDADES</span><h2>${escapeHtml(heading)}</h2></div><p>Prazo vencido ou ausência de atualização há pelo menos ${report.filter.staleDays} dias.</p></div>
    <div class="attention-grid">${items.length ? items.map((project: any) => `<article class="attention ${project.attention.level.toLowerCase()}">
      <div><strong>PRJ-${project.projectCode} · ${escapeHtml(project.title)}</strong><span>${escapeHtml(project.om?.sigla ?? "OM não definida")} · ${escapeHtml(stage(project.stage))}</span></div>
      <b>${escapeHtml(project.attention.label)}</b>
    </article>`).join("") : '<div class="all-clear">Nenhuma situação crítica identificada para o recorte selecionado.</div>'}</div>
  </section>`;
}

function projectsTable(report: any, reportType: ConsolidatedReportType) {
  const rows = report.projects ?? [];
  const financial = reportType === "financial";
  return `<section class="section page-break"><div class="section-head"><div><span>CARTEIRA ATIVA</span><h2>Detalhamento para acompanhamento</h2></div><p>${rows.length} projeto(s) em andamento.</p></div>
    ${rows.length ? `<table><thead><tr><th>Projeto / OM</th><th>Etapa e responsável</th>${financial ? "<th>Estimado</th><th>Empenhado / OS</th>" : "<th>Prazo</th><th>Tarefas</th>"}<th>Próxima ação</th><th>Situação</th></tr></thead><tbody>${rows.map((project: any) => `<tr>
      <td><strong>PRJ-${project.projectCode} · ${escapeHtml(project.title)}</strong><small>${escapeHtml(project.om?.sigla ?? "OM não definida")} · ${escapeHtml(type(project.projectType))}</small></td>
      <td><strong>${escapeHtml(stage(project.stage))}</strong><small>${escapeHtml(project.owner.displayName)}</small></td>
      ${financial ? `<td class="money">${amount(project.estimatedAmount)}</td><td class="money">${amount(project.committedAmount)}<small>OS: ${amount(project.orderedAmount)}</small></td>` : `<td>${date(project.dates.plannedEndDate)}</td><td>${project.tasks.open} abertas${project.tasks.overdue ? `<small class="danger">${project.tasks.overdue} vencida(s)</small>` : ""}</td>`}
      <td>${escapeHtml(project.nextAction.label)}</td>
      <td><span class="pill ${project.attention.level.toLowerCase()}">${escapeHtml(project.attention.label)}</span></td>
    </tr>`).join("")}</tbody></table>` : '<div class="empty">Nenhum projeto em andamento encontrado.</div>'}
  </section>`;
}

function executiveBody(report: any) {
  const summary = report.summary;
  return `<section class="metrics six">
    ${metric("Em andamento", summary.projectsOpen, "carteira ativa")}
    ${metric("Em execução", summary.projectsInExecution, "serviços em campo")}
    ${metric("Concluídos", summary.projectsCompleted, "entregas finalizadas")}
    ${metric("Valor em andamento", amount(summary.totalInProgressAmount), "projetos abertos")}
    ${metric("Valor empenhado", amount(summary.totalCommittedAmount), `${summary.commitmentRate}% da carteira`)}
    ${metric("Valor concluído", amount(summary.totalCompletedAmount), "projetos entregues")}
  </section>
  <section class="section"><div class="section-head"><div><span>VISÃO CONSOLIDADA</span><h2>Carteira, recursos e saúde</h2></div><p>Leitura rápida dos principais direcionadores da Seção de Projetos.</p></div>
    <div class="panels three"><div class="panel"><h3>Projetos por etapa</h3>${numberBars(report.charts.byStage)}</div><div class="panel"><h3>Valor em andamento por UF</h3>${amountBars(report.charts.byRegion)}</div><div class="panel"><h3>Saúde da carteira</h3>${healthPanel(report)}</div></div>
  </section>
  ${attention(report, "Pontos que demandam decisão do Comando")}
  ${projectsTable(report, "executive")}`;
}

function operationalBody(report: any) {
  const summary = report.operationalSummary;
  const projectSummary = report.summary;
  const ownerRows = report.charts.byOwner ?? [];
  return `<section class="metrics six">
    ${metric("Projetos ativos", projectSummary.projectsOpen, "fluxos em andamento")}
    ${metric("Em execução", projectSummary.projectsInExecution, "serviços em campo")}
    ${metric("Tarefas abertas", summary.openTasks, "carga operacional")}
    ${metric("Tarefas vencidas", summary.overdueTasks, "ação imediata", summary.overdueTasks ? "critical" : "")}
    ${metric("Projetos atrasados", summary.overdueProjects, "prazo ou tarefa vencida", summary.overdueProjects ? "critical" : "")}
    ${metric("Sem atualização", summary.staleProjects, `há ${report.filter.staleDays}+ dias`, summary.staleProjects ? "warning" : "")}
  </section>
  <section class="section"><div class="section-head"><div><span>CONTROLE OPERACIONAL</span><h2>Gargalos, carga e continuidade do fluxo</h2></div><p>Indicadores para priorização diária da equipe.</p></div>
    <div class="panels three"><div class="panel"><h3>Fila por etapa</h3>${numberBars(report.charts.byStage)}</div><div class="panel"><h3>Carga por responsável</h3>${numberBars(ownerRows, (value) => value)}</div><div class="panel"><h3>Saúde operacional</h3>${healthPanel(report)}<p class="note">${summary.projectsWithoutOpenTasks} projeto(s) não possuem tarefa aberta registrada.</p></div></div>
  </section>
  ${attention(report, "Fila prioritária da Seção de Projetos")}
  ${projectsTable(report, "operational")}`;
}

function financialBody(report: any) {
  const summary = report.summary;
  const portfolio = Number(summary.totalPortfolioAmount);
  const committed = Number(summary.totalCommittedAmount);
  const ordered = Number(summary.totalOrderedAmount);
  const completed = Number(summary.totalCompletedAmount);
  const inProgress = Number(summary.totalInProgressAmount);
  const denominator = Math.max(portfolio, 1);
  const committedShare = Math.min((committed / denominator) * 100, 100);
  const completedShare = Math.min((completed / denominator) * 100, 100);
  return `<section class="metrics six">
    ${metric("Carteira estimada", amount(summary.totalPortfolioAmount), "abertos + concluídos")}
    ${metric("Em andamento", amount(summary.totalInProgressAmount), "demanda ativa")}
    ${metric("Empenhado", amount(summary.totalCommittedAmount), `${summary.commitmentRate}% da carteira`)}
    ${metric("Formalizado em OS", amount(summary.totalOrderedAmount), "ordens emitidas")}
    ${metric("Concluído", amount(summary.totalCompletedAmount), "entregas finalizadas")}
    ${metric("Saldo não empenhado", amount(summary.totalUncommittedAmount), "diferença gerencial")}
  </section>
  <section class="section"><div class="section-head"><div><span>POSIÇÃO FINANCEIRA</span><h2>Conversão e distribuição dos recursos</h2></div><p>Valores extraídos das estimativas, Notas de Empenho e Ordens de Serviço registradas.</p></div>
    <div class="panels three"><div class="panel"><h3>Conversão da carteira</h3><div class="big-progress"><span>Empenhado</span><strong>${amount(committed)}</strong><div><i style="width:${committedShare}%"></i></div><small>${committedShare.toFixed(1)}% do valor estimado · ${amount(ordered)} formalizados em OS</small></div><div class="big-progress"><span>Concluído</span><strong>${amount(completed)}</strong><div class="gold"><i style="width:${completedShare}%"></i></div><small>${completedShare.toFixed(1)}% do valor estimado</small></div></div><div class="panel"><h3>Valor por UF</h3>${amountBars(report.charts.byRegion)}</div><div class="panel"><h3>Composição por tipo</h3>${amountBars(report.charts.byType.map((item: any) => ({ ...item, label: type(item.label) })))}</div></div>
  </section>
  <section class="section"><div class="section-head"><div><span>LEITURA GERENCIAL</span><h2>Indicadores para decisão financeira</h2></div><p>Interpretação automática do retrato atual da carteira.</p></div><div class="insights">
    <article><span>01</span><div><strong>Saldo ainda não empenhado</strong><p>${amount(summary.totalUncommittedAmount)} da carteira estimada ainda não possui Nota de Empenho registrada.</p></div></article>
    <article><span>02</span><div><strong>Recursos vinculados a projetos ativos</strong><p>${amount(inProgress)} permanecem associados a projetos em andamento e exigem acompanhamento até a conclusão.</p></div></article>
    <article><span>03</span><div><strong>Entregas consolidadas</strong><p>${amount(completed)} correspondem a ${summary.projectsCompleted} projeto(s) concluído(s) no recorte.</p></div></article>
  </div></section>
  ${projectsTable(report, "financial")}`;
}

export function renderConsolidatedProjectsReportHtml(report: any) {
  const reportType = report.reportType as ConsolidatedReportType;
  const meta = REPORT_META[reportType];
  const body = reportType === "operational"
    ? operationalBody(report)
    : reportType === "financial"
      ? financialBody(report)
      : executiveBody(report);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${escapeHtml(meta.title)}</title><style>
    *{box-sizing:border-box} @page{size:A4 landscape;margin:9mm 9mm 11mm} body{margin:0;color:#26301f;font:9px/1.35 Arial,Helvetica,sans-serif;background:#fff} header{display:flex;align-items:center;justify-content:space-between;gap:22px;padding:15px 18px;color:#fff;border-radius:12px;background:linear-gradient(135deg,#25301d,#48572d 68%,#74784b)} .brand{display:flex;align-items:center;gap:13px}.mark{display:grid;width:56px;height:64px;place-items:center;border:1px solid rgba(255,255,255,.32);border-radius:11px;background:#fff}.mark img{max-width:46px;max-height:56px}.eyebrow{color:#d8dfbd;font-size:7.5px;font-weight:800;letter-spacing:1.35px;text-transform:uppercase} h1{margin:3px 0 2px;font-size:20px;line-height:1.1} header p{margin:0;color:#e5ead6}.meta{min-width:235px;padding-left:18px;border-left:1px solid rgba(255,255,255,.27)}.meta div+div{margin-top:3px}.meta b{color:#dce4c7}.audience{display:inline-block;margin-bottom:5px;padding:3px 7px;border-radius:20px;background:rgba(255,255,255,.12);font-size:7px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
    .metrics{display:grid;gap:7px;margin-top:9px}.metrics.six{grid-template-columns:repeat(6,1fr)}.metrics.five{grid-template-columns:repeat(5,1fr)}.metric{min-height:68px;padding:10px;border:1px solid #dfe4d5;border-radius:9px;background:#f8faf5}.metric>span{display:block;color:#6c7463;font-size:7.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase}.metric strong{display:block;margin-top:7px;color:#2d3821;font-size:15px;line-height:1.08}.metric small{display:block;margin-top:4px;color:#7a8172}.metric.warning{border-color:#e6c275;background:#fff8e9}.metric.critical{border-color:#e4a29e;background:#fff3f2}
    .section{margin-top:14px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:6px}.section-head span{color:#7a844f;font-size:7px;font-weight:800;letter-spacing:1px}.section-head h2{margin:1px 0 0;font-size:13px}.section-head p{max-width:48%;margin:0;color:#707869;text-align:right}.panels{display:grid;gap:8px}.panels.three{grid-template-columns:1.1fr 1fr .9fr}.panel{min-height:128px;padding:11px;border:1px solid #dfe4d7;border-radius:9px;break-inside:avoid}.panel h3{margin:0 0 8px;font-size:10px}.bar-row+.bar-row{margin-top:6px}.bar-label{display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;font-size:7.7px}.bar-label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar-track{height:5px;overflow:hidden;border-radius:20px;background:#edf0e8}.bar-track i{display:block;height:100%;border-radius:inherit;background:#60713b}.bar-track.gold i{background:#b48a31}
    .health-layout{display:flex;align-items:center;justify-content:center;gap:16px;padding-top:3px}.donut{display:grid;width:76px;height:76px;place-items:center;border-radius:50%}.donut>div{display:flex;width:52px;height:52px;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;background:#fff}.donut strong{font-size:16px}.donut span{color:#788071;font-size:7px}.legend{min-width:95px}.legend div{display:grid;grid-template-columns:7px 1fr auto;align-items:center;gap:5px;padding:4px 0;border-bottom:1px solid #eef0e9}.legend i{width:7px;height:7px;border-radius:2px}.red{background:#a6433b}.amber{background:#c88d2c}.green{background:#60713b}.note{margin:7px 0 0;color:#747c6c;font-size:7.5px;text-align:center}
    .attention-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.attention{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 9px;border-left:3px solid #c88d2c;border-radius:6px;background:#fff8e8;break-inside:avoid}.attention.critical{border-color:#a6433b;background:#fff2f1}.attention strong,.attention span{display:block}.attention span{margin-top:2px;color:#747b6d;font-size:7.5px}.attention b{color:#765014;font-size:7.5px;white-space:nowrap}.attention.critical b{color:#8c342f}.all-clear,.empty{padding:15px;border:1px dashed #cdd3c4;border-radius:8px;color:#68715f;text-align:center;background:#f8faf5}.attention-grid>.all-clear{grid-column:1/-1}
    table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #dfe3d8;border-radius:8px;font-size:7.5px;overflow:hidden}thead{display:table-header-group}th{padding:6px 7px;color:#fff;text-align:left;background:#4d5c31}td{padding:6px 7px;border-top:1px solid #e5e8df;vertical-align:top}tbody tr:nth-child(even){background:#f8faf5}td strong,td small{display:block}td small{margin-top:2px;color:#747c6d}.money{font-weight:700;white-space:nowrap}.danger{color:#a33d36}.pill{display:inline-block;padding:2px 5px;border-radius:20px;color:#4f5e36;background:#edf2e3;white-space:nowrap}.pill.warning{color:#7b530f;background:#fff0c7}.pill.critical{color:#8d332d;background:#ffe1df}.page-break{break-before:auto}.big-progress+.big-progress{margin-top:13px}.big-progress>span,.big-progress>strong{display:block}.big-progress>span{color:#6e7668;font-size:7.5px;font-weight:700;text-transform:uppercase}.big-progress>strong{margin:3px 0;font-size:12px}.big-progress>div{height:8px;overflow:hidden;border-radius:20px;background:#edf0e8}.big-progress i{display:block;height:100%;background:#60713b}.big-progress .gold i{background:#b48a31}.big-progress small{display:block;margin-top:3px;color:#788071}.insights{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.insights article{display:flex;gap:9px;padding:10px;border:1px solid #dfe4d7;border-radius:8px;background:#f8faf5}.insights article>span{display:grid;width:24px;height:24px;flex:0 0 auto;place-items:center;border-radius:6px;color:#fff;font-weight:800;background:#59683a}.insights strong{font-size:8.5px}.insights p{margin:3px 0 0;color:#6f7768}
    footer{display:flex;justify-content:space-between;margin-top:12px;padding-top:6px;border-top:1px solid #dfe3d8;color:#788071;font-size:7px}
  </style></head><body>
    <header><div class="brand"><div class="mark">${report.branding?.ctaLogo ? `<img src="${report.branding.ctaLogo}" alt="Brasão do 4º CTA"/>` : "4º CTA"}</div><div><div class="eyebrow">4º Centro de Telemática de Área · Seção de Projetos</div><h1>${escapeHtml(meta.title)}</h1><p>${escapeHtml(meta.subtitle)}</p></div></div><div class="meta"><span class="audience">${escapeHtml(meta.audience)}</span><div><b>Escopo:</b> ${escapeHtml(report.filter.scope)}</div><div><b>Referência:</b> ${escapeHtml(report.filter.label)}</div><div><b>Emitido:</b> ${date(report.generatedAt,true)}</div><div><b>Responsável:</b> ${escapeHtml(report.generatedBy.displayName)}</div></div></header>
    ${body}
    <footer><span>4º Centro de Telemática de Área · Seção de Projetos</span><span>Documento gerado pelo SAGEP em ${date(report.generatedAt,true)}</span></footer>
  </body></html>`;
}
