type DiexDocumentInput = {
  diexCode: number;
  diexNumber?: string | null;
  issuedAt?: string | null;
  issuingOrganization: string;
  commandName: string;

  headerCommandName?: string | null;
  processOrganizationName?: string | null;
  parentCommandText?: string | null;
  hideNotesInPrint?: boolean;

  pregaoNumber: string;
  uasg: string;
  supplierName: string;
  supplierCnpj: string;
  requesterName: string;
  requesterRank: string;
  requesterRole: string;
  notes?: string | null;
  totalAmount: string;
  project: {
    projectCode: number;
    title: string;
    description?: string | null;
  };
  estimate: {
    estimateCode: number;
    omName?: string | null;
    destinationCityName: string;
    destinationStateUf: string;
    om?: {
      omCode: number;
      sigla: string;
      name: string;
      cityName: string;
      stateUf: string;
    } | null;
    ata: {
      ataCode: number;
      number: string;
      type: string;
      vendorName: string;
    };
  };
  items: Array<{
    diexItemCode: number;
    itemCode: string;
    description: string;
    supplyUnit: string;
    quantityRequested: string;
    unitPrice: string;
    totalPrice: string;
    notes?: string | null;
  }>;
  images: {
    brasao: string;
    selo: string;
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

function formatDateLongUpper(value: string | Date | null | undefined) {
  if (!value) return "DATA PENDENTE";

  const date = value instanceof Date ? value : new Date(value);

  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    timeZone: "America/Manaus",
  }).format(date);

  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "America/Manaus",
  })
    .format(date)
    .toUpperCase();

  const year = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
    timeZone: "America/Manaus",
  }).format(date);

  return `${day} DE ${month} DE ${year}`;
}

export function renderDiexDocumentHtml(data: DiexDocumentInput) {
  const diexNumberDisplay = data.diexNumber || "PENDENTE/SALC";
  const issueDateDisplay = formatDateLongUpper(data.issuedAt);

  const headerCommandName = data.headerCommandName || data.commandName;
  const processOrganizationName = data.processOrganizationName || data.commandName;
  const parentCommandText =
    data.parentCommandText || "(Comando de Elementos de Fronteira – 1948)";

  const hideNotesInPrint = data.hideNotesInPrint ?? true;

  const rows = data.items
    .map((item) => {
      return `
        <tr>
          <td class="center item-col">${escapeHtml(item.itemCode)}</td>
          <td class="desc-col">${escapeHtml(item.description)}</td>
          <td class="center und-col">${escapeHtml(item.supplyUnit)}</td>
          <td class="right value-col">R$ ${formatMoney(item.unitPrice)}</td>
          <td class="center qty-col">${formatQuantity(item.quantityRequested)}</td>
          <td class="right total-col strong-money">R$ ${formatMoney(item.totalPrice)}</td>
        </tr>
      `;
    })
    .join("");

  const notesHtml = hideNotesInPrint
    ? ""
    : `
      <div class="notes">
        <strong>Observações:</strong>
        ${escapeHtml(
          data.notes ||
            `Projeto PRJ-${String(data.project.projectCode).padStart(4, "0")} | Estimativa EST-${String(data.estimate.estimateCode).padStart(4, "0")}`
        )}
      </div>
    `;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>DIEx ${escapeHtml(diexNumberDisplay)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 8mm 10mm 8mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "Times New Roman", Times, serif;
      color: #000;
      background: #fff;
      font-size: 10px;
    }

    .sheet {
      width: 100%;
      padding-top: 2mm;
    }

    .header-block {
      position: relative;
    }

    .symbols-space {
      height: 58px;
      position: relative;
      margin-bottom: 6px;
    }

    .brasao-top {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      height: 54px;
      object-fit: contain;
    }

    .selo-top {
      position: absolute;
      top: 0;
      right: 8px;
      height: 52px;
      object-fit: contain;
    }

    .header-line {
      text-align: center;
      font-weight: 700;
      line-height: 1.02;
      text-transform: uppercase;
      margin: 0;
      padding: 0;
    }

    .header-line.defesa {
      font-size: 11px;
    }

    .header-line.exercito {
      font-size: 11px;
      margin-top: 1px;
    }

    .header-line.comando {
      font-size: 12px;
      margin-top: 1px;
    }

    .header-line.small-parent {
      text-transform: none;
      font-size: 10px;
      margin-top: 2px;
    }

    .header-title {
      text-align: center;
      font-weight: 700;
      font-size: 11px;
      margin-top: 24px;
      margin-bottom: 26px;
      line-height: 1.1;
    }

    .doc-box {
      width: 92%;
      margin: 0 auto;
      border: 1px solid #666;
    }

    .process-row {
      text-align: center;
      font-weight: 700;
      font-size: 10px;
      line-height: 1.1;
      padding: 4px 8px 4px 8px;
      border-bottom: 1px solid #666;
    }

    .supplier-row {
      text-align: center;
      font-weight: 700;
      font-size: 10px;
      line-height: 1.15;
      padding: 5px 10px 5px 10px;
      border-bottom: 1px solid #666;
      text-transform: uppercase;
    }

    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0;
    }

    table.items th,
    table.items td {
      padding: 2px 4px;
      font-size: 10px;
      line-height: 1.0;
      border-right: 1px solid #666;
      border-bottom: 1px solid #666;
      vertical-align: middle;
    }

    table.items th:last-child,
    table.items td:last-child {
      border-right: none;
    }

    table.items thead th {
      text-align: center;
      font-weight: 700;
      font-size: 10px;
      padding-top: 2px;
      padding-bottom: 2px;
    }

    table.items tbody tr:last-child td {
      border-bottom: none;
    }

    .center {
      text-align: center;
    }

    .right {
      text-align: right;
      white-space: nowrap;
    }

    .desc-col {
      text-align: left;
      word-break: break-word;
    }

    .item-col  { width: 7%;  }
    .desc-col  { width: 45%; }
    .und-col   { width: 8%;  }
    .value-col { width: 12%; }
    .qty-col   { width: 13%; }
    .total-col { width: 15%; }

    .strong-money {
      font-weight: 700;
    }

    .total-row td {
      font-weight: 700;
      font-size: 11px;
      padding-top: 2px;
      padding-bottom: 2px;
    }

    .total-label {
      text-align: center;
      letter-spacing: 0.1px;
    }

    .signature-block {
      margin-top: 38px;
      text-align: center;
    }

    .signature-name {
      font-weight: 700;
      font-size: 12px;
      line-height: 1.1;
    }

    .signature-role {
      font-size: 10px;
      line-height: 1.1;
      margin-top: 2px;
    }

    .notes {
      margin-top: 18px;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header-block">
      <div class="symbols-space">
        <img class="brasao-top" src="${data.images.brasao}" alt="Brasão" />
        <img class="selo-top" src="${data.images.selo}" alt="Selo 4º CTA" />
      </div>

      <div class="header-line defesa">MINISTÉRIO DA DEFESA</div>
      <div class="header-line exercito">EXÉRCITO BRASILEIRO</div>
      <div class="header-line comando">${escapeHtml(headerCommandName)}</div>
      <div class="header-line small-parent">${escapeHtml(parentCommandText)}</div>

      <div class="header-title">
        ANEXO DIEx REQUISITÓRIO Nr ${escapeHtml(diexNumberDisplay)} do 4º CTA, DE ${escapeHtml(issueDateDisplay)}
      </div>
    </div>

    <div class="doc-box">
      <div class="process-row">
        PROCESSO: PREGÃO Nr ${escapeHtml(data.pregaoNumber)} UASG ${escapeHtml(data.uasg)} – ${escapeHtml(processOrganizationName)}
      </div>

      <div class="supplier-row">
        FORNECEDOR: ${escapeHtml(data.supplierName)} (CNPJ: ${escapeHtml(data.supplierCnpj)})
      </div>

      <table class="items">
        <thead>
          <tr>
            <th class="item-col">Item</th>
            <th class="desc-col">Descrição</th>
            <th class="und-col">Und<br>Fornec</th>
            <th class="value-col">Valor Unit<br>(R$)</th>
            <th class="qty-col">Qnt Solicitada</th>
            <th class="total-col">Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="5" class="total-label">TOTAL FORNECEDOR (R$)</td>
            <td class="right strong-money">R$ ${formatMoney(data.totalAmount)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="signature-block">
      <div class="signature-name">
        ${escapeHtml(data.requesterName)} – ${escapeHtml(data.requesterRank)}
      </div>
      <div class="signature-role">
        ${escapeHtml(data.requesterRole)}
      </div>
    </div>

    ${notesHtml}
  </div>
</body>
</html>
  `;
}