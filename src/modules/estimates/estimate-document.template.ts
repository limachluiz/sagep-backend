type EstimateDocumentInput = {
  estimateCode: number;
  createdAt: string;
  status: string;
  totalAmount: string;
  notes?: string | null;
  project: {
    projectCode: number;
    title: string;
    description?: string | null;
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
  om?: {
    omCode: number;
    sigla: string;
    name: string;
    cityName: string;
    stateUf: string;
  } | null;
  omName?: string | null;
  destinationCityName: string;
  destinationStateUf: string;
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
  logos: {
    citex: string;
    cta: string;
  };
};

const DOCUMENT_DEFAULTS = {
  uasg: "160016",
  pregao: "04/2025",
  empenhoImediato: "SIM",
  grupo: "3",
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

function getProjectTypeLabel(ataType: string) {
  return ataType === "CFTV" ? "Projeto CFTV" : "Projeto Fibra Óptica";
}

function getProjectMacroDescription(ataType: string) {
  return ataType === "CFTV"
    ? "Projeto de Circuito Fechado de Televisão"
    : "Projeto de Fibra Óptica";
}

export function renderEstimateDocumentHtml(data: EstimateDocumentInput) {
  const omDisplay = data.om?.sigla || data.omName || "-";
  const headerTitle = `${getProjectTypeLabel(data.ata.type)}: ${omDisplay}`;
  const macroDescription = getProjectMacroDescription(data.ata.type);

  const rows = data.items
    .map((item, index) => {
      const itemCells = `
        <td class="item-description">${escapeHtml(item.description)}</td>
        <td class="qty">${formatQuantity(item.quantity)}</td>
        <td class="money">R$ ${formatMoney(item.unitPrice)}</td>
        <td class="money">R$ ${formatMoney(item.subtotal)}</td>
        <td class="item-code">${escapeHtml(item.referenceCode)}</td>
      `;

      if (index === 0) {
        return `
          <tr>
            <td class="project-description" rowspan="${data.items.length}">
              ${escapeHtml(macroDescription)}
            </td>
            <td class="om" rowspan="${data.items.length}">
              ${escapeHtml(omDisplay)}
            </td>
            <td class="group" rowspan="${data.items.length}">
              ${escapeHtml(DOCUMENT_DEFAULTS.grupo)}
            </td>
            <td class="empenho" rowspan="${data.items.length}">
              ${escapeHtml(DOCUMENT_DEFAULTS.empenhoImediato)}
            </td>
            ${itemCells}
            <td class="uasg" rowspan="${data.items.length}">
              ${escapeHtml(DOCUMENT_DEFAULTS.uasg)}
            </td>
            <td class="pregao" rowspan="${data.items.length}">
              ${escapeHtml(DOCUMENT_DEFAULTS.pregao)}
            </td>
          </tr>
        `;
      }

      return `<tr>${itemCells}</tr>`;
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
      size: A4 landscape;
      margin: 8mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      font-size: 10px;
      background: #fff;
    }

    .page {
      width: 100%;
    }

    .header {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 0;
      border: 1px solid #7a7a7a;
    }

    .header td {
      border: none;
      background: #e9e9e9;
      height: 78px;
      vertical-align: middle;
      padding: 0;
    }

    .header .logo-cell {
      width: 105px;
      text-align: center;
    }

    .header .title-cell {
      text-align: center;
      font-weight: 700;
      font-size: 18px;
    }

    .logo {
      display: block;
      margin: 6px auto;
      max-height: 64px;
      max-width: 88px;
      object-fit: contain;
    }

    table.main {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 0;
    }

    table.main th,
    table.main td {
      border: 1px solid #7a7a7a;
      padding: 4px 5px;
      font-size: 10px;
    }

    table.main thead th {
      background: #efefef;
      text-align: center;
      font-weight: 700;
      height: 42px;
    }

    td.project-description,
    td.om,
    td.group,
    td.empenho,
    td.uasg,
    td.pregao {
      text-align: center;
      vertical-align: middle;
    }

    td.project-description {
      font-size: 11px;
    }

    td.item-description {
      vertical-align: top;
      text-align: left;
      line-height: 1.15;
    }

    td.qty,
    td.money,
    td.item-code {
      vertical-align: middle;
    }

    td.qty,
    td.money {
      text-align: center;
      white-space: nowrap;
    }

    td.item-code {
      text-align: center;
    }

    .w-proj   { width: 13%; }
    .w-om     { width: 14%; }
    .w-grupo  { width: 6%; }
    .w-emp    { width: 9%; }
    .w-desc   { width: 29%; }
    .w-qnt    { width: 8%; }
    .w-vu     { width: 9%; }
    .w-vt     { width: 10%; }
    .w-uasg   { width: 6%; }
    .w-pregao { width: 7%; }
    .w-item   { width: 6%; }

    .total-row td {
      height: 30px;
      font-weight: 700;
      font-size: 11px;
      background: #fff;
    }

    .total-label {
      text-align: center;
      letter-spacing: 0.3px;
    }

    .project-footer {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0;
      table-layout: fixed;
    }

    .project-footer td {
      border: 1px solid #bdbdbd;
      padding: 4px 6px;
      font-size: 10px;
      height: 22px;
    }

    .muted {
      color: #333;
    }
  </style>
</head>
<body>
  <div class="page">
    <table class="header">
      <tr>
        <td class="logo-cell">
          <img class="logo" src="${data.logos.citex}" alt="CITEx">
        </td>
        <td class="title-cell">
          ${escapeHtml(headerTitle)}
        </td>
        <td class="logo-cell">
          <img class="logo" src="${data.logos.cta}" alt="4º CTA">
        </td>
      </tr>
    </table>

    <table class="main">
      <thead>
        <tr>
          <th class="w-proj">DESCRIÇÃO</th>
          <th class="w-om">OM</th>
          <th class="w-grupo">GRUPO</th>
          <th class="w-emp">EMPENHO<br>IMEDIATO?</th>
          <th class="w-desc">DESCRIÇÃO</th>
          <th class="w-qnt">QNT</th>
          <th class="w-vu">VALOR UNIT<br>(R$)</th>
          <th class="w-vt">VALOR TOTAL<br>(R$)</th>
          <th class="w-uasg">UASG</th>
          <th class="w-pregao">PREGÃO</th>
          <th class="w-item">ITEM</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="6"></td>
          <td class="total-label">TOTAL</td>
          <td class="money">R$ ${formatMoney(data.totalAmount)}</td>
          <td colspan="3"></td>
        </tr>
      </tbody>
    </table>

    <table class="project-footer">
      <tr>
        <td><strong>Projeto:</strong> ${escapeHtml(headerTitle)}</td>
      </tr>
      <tr>
        <td class="muted">${escapeHtml(data.project.description || data.project.title)}</td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;
}