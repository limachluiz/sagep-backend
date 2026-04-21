type ServiceOrderDocumentInput = {
  serviceOrderCode: number;
  serviceOrderNumber: string;
  issuedAt: string;
  contractorName: string;
  contractorCnpj: string;
  commitmentNoteNumber: string;
  requesterName: string;
  requesterRank: string;
  requesterRole: string;
  issuingOrganization: string;
  isEmergency: boolean;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  notes?: string | null;
  totalAmount: string;
  requestingArea?: string | null;
  projectDisplayName?: string | null;
  projectAcronym?: string | null;
  contractNumber?: string | null;
  executionLocation?: string | null;
  executionHours?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactExtension?: string | null;
  contractTotalTerm?: string | null;
  originProcess?: string | null;
  requesterCpf?: string | null;
  contractorRepresentativeName?: string | null;
  contractorRepresentativeRole?: string | null;
  items: Array<{
    itemCode: string;
    description: string;
    supplyUnit: string;
    quantityOrdered: string;
    unitPrice: string;
    totalPrice: string;
  }>;
  scheduleItems: Array<{
    orderIndex: number;
    taskStep: string;
    scheduleText: string;
  }>;
  deliveredDocuments: Array<{
    description: string;
    isChecked: boolean;
  }>;
  images: {
    brasao: string;
  };
};

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value: string | number) {
  const amount =
    typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."));

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isNaN(amount) ? 0 : amount);
}

function formatQuantity(value: string | number) {
  const amount =
    typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."));

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isNaN(amount) ? 0 : amount);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Manaus",
  }).format(date);
}

function checkbox(checked: boolean) {
  return checked ? "x" : "&nbsp;";
}

export function renderServiceOrderDocumentHtml(data: ServiceOrderDocumentInput) {
  const itemRows = data.items
    .map(
      (item) => `
        <tr>
          <td class="center">${escapeHtml(item.itemCode)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="center">${escapeHtml(item.supplyUnit)}</td>
          <td class="right">${formatMoney(item.unitPrice)}</td>
          <td class="center">${formatQuantity(item.quantityOrdered)}</td>
          <td class="right">R$ ${formatMoney(item.totalPrice)}</td>
        </tr>
      `
    )
    .join("");

  const scheduleRows =
    data.scheduleItems.length > 0
      ? data.scheduleItems
          .map(
            (item) => `
              <tr>
                <td class="center">${item.orderIndex}</td>
                <td>${escapeHtml(item.taskStep)}</td>
                <td>${escapeHtml(item.scheduleText)}</td>
              </tr>
            `
          )
          .join("")
      : `
        <tr>
          <td class="center">1</td>
          <td>A definir</td>
          <td>A definir</td>
        </tr>
      `;

  const deliveredDocs =
    data.deliveredDocuments.length > 0
      ? data.deliveredDocuments
          .map(
            (doc) => `
              <div class="check-line">(${checkbox(doc.isChecked)}) ${escapeHtml(doc.description)}</div>
            `
          )
          .join("")
      : `
        <div class="check-line">( ) ____________________________</div>
        <div class="check-line">( ) ____________________________</div>
        <div class="check-line">( ) ____________________________</div>
      `;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>OS ${escapeHtml(data.serviceOrderNumber)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 9mm 12mm 9mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      font-size: 10px;
      line-height: 1.18;
    }

    .header {
      text-align: center;
      margin-bottom: 10px;
    }
    
    .header .brasao {
      display: block;
      margin: 0 auto 8px;
      height: 74px;
      object-fit: contain;
    }

    .header .line {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      line-height: 1.08;
    }

    .header .line.small {
      text-transform: none;
      font-size: 10px;
    }

    .header .title {
      margin-top: 10px;
      font-family: "Times New Roman", Times, serif;
      font-weight: 400;
      text-transform: uppercase;
      font-size: 16px;
    }

    .instructions-box {
      border: 1px solid #777;
      padding: 6px 8px;
      margin-top: 4px;
      margin-bottom: 6px;
    }

    .instructions-box div {
      margin-bottom: 2px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    td, th {
      border: 1px solid #777;
      padding: 4px 6px;
      vertical-align: top;
    }

    th {
      text-align: center;
      font-weight: 700;
      background: #f2f2f2;
    }

    .center {
      text-align: center;
      vertical-align: middle;
    }

    .right {
      text-align: right;
      vertical-align: middle;
      white-space: nowrap;
    }

    .section-title {
      margin-top: 6px;
      margin-bottom: 0;
      font-weight: 700;
      font-size: 11px;
    }

    .info-grid td {
      min-height: 24px;
    }

    .items td {
      font-size: 9.5px;
    }

    .items .desc {
      white-space: pre-wrap;
    }

    .notes-list {
      margin-top: 4px;
      padding-left: 12px;
    }

    .notes-list div {
      margin-bottom: 2px;
    }

    .check-line {
      margin-bottom: 3px;
    }

    .signature-block {
      margin-top: 4px;
    }

    .signature-grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .signature-grid th,
    .signature-grid td {
      border: 1px solid #777;
      text-align: center;
      padding: 0;
    }

    .signature-grid .group-header th {
      height: 24px;
      vertical-align: middle;
      font-size: 10px;
      font-weight: 700;
    }

    .signature-grid .role-header td {
      height: 34px;
      vertical-align: bottom;
      padding: 0 6px 8px;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.1;
    }

    .signature-grid .signature-cell {
      height: 88px;
      vertical-align: bottom;
      padding: 0 6px 10px;
      font-size: 10px;
    }

    .signature-grid .signature-name {
      font-weight: 700;
      margin: 0;
      line-height: 1.1;
    }

    .signature-grid .signature-meta {
      font-size: 10px;
      line-height: 1.1;
      margin: 0;
    }

    .muted {
      color: #222;
    }
  </style>
</head>
<body>
  <div class="header">
    <img class="brasao" src="${data.images.brasao}" alt="Brasão do Exército Brasileiro" />
    <div class="line">MINISTÉRIO DA DEFESA</div>
    <div class="line">EXÉRCITO BRASILEIRO</div>
    <div class="line">4º CENTRO DE TELEMÁTICA DE ÁREA</div>
    <div class="line small">(Centro de Processamento de Dados nº 5/1978)</div>
    <div class="title">ORDEM DE SERVIÇO</div>
  </div>

  <table class="info-grid">
    <tr>
      <td style="width: 34%">
        <strong>Ordem Serviço:</strong> ${escapeHtml(data.serviceOrderNumber)}
      </td>
      <td style="width: 33%">
        <strong>Data de Emissão:</strong> ${escapeHtml(formatDate(data.issuedAt))}
      </td>
      <td style="width: 33%">
        <strong>Emergencial:</strong>
        Sim (${checkbox(data.isEmergency)}) Não (${checkbox(!data.isEmergency)})
      </td>
    </tr>
    <tr>
      <td colspan="3">
        <strong>Área Requisitante</strong> ${escapeHtml(data.requestingArea || "")}
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <strong>Nome do Projeto:</strong> ${escapeHtml(data.projectDisplayName || "")}
      </td>
      <td>
        <strong>Sigla:</strong> ${escapeHtml(data.projectAcronym || "- - - - -")}
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <strong>Contratada:</strong> ${escapeHtml(data.contractorName)}
      </td>
      <td>
        <strong>Contrato nº:</strong> ${escapeHtml(data.contractNumber || "")}
      </td>
    </tr>
  </table>

  <div class="section-title">1 - Especificação dos Serviços e Volumes</div>
  <table class="items">
    <thead>
      <tr>
        <th style="width: 8%">Item</th>
        <th>Descrição</th>
        <th style="width: 10%">Und Fornec</th>
        <th style="width: 13%">Valor Unit (R$)</th>
        <th style="width: 12%">Qnt Solicitada</th>
        <th style="width: 15%">Valor (R$)</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <tr>
        <td colspan="5" class="right"><strong>TOTAL FORNECEDOR (R$)</strong></td>
        <td class="right"><strong>R$ ${formatMoney(data.totalAmount)}</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="instructions-box">
    <div>- Informar na NF/fatura: Banco, Agência e Conta corrente para pagamento.</div>
    <div>- Referenciar na NF/fatura: esta OS, nota de empenho e/ou contrato.</div>
    <div>- Dados para faturamento: iguais aos constantes da nota de empenho.</div>
    <div>- Descrever na NF/fatura os serviços tais quais constam na NE.</div>
    <div>- Local de execução: ${escapeHtml(data.executionLocation || "A definir")}</div>
    <div>- Horário de execução: ${escapeHtml(data.executionHours || "")}</div>
    <div>- Contato: ${escapeHtml(data.contactName || "")}${data.contactPhone ? ` - Telefone: ${escapeHtml(data.contactPhone)}` : ""}${data.contactExtension ? ` - ${escapeHtml(data.contactExtension)}` : ""}</div>
  </div>

  <div class="section-title">2 - Cronograma</div>
  <table>
    <thead>
      <tr>
        <th style="width: 10%">Ord</th>
        <th>Tarefa / Etapa</th>
        <th style="width: 35%">Data</th>
      </tr>
    </thead>
    <tbody>
      ${scheduleRows}
    </tbody>
  </table>

  <div class="section-title">3 - Documentos Entregues</div>
  <div style="border: 1px solid #777; padding: 6px 8px;">
    ${deliveredDocs}
  </div>

  <div class="section-title">4 - Datas e Prazos</div>
  <table>
    <thead>
      <tr>
        <th>Data Prevista para Início dos Serviços</th>
        <th>Data Prevista para Entrega dos Serviços</th>
        <th>Prazo Total do Contrato (com a Garantia)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="center">${escapeHtml(formatDate(data.plannedStartDate))}</td>
        <td class="center">${escapeHtml(formatDate(data.plannedEndDate))}</td>
        <td class="center">${escapeHtml(data.contractTotalTerm || "")}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">5 - Observações</div>
  <div style="border: 1px solid #777; padding: 6px 8px;">
    <div>- Processo de Origem: ${escapeHtml(data.originProcess || "")}</div>
    ${data.notes ? `<div>- ${escapeHtml(data.notes)}</div>` : ""}
    <div><strong>Total do Valor para esta Ordem de Serviço:</strong> R$ ${formatMoney(data.totalAmount)}</div>
  </div>

  <div class="section-title">Ciência</div>

  <table class="signature-grid signature-block">
    <colgroup>
      <col style="width: 50%" />
      <col style="width: 50%" />
    </colgroup>

    <tr class="group-header">
      <th>CONTRATANTE</th>
      <th>CONTRATADA</th>
    </tr>

    <tr class="role-header">
      <td>Área/Fiscal Requisitante da Solução</td>
      <td>Preposto</td>
    </tr>

    <tr>
      <td class="signature-cell">
        <div class="signature-name">
          ${escapeHtml(data.requesterName)} - ${escapeHtml(data.requesterRank)}
        </div>
        ${data.requesterCpf ? `<div class="signature-meta">CPF: ${escapeHtml(data.requesterCpf)}</div>` : ""}
      </td>

      <td class="signature-cell">
        <div class="signature-name">
          ${escapeHtml(data.contractorRepresentativeName || "")}
        </div>
        <div class="signature-meta">
          ${escapeHtml(data.contractorRepresentativeRole || "")}
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}