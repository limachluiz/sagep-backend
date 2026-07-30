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
};

const TYPE_LABELS: Record<string, string> = {
  CFTV: "CFTV",
  FIBRA_OPTICA_PONTO_LOGICO: "Fibra óptica / ponto lógico",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatAmount(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value: unknown, includeTime = false) {
  if (!value) return "Não informado";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Manaus",
    dateStyle: "short",
    ...(includeTime && { timeStyle: "short" }),
  }).format(date);
}

function labelForStage(stage: string) {
  return STAGE_LABELS[stage] ?? stage;
}

function renderBars(
  items: Array<{ label: string; count: number; percentage: number }>,
) {
  if (!items.length) return '<p class="empty">Nenhum dado disponível.</p>';
  return items
    .slice(0, 8)
    .map(
      (item) => `<div class="bar-row">
        <div class="bar-label"><span>${escapeHtml(labelForStage(item.label))}</span><strong>${item.count}</strong></div>
        <div class="bar-track"><span style="width:${Math.max(item.percentage, 2)}%"></span></div>
      </div>`,
    )
    .join("");
}

function renderRegionBars(
  items: Array<{
    label: string;
    count: number;
    totalAmount: string;
    percentage: number;
  }>,
) {
  if (!items.length) return '<p class="empty">Nenhum dado disponível.</p>';
  const max = Math.max(...items.map((item) => Number(item.totalAmount)), 1);
  return items
    .slice(0, 6)
    .map(
      (item) => `<div class="bar-row">
        <div class="bar-label"><span>${escapeHtml(item.label)} · ${item.count} projeto(s)</span><strong>${formatAmount(item.totalAmount)}</strong></div>
        <div class="bar-track gold"><span style="width:${Math.max((Number(item.totalAmount) / max) * 100, 2)}%"></span></div>
      </div>`,
    )
    .join("");
}

function renderAttention(items: any[]) {
  if (!items.length) {
    return '<div class="all-clear">Nenhuma situação crítica ou projeto sem atualização no período.</div>';
  }
  return items
    .map(
      (project) => `<div class="attention-item ${project.attention.level.toLowerCase()}">
        <div>
          <strong>PRJ-${escapeHtml(project.projectCode)} · ${escapeHtml(project.title)}</strong>
          <span>${escapeHtml(project.om?.sigla ?? "OM não definida")} · ${escapeHtml(labelForStage(project.stage))}</span>
        </div>
        <div class="attention-reason">${escapeHtml(project.attention.label)}</div>
      </div>`,
    )
    .join("");
}

function renderProjects(items: any[]) {
  if (!items.length) {
    return '<div class="all-clear">Nenhum projeto em andamento encontrado para os filtros informados.</div>';
  }
  return items
    .map(
      (project, index) => `<article class="project-card">
        <div class="project-rank">${String(index + 1).padStart(2, "0")}</div>
        <div class="project-main">
          <div class="project-title-row">
            <div>
              <h3>PRJ-${escapeHtml(project.projectCode)} · ${escapeHtml(project.title)}</h3>
              <p>${escapeHtml(project.om?.sigla ?? "OM não definida")} · ${escapeHtml(project.om ? `${project.om.cityName}/${project.om.stateUf}` : "Local não definido")} · ${escapeHtml(TYPE_LABELS[project.projectType] ?? "Tipo não informado")}</p>
            </div>
            <span class="risk ${project.attention.level.toLowerCase()}">${escapeHtml(project.attention.label)}</span>
          </div>
          <div class="project-grid">
            <div><span>Etapa atual</span><strong>${escapeHtml(labelForStage(project.stage))}</strong></div>
            <div><span>Responsável</span><strong>${escapeHtml(project.owner.displayName)}</strong></div>
            <div><span>Valor estimado</span><strong>${formatAmount(project.estimatedAmount)}</strong></div>
            <div><span>Prazo</span><strong>${formatDate(project.dates.plannedEndDate)}</strong></div>
            <div><span>Tarefas abertas</span><strong>${project.tasks.open}${project.tasks.overdue ? ` (${project.tasks.overdue} atrasada(s))` : ""}</strong></div>
            <div><span>Próxima ação</span><strong>${escapeHtml(project.nextAction.label)}</strong></div>
          </div>
          <div class="progress-line">
            <div><span>Avanço do fluxo</span><strong>${project.progress}%</strong></div>
            <div class="progress-track"><span style="width:${project.progress}%"></span></div>
          </div>
        </div>
      </article>`,
    )
    .join("");
}

export function renderExecutiveProjectsReportHtml(report: any) {
  const summary = report.summary;
  const attention = report.charts.attention;
  const attentionTotal = attention.reduce(
    (sum: number, item: { count: number }) => sum + item.count,
    0,
  );
  const critical = attention.find((item: any) => item.label === "Críticos")?.count ?? 0;
  const warning = attention.find((item: any) => item.label === "Atenção")?.count ?? 0;
  const regular = attention.find((item: any) => item.label === "Regulares")?.count ?? 0;
  const healthPercentage = (value: number) =>
    attentionTotal ? Number(((value / attentionTotal) * 100).toFixed(0)) : 0;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Executivo da Seção de Projetos</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4 landscape; margin: 10mm 9mm 11mm; }
    body { margin: 0; color: #25301d; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.35; background: #fff; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 16px 18px; color: #fff; border-radius: 12px; background: linear-gradient(135deg, #26321d, #4f5e31 70%, #6e7747); }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-mark { display: grid; width: 58px; height: 66px; flex: 0 0 auto; place-items: center; overflow: hidden; border: 1px solid rgba(255,255,255,.35); border-radius: 12px; background: rgba(255,255,255,.96); }
    .brand-mark img { display: block; max-width: 47px; max-height: 58px; object-fit: contain; }
    .eyebrow { color: #dce3c0; font-size: 8px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
    h1 { margin: 3px 0 2px; font-size: 22px; line-height: 1.1; }
    header p { margin: 0; color: #e5ead5; }
    .meta { min-width: 225px; padding-left: 20px; border-left: 1px solid rgba(255,255,255,.3); }
    .meta div + div { margin-top: 4px; }
    .summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 10px; }
    .metric { min-height: 74px; padding: 11px; border: 1px solid #dfe4d4; border-radius: 10px; background: #f8faf5; }
    .metric span { display: block; color: #68715d; font-size: 8px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
    .metric strong { display: block; margin-top: 8px; color: #2d3821; font-size: 17px; line-height: 1.1; }
    .metric small { display: block; margin-top: 4px; color: #78806e; }
    .metric.warn { border-color: #e8c77d; background: #fff9ea; }
    .metric.critical { border-color: #e8a5a1; background: #fff3f2; }
    .section-title { display: flex; align-items: end; justify-content: space-between; margin: 16px 0 7px; }
    .section-title h2 { margin: 0; font-size: 14px; }
    .section-title p { margin: 0; color: #707969; font-size: 9px; }
    .charts { display: grid; grid-template-columns: 1.15fr 1.05fr .9fr; gap: 9px; }
    .panel { padding: 12px; border: 1px solid #e0e4d8; border-radius: 10px; break-inside: avoid; }
    .panel h3 { margin: 0 0 9px; font-size: 11px; }
    .bar-row + .bar-row { margin-top: 7px; }
    .bar-label { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 3px; font-size: 8.5px; }
    .bar-label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track, .progress-track { height: 6px; overflow: hidden; border-radius: 20px; background: #edf0e8; }
    .bar-track span, .progress-track span { display: block; height: 100%; border-radius: inherit; background: #65733d; }
    .bar-track.gold span { background: #b38c36; }
    .health-stack { display: flex; height: 9px; overflow: hidden; border-radius: 20px; background: #edf0e8; }
    .health-stack span { min-width: 0; height: 100%; }
    .health-list { display: grid; gap: 5px; margin-top: 10px; }
    .health-item { display: grid; grid-template-columns: 8px 1fr auto; align-items: center; gap: 6px; padding: 5px 7px; border-radius: 6px; background: #f8faf5; }
    .health-item i { width: 8px; height: 8px; border-radius: 2px; }
    .health-item span { color: #616a59; font-size: 8px; }
    .health-item strong { font-size: 10px; }
    .health-note { margin: 8px 0 0; color: #737b6c; font-size: 7.5px; }
    .attention-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
    .attention-item { display: flex; justify-content: space-between; gap: 12px; padding: 7px 9px; border-left: 3px solid #cf9730; border-radius: 6px; background: #fff9ea; break-inside: avoid; }
    .attention-item.critical { border-color: #a83f37; background: #fff3f2; }
    .attention-item strong, .attention-item span { display: block; }
    .attention-item span { margin-top: 2px; color: #737b6c; font-size: 8px; }
    .attention-reason { flex: 0 0 auto; align-self: center; color: #7b4f12; font-weight: 700; }
    .project-card { display: flex; gap: 10px; padding: 10px; border: 1px solid #dfe4d6; border-radius: 9px; break-inside: avoid; page-break-inside: avoid; }
    .project-card + .project-card { margin-top: 7px; }
    .project-rank { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border-radius: 7px; color: #fff; font-size: 10px; font-weight: 800; background: #4f5e31; }
    .project-main { min-width: 0; flex: 1; }
    .project-title-row { display: flex; justify-content: space-between; gap: 14px; }
    .project-title-row h3 { margin: 0; font-size: 11px; }
    .project-title-row p { margin: 2px 0 0; color: #6e7668; font-size: 8px; }
    .risk { height: fit-content; padding: 3px 7px; border-radius: 20px; color: #526038; font-size: 7.5px; font-weight: 800; background: #edf2e3; white-space: nowrap; }
    .risk.warning { color: #805510; background: #fff0c9; }
    .risk.critical { color: #8f332d; background: #ffe2df; }
    .project-grid { display: grid; grid-template-columns: 1.05fr .9fr .8fr .65fr .65fr 1.25fr; gap: 8px; margin-top: 8px; }
    .project-grid span { display: block; color: #7b8275; font-size: 7px; font-weight: 700; text-transform: uppercase; }
    .project-grid strong { display: block; margin-top: 2px; overflow: hidden; font-size: 8.5px; text-overflow: ellipsis; white-space: nowrap; }
    .progress-line { margin-top: 7px; }
    .progress-line > div:first-child { display: flex; justify-content: space-between; margin-bottom: 3px; color: #727a6b; font-size: 7px; }
    .empty, .all-clear { padding: 18px; border: 1px dashed #ccd3c3; border-radius: 8px; color: #68715f; text-align: center; background: #f8faf5; }
    footer { display: flex; justify-content: space-between; margin-top: 14px; padding-top: 7px; border-top: 1px solid #dfe3d8; color: #788071; font-size: 7.5px; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-mark">${report.branding?.ctaLogo ? `<img src="${report.branding.ctaLogo}" alt="Brasão do 4º CTA" />` : "4º CTA"}</div>
      <div>
        <div class="eyebrow">4º Centro de Telemática de Área · Seção de Projetos</div>
        <h1>Relatório Executivo da Seção de Projetos</h1>
        <p>SAGEP · Sistema de Apoio à Gestão de Projetos</p>
      </div>
    </div>
    <div class="meta">
      <div><strong>Escopo:</strong> ${escapeHtml(report.filter.scope)}</div>
      <div><strong>Referência:</strong> ${escapeHtml(report.filter.label)}</div>
      <div><strong>Emitido:</strong> ${formatDate(report.generatedAt, true)}</div>
      <div><strong>Responsável pela emissão:</strong> ${escapeHtml(report.generatedBy.displayName)}</div>
    </div>
  </header>

  <section class="summary">
    <div class="metric"><span>Total de projetos</span><strong>${summary.projectsTotal}</strong><small>andamento + concluídos</small></div>
    <div class="metric"><span>Em andamento</span><strong>${summary.projectsOpen}</strong><small>carteira ativa</small></div>
    <div class="metric"><span>Concluídos</span><strong>${summary.projectsCompleted}</strong><small>entregas finalizadas</small></div>
    <div class="metric"><span>Valor em andamento</span><strong>${formatAmount(summary.totalInProgressAmount)}</strong><small>projetos abertos</small></div>
    <div class="metric"><span>Valor concluído</span><strong>${formatAmount(summary.totalCompletedAmount)}</strong><small>projetos entregues</small></div>
    <div class="metric"><span>Valor empenhado</span><strong>${formatAmount(summary.totalCommittedAmount)}</strong><small>${summary.commitmentRate}% da carteira</small></div>
  </section>

  <div class="section-title"><h2>Visão consolidada</h2><p>Onde estão os projetos, quanto representam e quais exigem ação.</p></div>
  <section class="charts">
    <div class="panel"><h3>Projetos em andamento por etapa</h3>${renderBars(report.charts.byStage)}</div>
    <div class="panel"><h3>Valor em andamento por estado</h3>${renderRegionBars(report.charts.byRegion)}</div>
    <div class="panel"><h3>Saúde dos projetos em andamento</h3>
      <div class="health-stack">
        <span style="width:${healthPercentage(critical)}%;background:#a83f37"></span>
        <span style="width:${healthPercentage(warning)}%;background:#cf9730"></span>
        <span style="width:${healthPercentage(regular)}%;background:#66733c"></span>
      </div>
      <div class="health-list">
        <div class="health-item"><i style="background:#a83f37"></i><span>Críticos · prazo vencido</span><strong>${critical}</strong></div>
        <div class="health-item"><i style="background:#cf9730"></i><span>Atenção · sem atualização</span><strong>${warning}</strong></div>
        <div class="health-item"><i style="background:#66733c"></i><span>Em dia · fluxo regular</span><strong>${regular}</strong></div>
      </div>
      <p class="health-note">Atenção considera ${report.filter.staleDays} dias ou mais sem atualização.</p>
    </div>
  </section>

  <div class="section-title"><h2>Pontos de atenção do Comando</h2><p>Prazo vencido ou ausência de atualização há pelo menos ${report.filter.staleDays} dias.</p></div>
  <section class="attention-list">${renderAttention(report.commandAttention)}</section>

  <div class="section-title"><h2>Carteira detalhada</h2><p>${report.projects.length} projeto(s) abertos, ordenados pela etapa e pela atualização mais antiga.</p></div>
  <section>${renderProjects(report.projects)}</section>

  <footer>
    <span>4º Centro de Telemática de Área · Seção de Projetos</span>
    <span>Documento gerado pelo SAGEP em ${formatDate(report.generatedAt, true)}</span>
  </footer>
</body>
</html>`;
}
