function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return amount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function renderRows(items: unknown[], render: (item: any) => string) {
  if (!items.length) {
    return `<tr><td colspan="6" class="muted">Nenhum registro encontrado.</td></tr>`;
  }

  return items.map((item) => render(item)).join("");
}

export function renderProjectDossierHtml(dossier: any) {
  const project = dossier.project;
  const workflow = dossier.workflow;
  const documents = dossier.documents;
  const financial = dossier.financialSummary;
  const timeline = dossier.timelineSummary;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Dossiê PRJ-${escapeHtml(project.projectCode)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px;
      color: #1f2937;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }
    h1, h2, h3 { margin: 0; }
    h1 { font-size: 22px; }
    h2 {
      margin-top: 24px;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #d1d5db;
      font-size: 15px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 6px 7px;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #f3f4f6;
      font-weight: 700;
    }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 2px solid #111827;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .muted { color: #6b7280; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 16px;
    }
    .box {
      border: 1px solid #e5e7eb;
      padding: 10px;
      margin-top: 8px;
    }
    .tag {
      display: inline-block;
      padding: 2px 6px;
      border: 1px solid #d1d5db;
      background: #f9fafb;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <section class="header">
    <div>
      <h1>Dossiê do Projeto PRJ-${escapeHtml(project.projectCode)}</h1>
      <div class="muted">${escapeHtml(project.title)}</div>
    </div>
    <div>
      <div>Gerado em ${formatDate(dossier.generatedAt)}</div>
      <div class="tag">${escapeHtml(workflow.status)} / ${escapeHtml(workflow.stage)}</div>
    </div>
  </section>

  <h2>Dados gerais</h2>
  <div class="grid">
    <div><strong>Responsável:</strong> ${escapeHtml(project.owner?.name)}</div>
    <div><strong>Membros:</strong> ${escapeHtml(project.members?.length ?? 0)}</div>
    <div><strong>Início:</strong> ${formatDate(project.startDate)}</div>
    <div><strong>Fim:</strong> ${formatDate(project.endDate)}</div>
    <div><strong>Atualizado em:</strong> ${formatDate(project.updatedAt)}</div>
    <div><strong>Próxima ação:</strong> ${escapeHtml(workflow.nextAction?.label)}</div>
  </div>

  <h2>Workflow</h2>
  <table>
    <tbody>
      <tr><th>Nota de Crédito</th><td>${escapeHtml(workflow.milestones.creditNoteNumber)} / ${formatDate(workflow.milestones.creditNoteReceivedAt)}</td></tr>
      <tr><th>DIEx</th><td>${escapeHtml(workflow.milestones.diexNumber)} / ${formatDate(workflow.milestones.diexIssuedAt)}</td></tr>
      <tr><th>Nota de Empenho</th><td>${escapeHtml(workflow.milestones.commitmentNoteNumber)} / ${formatDate(workflow.milestones.commitmentNoteReceivedAt)}</td></tr>
      <tr><th>Ordem de Serviço</th><td>${escapeHtml(workflow.milestones.serviceOrderNumber)} / ${formatDate(workflow.milestones.serviceOrderIssuedAt)}</td></tr>
      <tr><th>Execução</th><td>Início: ${formatDate(workflow.milestones.executionStartedAt)} | As-Built: ${formatDate(workflow.milestones.asBuiltReceivedAt)}</td></tr>
      <tr><th>Encerramento</th><td>Atesto NF: ${formatDate(workflow.milestones.invoiceAttestedAt)} | Conclusão: ${formatDate(workflow.milestones.serviceCompletedAt)}</td></tr>
    </tbody>
  </table>

  <h2>Pendências</h2>
  <table>
    <thead><tr><th>Código</th><th>Descrição</th><th>Severidade</th></tr></thead>
    <tbody>
      ${renderRows(dossier.pendingActions ?? [], (item) => `
        <tr>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.label)}</td>
          <td>${escapeHtml(item.severity)}</td>
        </tr>
      `)}
    </tbody>
  </table>

  <h2>Documentos vinculados</h2>
  <h3>Estimativas</h3>
  <table>
    <thead><tr><th>Código</th><th>Status</th><th>Destino</th><th>Valor</th></tr></thead>
    <tbody>
      ${renderRows(documents.estimates ?? [], (item) => `
        <tr>
          <td>EST-${escapeHtml(item.estimateCode)}</td>
          <td>${escapeHtml(item.status)}</td>
          <td>${escapeHtml(item.destinationCityName)}/${escapeHtml(item.destinationStateUf)}</td>
          <td>${formatAmount(item.totalAmount)}</td>
        </tr>
      `)}
    </tbody>
  </table>
  <h3>DIEx</h3>
  <table>
    <thead><tr><th>Código</th><th>Número</th><th>Status</th><th>Fornecedor</th><th>Valor</th></tr></thead>
    <tbody>
      ${renderRows(documents.diexRequests ?? [], (item) => `
        <tr>
          <td>DIEX-${escapeHtml(item.diexCode)}</td>
          <td>${escapeHtml(item.diexNumber)}</td>
          <td>${escapeHtml(item.documentStatus)}</td>
          <td>${escapeHtml(item.supplierName)}</td>
          <td>${formatAmount(item.totalAmount)}</td>
        </tr>
      `)}
    </tbody>
  </table>
  <h3>Ordens de Serviço</h3>
  <table>
    <thead><tr><th>Código</th><th>Número</th><th>Status</th><th>Contratada</th><th>Valor</th></tr></thead>
    <tbody>
      ${renderRows(documents.serviceOrders ?? [], (item) => `
        <tr>
          <td>OS-${escapeHtml(item.serviceOrderCode)}</td>
          <td>${escapeHtml(item.serviceOrderNumber)}</td>
          <td>${escapeHtml(item.documentStatus)}</td>
          <td>${escapeHtml(item.contractorName)}</td>
          <td>${formatAmount(item.totalAmount)}</td>
        </tr>
      `)}
    </tbody>
  </table>

  <h2>Resumo financeiro</h2>
  <div class="box">
    <div><strong>Total estimado:</strong> ${formatAmount(financial.estimatedTotalAmount)}</div>
    <div><strong>Total estimado finalizado:</strong> ${formatAmount(financial.finalizedEstimatedTotalAmount)}</div>
    <div><strong>Total em DIEx:</strong> ${formatAmount(financial.diexTotalAmount)}</div>
    <div><strong>Total em OS:</strong> ${formatAmount(financial.serviceOrderTotalAmount)}</div>
  </div>

  <h2>Timeline resumida</h2>
  <table>
    <thead><tr><th>Data</th><th>Ação</th><th>Resumo</th><th>Ator</th></tr></thead>
    <tbody>
      ${renderRows(timeline ?? [], (item) => `
        <tr>
          <td>${formatDate(item.at)}</td>
          <td>${escapeHtml(item.action)}</td>
          <td>${escapeHtml(item.summary)}</td>
          <td>${escapeHtml(item.actorName)}</td>
        </tr>
      `)}
    </tbody>
  </table>
</body>
</html>`;
}
