type EstimateDocumentInput = {
  estimateCode: number;
  createdAt: string;
  status: string;
  omName?: string | null;
  destinationCityName: string;
  destinationStateUf: string;
  notes?: string | null;
  totalAmount: string;
  project: {
    projectCode: number;
    title: string;
    stage: string;
  };
  ata: {
    ataCode: number;
    number: string;
    type: string;
    vendorName: string;
  };
  coverageGroup: {
    code: string;
    name: string;
    description?: string | null;
  };
  items: Array<{
    estimateItemCode: number;
    referenceCode: string;
    description: string;
    unit: string;
    quantity: string;
    unitPrice: string;
    subtotal: string;
    notes?: string | null;
  }>;
};

function formatCurrency(value: string | number) {
  const amount =
    typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."));

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isNaN(amount) ? 0 : amount);
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Manaus",
  }).format(date);
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderEstimateDocumentHtml(data: EstimateDocumentInput) {
  const rows = data.items
    .map((item, index) => {
      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td class="center">${escapeHtml(item.referenceCode)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="center">${escapeHtml(item.unit)}</td>
          <td class="right">${formatCurrency(0).replace("R$ 0,00", "")}${escapeHtml(item.quantity)}</td>
          <td class="right">${formatCurrency(item.unitPrice)}</td>
          <td class="right">${formatCurrency(item.subtotal)}</td>
        </tr>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Estimativa de Preço ${data.estimateCode}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 14mm 16mm 14mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111827;
      font-size: 12px;
      line-height: 1.35;
      margin: 0;
      padding: 0;
    }

    .header {
      text-align: center;
      border-bottom: 2px solid #111827;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }

    .header .org {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .header .title {
      font-size: 18px;
      font-weight: 700;
      margin-top: 10px;
      text-transform: uppercase;
    }

    .header .subtitle {
      margin-top: 4px;
      font-size: 12px;
    }

    .meta-grid {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }

    .meta-grid td {
      border: 1px solid #d1d5db;
      padding: 7px 8px;
      vertical-align: top;
    }

    .meta-label {
      display: block;
      font-size: 10px;
      color: #4b5563;
      text-transform: uppercase;
      margin-bottom: 2px;
    }

    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 12px 0 8px;
      padding: 6px 8px;
      background: #f3f4f6;
      border-left: 4px solid #111827;
    }

    table.items {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
    }

    table.items th,
    table.items td {
      border: 1px solid #9ca3af;
      padding: 6px 7px;
    }

    table.items th {
      background: #e5e7eb;
      font-size: 11px;
      text-transform: uppercase;
    }

    .right {
      text-align: right;
    }

    .center {
      text-align: center;
    }

    .summary {
      margin-top: 12px;
      width: 100%;
      border-collapse: collapse;
    }

    .summary td {
      border: 1px solid #9ca3af;
      padding: 8px;
      font-weight: 700;
    }

    .summary .label {
      background: #f3f4f6;
      width: 75%;
      text-transform: uppercase;
    }

    .notes {
      margin-top: 12px;
      border: 1px solid #d1d5db;
      padding: 10px;
      min-height: 70px;
      white-space: pre-wrap;
    }

    .footer {
      margin-top: 28px;
      display: flex;
      justify-content: space-between;
      gap: 24px;
    }

    .signature-box {
      flex: 1;
      text-align: center;
      padding-top: 36px;
    }

    .signature-line {
      border-top: 1px solid #111827;
      padding-top: 6px;
      font-size: 11px;
    }

    .muted {
      color: #4b5563;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="org">MINISTÉRIO DA DEFESA</div>
    <div class="org">EXÉRCITO BRASILEIRO</div>
    <div class="org">4º CENTRO DE TELEMÁTICA DE ÁREA</div>
    <div class="title">Estimativa de Preço</div>
    <div class="subtitle">Documento gerado pelo SAGEP</div>
  </div>

  <table class="meta-grid">
    <tr>
      <td colspan="2">
        <span class="meta-label">Projeto</span>
        PRJ-${String(data.project.projectCode).padStart(4, "0")} - ${escapeHtml(data.project.title)}
      </td>
      <td>
        <span class="meta-label">Estimativa</span>
        EST-${String(data.estimateCode).padStart(4, "0")}
      </td>
      <td>
        <span class="meta-label">Data</span>
        ${formatDate(data.createdAt)}
      </td>
    </tr>
    <tr>
      <td>
        <span class="meta-label">OM</span>
        ${escapeHtml(data.omName || "-")}
      </td>
      <td>
        <span class="meta-label">Cidade/UF</span>
        ${escapeHtml(data.destinationCityName)}/${escapeHtml(data.destinationStateUf)}
      </td>
      <td>
        <span class="meta-label">Grupo</span>
        ${escapeHtml(data.coverageGroup.code)} - ${escapeHtml(data.coverageGroup.name)}
      </td>
      <td>
        <span class="meta-label">Status</span>
        ${escapeHtml(data.status)}
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <span class="meta-label">Ata</span>
        ATA ${escapeHtml(data.ata.number)} - ${escapeHtml(data.ata.type)}
      </td>
      <td colspan="2">
        <span class="meta-label">Fornecedor</span>
        ${escapeHtml(data.ata.vendorName)}
      </td>
    </tr>
  </table>

  <div class="section-title">1 - Itens da Estimativa</div>

  <table class="items">
    <thead>
      <tr>
        <th style="width: 6%">#</th>
        <th style="width: 8%">Item</th>
        <th>Descrição</th>
        <th style="width: 8%">Und</th>
        <th style="width: 10%">Qtd</th>
        <th style="width: 14%">Valor Unit.</th>
        <th style="width: 14%">Valor Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <table class="summary">
    <tr>
      <td class="label">Total Geral da Estimativa</td>
      <td class="right">${formatCurrency(data.totalAmount)}</td>
    </tr>
  </table>

  <div class="section-title">2 - Observações</div>
  <div class="notes">${escapeHtml(data.notes || "Sem observações.")}</div>

  <div class="footer">
    <div class="signature-box">
      <div class="signature-line">Elaborado via SAGEP</div>
      <div class="muted">Estimativa automática</div>
    </div>

    <div class="signature-box">
      <div class="signature-line">Seção de Projetos - Divisão Técnica</div>
      <div class="muted">4º CTA</div>
    </div>
  </div>
</body>
</html>
  `;
}