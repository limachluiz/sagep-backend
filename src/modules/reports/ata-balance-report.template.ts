import type { AtaBalanceReportData } from "./ata-balance-report.service.js";

type Report = AtaBalanceReportData & { branding: { ctaLogo: string } };

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function amount(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function quantity(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 5 });
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

function percent(value: unknown) {
  return `${Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function ataType(value: string) {
  return value === "CFTV" ? "CFTV" : "Fibra óptica / ponto lógico";
}

function ataStatus(value: string) {
  return ({ ACTIVE: "Vigente", UPCOMING: "Futura", EXPIRED: "Vencida", INACTIVE: "Inativa" } as Record<string, string>)[value] ?? value;
}

function itemStatus(value: string) {
  return ({ AVAILABLE: "Disponível", LOW: "Saldo crítico", EXHAUSTED: "Esgotado", INACTIVE: "Inativo" } as Record<string, string>)[value] ?? value;
}

function metric(label: string, value: string | number, detail: string, tone = "") {
  return `<article class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function stackedBar(entry: Report["charts"]["byType"][number]) {
  const total = Math.max(Number(entry.initialAmount), 1);
  const segments = [
    ["opening", Number(entry.openingConsumedAmount)],
    ["sagep", Number(entry.sagepConsumedAmount)],
    ["reserved", Number(entry.reservedAmount)],
    ["available", Number(entry.availableAmount)],
  ] as const;
  return `<div class="stack-row">
    <div class="stack-label"><span>${escapeHtml(entry.label)}</span><strong>${amount(entry.initialAmount)}</strong></div>
    <div class="stack">${segments.map(([kind, value]) => `<i class="${kind}" style="width:${Math.max((value / total) * 100, value > 0 ? 1 : 0)}%"></i>`).join("")}</div>
    <small>${entry.itemCount} item(ns) - ${amount(entry.availableAmount)} disponíveis</small>
  </div>`;
}

function vendorBars(entries: Report["charts"]["byVendor"]) {
  const selected = entries.slice(0, 7);
  const max = Math.max(...selected.map((item) => Number(item.initialAmount)), 1);
  if (!selected.length) return '<div class="empty">Nenhum fornecedor no recorte.</div>';
  return selected.map((entry) => `<div class="bar-row">
    <div><span>${escapeHtml(entry.label)}</span><strong>${amount(entry.initialAmount)}</strong></div>
    <div class="bar-track"><i style="width:${Math.max((Number(entry.initialAmount) / max) * 100, 2)}%"></i></div>
    <small>${entry.itemCount} item(ns) - saldo ${amount(entry.availableAmount)}</small>
  </div>`).join("");
}

function compositionChart(report: Report) {
  const summary = report.summary;
  const total = Math.max(Number(summary.initialAmount), 1);
  const opening = (Number(summary.openingConsumedAmount) / total) * 360;
  const sagep = opening + (Number(summary.sagepConsumedAmount) / total) * 360;
  const reserved = sagep + (Number(summary.reservedAmount) / total) * 360;
  return `<div class="composition">
    <div class="donut" style="background:conic-gradient(#9a6b2f 0 ${opening}deg,#4d5f36 ${opening}deg ${sagep}deg,#c5a34b ${sagep}deg ${reserved}deg,#dfe6d8 ${reserved}deg 360deg)">
      <div><strong>${percent(summary.utilizationPercent)}</strong><span>utilizado + reservado</span></div>
    </div>
    <div class="legend">
      <div><i class="opening"></i><span>Histórico importado</span><strong>${amount(summary.openingConsumedAmount)}</strong></div>
      <div><i class="sagep"></i><span>Consumido no SAGEP</span><strong>${amount(summary.sagepConsumedAmount)}</strong></div>
      <div><i class="reserved"></i><span>Reservado</span><strong>${amount(summary.reservedAmount)}</strong></div>
      <div><i class="available"></i><span>Disponível</span><strong>${amount(summary.availableAmount)}</strong></div>
    </div>
  </div>`;
}

function ataTable(report: Report) {
  if (!report.atas.length) return '<div class="empty">Nenhuma ATA encontrada para o recorte selecionado.</div>';
  return `<table><thead><tr><th>ATA / Pregão</th><th>Fornecedor</th><th>Tipo</th><th>Itens</th><th>Valor inicial</th><th>Consumo total</th><th>Reservado</th><th>Disponível</th><th>Situação</th></tr></thead><tbody>
    ${report.atas.map((entry) => `<tr>
      <td><strong>ATA ${escapeHtml(entry.ata.number)}</strong><small>${entry.ata.pregao ? `PE ${escapeHtml(entry.ata.pregao.number)}/${escapeHtml(entry.ata.pregao.year)} - UASG ${escapeHtml(entry.ata.pregao.uasg)}` : "Pregão não vinculado"}</small></td>
      <td>${escapeHtml(entry.ata.vendorName)}<small>${escapeHtml(entry.ata.vendorCnpj ?? "CNPJ não informado")}</small></td>
      <td>${escapeHtml(ataType(entry.ata.type))}</td>
      <td class="number">${entry.itemCount}</td>
      <td class="money">${amount(entry.initialAmount)}</td>
      <td class="money">${amount(Number(entry.openingConsumedAmount) + Number(entry.sagepConsumedAmount))}</td>
      <td class="money">${amount(entry.reservedAmount)}</td>
      <td class="money"><strong>${amount(entry.availableAmount)}</strong></td>
      <td><span class="pill ${entry.ata.status.toLowerCase()}">${escapeHtml(ataStatus(entry.ata.status))}</span></td>
    </tr>`).join("")}
  </tbody></table>`;
}

function criticalTable(report: Report) {
  if (!report.criticalItems.length) return '<div class="all-clear">Nenhum item com saldo crítico ou esgotado no recorte.</div>';
  return `<table><thead><tr><th>Item / ATA</th><th>Descrição</th><th>Inicial</th><th>Consumo total</th><th>Reservado</th><th>Disponível</th><th>Valor disponível</th><th>Status</th></tr></thead><tbody>
    ${report.criticalItems.slice(0, 20).map((item) => `<tr>
      <td><strong>${escapeHtml(item.referenceCode)}</strong><small>ATA ${escapeHtml(item.ata.number)} - ${escapeHtml(item.coverageGroup.name)}</small></td>
      <td class="description">${escapeHtml(item.description)}</td>
      <td class="number">${quantity(item.balance.initialQuantity)} ${escapeHtml(item.unit)}</td>
      <td class="number">${quantity(item.balance.totalConsumedQuantity)} ${escapeHtml(item.unit)}</td>
      <td class="number">${quantity(item.balance.reservedQuantity)} ${escapeHtml(item.unit)}</td>
      <td class="number"><strong>${quantity(item.balance.availableQuantity)} ${escapeHtml(item.unit)}</strong></td>
      <td class="money">${amount(item.balance.availableAmount)}</td>
      <td><span class="pill ${item.status.toLowerCase()}">${escapeHtml(itemStatus(item.status))}</span></td>
    </tr>`).join("")}
  </tbody></table>`;
}

function detailTable(report: Report) {
  if (!report.items.length) return '<div class="empty">Nenhum item encontrado.</div>';
  return `<table class="detail-table"><thead><tr><th>ATA / Item</th><th>Grupo e descrição</th><th>Preço unitário</th><th>Inicial</th><th>Histórico</th><th>SAGEP</th><th>Reservado</th><th>Disponível</th><th>Posição oficial</th></tr></thead><tbody>
    ${report.items.map((item) => `<tr>
      <td><strong>ATA ${escapeHtml(item.ata.number)} / ${escapeHtml(item.referenceCode)}</strong><small>${escapeHtml(item.ata.vendorName)}</small></td>
      <td class="description"><strong>${escapeHtml(item.coverageGroup.name)}</strong><small>${escapeHtml(item.description)}</small></td>
      <td class="money">${amount(item.unitPrice)}</td>
      <td class="number">${quantity(item.balance.initialQuantity)} ${escapeHtml(item.unit)}</td>
      <td class="number">${quantity(item.balance.openingConsumedQuantity)} ${escapeHtml(item.unit)}<small>${item.openingBalanceAppliedAt ? `Aplicado em ${date(item.openingBalanceAppliedAt)}` : "Não aplicado"}</small></td>
      <td class="number">${quantity(item.balance.consumedQuantity)} ${escapeHtml(item.unit)}</td>
      <td class="number">${quantity(item.balance.reservedQuantity)} ${escapeHtml(item.unit)}</td>
      <td class="number"><strong>${quantity(item.balance.availableQuantity)} ${escapeHtml(item.unit)}</strong><small>${amount(item.balance.availableAmount)}</small></td>
      <td>${item.snapshot ? `<strong>${item.snapshot.managerAvailableQuantity === null ? "Não informado" : `${quantity(item.snapshot.managerAvailableQuantity)} ${escapeHtml(item.unit)}`}</strong><small>Snapshot: ${date(item.snapshot.checkedAt, true)}</small>${item.snapshot.managerAvailableQuantity === null ? "" : `<small>Diferença: ${quantity(Number(item.snapshot.managerAvailableQuantity) - Number(item.balance.availableQuantity))} ${escapeHtml(item.unit)}</small>`}` : '<span class="muted">Sem snapshot</span>'}<span class="pill ${item.status.toLowerCase()}">${escapeHtml(itemStatus(item.status))}</span></td>
    </tr>`).join("")}
  </tbody></table>`;
}

export function renderAtaBalanceReportHtml(report: Report) {
  const scope = report.filters.ataType ? ataType(report.filters.ataType) : "Todas as ATAs";
  const status = ({ ALL: "Todas as situações", ACTIVE: "Somente vigentes", EXPIRED: "Somente vencidas", INACTIVE: "Somente inativas" } as const)[report.filters.status];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;color:#243021;background:#fff;font-family:Arial,sans-serif;font-size:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hero{position:relative;overflow:hidden;border-radius:14px;background:linear-gradient(135deg,#24311f,#44542d 62%,#697642);color:#fff;padding:17px 20px;display:flex;align-items:center;justify-content:space-between;gap:24px}
    .hero:after{content:"";position:absolute;width:210px;height:210px;border:1px solid rgba(255,255,255,.12);border-radius:50%;right:-65px;top:-90px}.brand{display:flex;align-items:center;gap:14px;position:relative;z-index:1}.logo{width:58px;height:58px;object-fit:contain;background:#fff;border-radius:10px;padding:5px}.eyebrow{font-size:7px;letter-spacing:1.8px;font-weight:700;color:#d9c778;text-transform:uppercase}.hero h1{font-size:19px;line-height:1.05;margin:5px 0}.hero p{margin:0;color:rgba(255,255,255,.72);font-size:8px}.meta{position:relative;z-index:1;text-align:right;line-height:1.65;color:rgba(255,255,255,.8)}.meta strong{display:block;color:#fff;font-size:9px}
    .metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:9px}.metric{border:1px solid #dfe4d9;border-radius:10px;padding:10px;background:#f8faf6;min-height:62px}.metric span{display:block;color:#687064;font-size:7px;text-transform:uppercase;letter-spacing:.55px;font-weight:700}.metric strong{display:block;margin-top:5px;font-size:14px;color:#334126}.metric small{display:block;margin-top:3px;color:#7b8275;font-size:7px}.metric.gold{background:#fbf8ed;border-color:#e6d9a9}.metric.critical{background:#fbefed;border-color:#e7c0bc}.metric.critical strong{color:#a6433b}
    .section{margin-top:10px;break-inside:auto}.section-head{display:flex;align-items:end;justify-content:space-between;border-bottom:1px solid #d9dfd3;padding-bottom:5px;margin-bottom:7px}.section-head span{display:block;color:#73804a;font-size:6.5px;font-weight:700;letter-spacing:1.4px}.section-head h2{font-size:13px;margin:2px 0 0;color:#2d3927}.section-head p{margin:0;color:#7b8275;font-size:7px}.panels{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.panel{border:1px solid #dfe4d9;border-radius:10px;padding:10px;min-height:155px;break-inside:avoid}.panel h3{font-size:9px;margin:0 0 8px;color:#3d4936}
    .composition{display:flex;align-items:center;gap:13px}.donut{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;flex:none}.donut>div{width:59px;height:59px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.donut strong{font-size:15px}.donut span{font-size:6px;color:#777;max-width:48px}.legend{flex:1;display:grid;gap:6px}.legend div{display:grid;grid-template-columns:8px 1fr auto;gap:5px;align-items:center}.legend i{width:7px;height:7px;border-radius:2px}.legend .opening{background:#9a6b2f}.legend .sagep{background:#4d5f36}.legend .reserved{background:#c5a34b}.legend .available{background:#dfe6d8;border:1px solid #bdc8b4}.legend span{color:#677060;font-size:7px}.legend strong{font-size:7px}
    .stack-row{margin:8px 0}.stack-label,.bar-row>div:first-child{display:flex;justify-content:space-between;gap:8px;font-size:7px}.stack{display:flex;height:8px;overflow:hidden;border-radius:5px;background:#eef1ea;margin:4px 0}.stack i{height:100%}.stack .opening{background:#9a6b2f}.stack .sagep{background:#4d5f36}.stack .reserved{background:#c5a34b}.stack .available{background:#dfe6d8}.stack-row small,.bar-row small{color:#7b8275;font-size:6.5px}.bar-row{margin:7px 0}.bar-track{height:6px;background:#eef1ea;border-radius:4px;overflow:hidden;margin:3px 0}.bar-track i{display:block;height:100%;background:linear-gradient(90deg,#44542d,#849454);border-radius:4px}
    .governance{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.governance article{border:1px solid #dfe4d9;border-radius:8px;padding:8px}.governance span{display:block;color:#777;font-size:7px}.governance strong{display:block;font-size:12px;margin:3px 0}.progress{height:5px;background:#edf0e9;border-radius:4px;overflow:hidden}.progress i{display:block;height:100%;background:#60713b}
    table{width:100%;border-collapse:collapse;font-size:7px;page-break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{text-align:left;background:#34412d;color:#fff;padding:6px 5px;font-size:6.5px;text-transform:uppercase;letter-spacing:.3px}th:first-child{border-radius:6px 0 0 0}th:last-child{border-radius:0 6px 0 0}td{padding:5px;border-bottom:1px solid #e5e9e1;vertical-align:top}tbody tr:nth-child(even){background:#f8faf6}td strong{display:block}td small{display:block;color:#747c70;margin-top:2px;line-height:1.25}.money,.number{text-align:right;white-space:nowrap}.description{max-width:250px;line-height:1.3}.detail-table{font-size:6.4px}.detail-table td{padding:4.5px}.pill{display:inline-block;margin-top:3px;padding:2px 5px;border-radius:999px;background:#e8ede3;color:#4f6137;font-size:6px;font-weight:700;white-space:nowrap}.pill.low{background:#fff0cf;color:#8a5c08}.pill.exhausted{background:#f9dcda;color:#a13a34}.pill.inactive,.pill.expired{background:#ececeb;color:#676760}.pill.upcoming{background:#e5edf7;color:#45617e}.all-clear,.empty{border:1px dashed #bdc8b4;border-radius:9px;padding:18px;text-align:center;background:#f7faf5;color:#596651}.muted{color:#888}.page-break{break-before:page}.method{margin-top:10px;border-left:3px solid #75834c;background:#f4f7f1;padding:8px 10px;color:#5e6758;line-height:1.45;font-size:7px}.signature{margin-top:9px;display:flex;justify-content:space-between;color:#777;font-size:6.5px}
  </style></head><body>
    <header class="hero"><div class="brand"><img class="logo" src="${report.branding.ctaLogo}" alt="4º CTA"><div><span class="eyebrow">4º Centro de Telemática de Área - Divisão Técnica</span><h1>Posição das ATAs e Saldos</h1><p>Visão executiva do estoque contratual, consumo histórico, reservas e disponibilidade operacional</p></div></div><div class="meta"><strong>${escapeHtml(scope)}</strong><span>${escapeHtml(status)}</span><br><span>Emitido em ${date(report.generatedAt, true)}</span><br><span>Responsável: ${escapeHtml(report.generatedBy)}</span></div></header>
    <section class="metrics">
      ${metric("Valor inicial", amount(report.summary.initialAmount), `${report.summary.ataCount} ATA(s) e ${report.summary.itemCount} item(ns)`)}
      ${metric("Consumo histórico", amount(report.summary.openingConsumedAmount), `${report.summary.openingAppliedItemCount} item(ns) conciliados`, "gold")}
      ${metric("Consumo SAGEP", amount(report.summary.sagepConsumedAmount), "Notas de Empenho registradas")}
      ${metric("Valor reservado", amount(report.summary.reservedAmount), "DIEx aguardando consumo", "gold")}
      ${metric("Saldo disponível", amount(report.summary.availableAmount), percent(report.summary.availablePercent))}
      ${metric("Itens críticos", report.summary.lowStockItemCount + report.summary.exhaustedItemCount, `${report.summary.exhaustedItemCount} esgotado(s)`, report.summary.exhaustedItemCount ? "critical" : "")}
    </section>
    <section class="section"><div class="section-head"><div><span>PAINEL EXECUTIVO</span><h2>Composição e distribuição do saldo</h2></div><p>Valores calculados no momento da emissão a partir da base operacional do SAGEP.</p></div><div class="panels"><div class="panel"><h3>Composição financeira consolidada</h3>${compositionChart(report)}</div><div class="panel"><h3>Posição por natureza da solução</h3>${report.charts.byType.map(stackedBar).join("") || '<div class="empty">Sem dados.</div>'}</div><div class="panel"><h3>Maiores fornecedores por valor registrado</h3>${vendorBars(report.charts.byVendor)}</div></div></section>
    <section class="section"><div class="section-head"><div><span>GOVERNANÇA DOS DADOS</span><h2>Cobertura da conciliação oficial</h2></div><p>Último snapshot oficial: ${date(report.summary.lastSnapshotAt, true)}</p></div><div class="governance">
      <article><span>ATAs vigentes</span><strong>${report.summary.activeAtaCount} de ${report.summary.ataCount}</strong><div class="progress"><i style="width:${report.summary.ataCount ? (report.summary.activeAtaCount / report.summary.ataCount) * 100 : 0}%"></i></div></article>
      <article><span>Itens ativos</span><strong>${report.summary.activeItemCount} de ${report.summary.itemCount}</strong><div class="progress"><i style="width:${report.summary.itemCount ? (report.summary.activeItemCount / report.summary.itemCount) * 100 : 0}%"></i></div></article>
      <article><span>Snapshot oficial salvo</span><strong>${report.summary.snapshotItemCount} itens</strong><div class="progress"><i style="width:${report.summary.snapshotCoveragePercent}%"></i></div><span>${percent(report.summary.snapshotCoveragePercent)} de cobertura</span></article>
      <article><span>Saldo de abertura aplicado</span><strong>${report.summary.openingAppliedItemCount} itens</strong><div class="progress"><i style="width:${report.summary.openingCoveragePercent}%"></i></div><span>${percent(report.summary.openingCoveragePercent)} de cobertura</span></article>
    </div></section>
    <section class="section page-break"><div class="section-head"><div><span>POSIÇÃO POR ATA</span><h2>Consolidação financeira e contratual</h2></div><p>${report.atas.length} ATA(s) no recorte selecionado.</p></div>${ataTable(report)}</section>
    <section class="section"><div class="section-head"><div><span>ATENÇÃO PRIORITÁRIA</span><h2>Itens com saldo crítico ou esgotado</h2></div><p>Criticidade definida por saldo zerado ou disponibilidade igual ou inferior a 10%.</p></div>${criticalTable(report)}</section>
    <section class="section page-break"><div class="section-head"><div><span>RASTREABILIDADE</span><h2>Detalhamento de todos os itens</h2></div><p>Histórico = consumo anterior ao SAGEP; SAGEP = consumo registrado por NE no sistema.</p></div>${detailTable(report)}</section>
    <div class="method"><strong>Critério de cálculo.</strong> Saldo disponível = quantidade inicial - consumo histórico de implantação - reservas ativas - consumo por Notas de Empenho registradas no SAGEP. O snapshot oficial é apresentado como referência de conciliação; somente snapshots aplicados como saldo de abertura alteram a posição operacional.</div>
    <div class="signature"><span>Documento gerado eletronicamente pelo SAGEP.</span><span>Base consultada em ${date(report.generatedAt, true)} - Horário de Manaus</span></div>
  </body></html>`;
}
