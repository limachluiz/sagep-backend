type ServiceOrderDocumentInput = {
  serviceOrderNumber: string;
  issuedAt?: string | Date | null;
  issuingOrganization: string;
  commandName: string;
  requestingUnit: string;
  projectCode: number;
  projectTitle: string;
  projectDescription?: string | null;
  supplierName: string;
  commitmentNoteNumber?: string | null;
  commitmentNoteReceivedAt?: string | Date | null;
  diexNumber?: string | null;
  diexIssuedAt?: string | Date | null;
  estimateCode: number;
  totalAmount: string | number;
  destinationCityName: string;
  destinationStateUf: string;
  requesterName: string;
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

function formatDateLong(value: string | Date | null | undefined) {
  if (!value) return "DATA PENDENTE";

  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Manaus",
  }).format(date);
}

export function renderServiceOrderDocumentHtml(data: ServiceOrderDocumentInput) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Ordem de Serviço ${escapeHtml(data.serviceOrderNumber)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 16mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "Times New Roman", Times, serif;
      color: #000;
      font-size: 12px;
      line-height: 1.4;
    }

    .header {
      text-align: center;
      margin-bottom: 24px;
    }

    .header p {
      margin: 0;
      font-weight: 700;
      text-transform: uppercase;
    }

    .title {
      margin-top: 18px;
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .meta {
      margin: 20px 0;
      width: 100%;
      border-collapse: collapse;
    }

    .meta td {
      border: 1px solid #000;
      padding: 8px;
      vertical-align: top;
    }

    .section-title {
      margin-top: 20px;
      margin-bottom: 8px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .box {
      border: 1px solid #000;
      padding: 12px;
    }

    .signature {
      margin-top: 40px;
      text-align: center;
    }

    .signature-line {
      margin-top: 40px;
      border-top: 1px solid #000;
      display: inline-block;
      min-width: 320px;
      padding-top: 6px;
    }
  </style>
</head>
<body>
  <div class="header">
    <p>${escapeHtml(data.issuingOrganization)}</p>
    <p>EXÉRCITO BRASILEIRO</p>
    <p>${escapeHtml(data.commandName)}</p>
    <p>${escapeHtml(data.requestingUnit)}</p>
  </div>

  <div class="title">
    ORDEM DE SERVIÇO Nº ${escapeHtml(data.serviceOrderNumber)}
  </div>

  <table class="meta">
    <tr>
      <td><strong>Data de emissão:</strong> ${escapeHtml(formatDateLong(data.issuedAt))}</td>
      <td><strong>Projeto:</strong> PRJ-${String(data.projectCode).padStart(4, "0")}</td>
    </tr>
    <tr>
      <td><strong>DIEx:</strong> ${escapeHtml(data.diexNumber || "NÃO INFORMADO")}</td>
      <td><strong>Nota/Empenho:</strong> ${escapeHtml(data.commitmentNoteNumber || "NÃO INFORMADO")}</td>
    </tr>
    <tr>
      <td colspan="2"><strong>Fornecedor:</strong> ${escapeHtml(data.supplierName)}</td>
    </tr>
    <tr>
      <td><strong>Estimativa:</strong> EST-${String(data.estimateCode).padStart(4, "0")}</td>
      <td><strong>Valor estimado:</strong> R$ ${escapeHtml(formatMoney(data.totalAmount))}</td>
    </tr>
    <tr>
      <td colspan="2">
        <strong>Destino:</strong>
        ${escapeHtml(data.destinationCityName)} - ${escapeHtml(data.destinationStateUf)}
      </td>
    </tr>
  </table>

  <div class="section-title">Objeto</div>
  <div class="box">
    Executar os serviços referentes ao projeto <strong>${escapeHtml(data.projectTitle)}</strong>,
    conforme estimativa finalizada e documentos administrativos vinculados.

    ${
      data.projectDescription
        ? `<br /><br /><strong>Descrição complementar:</strong> ${escapeHtml(data.projectDescription)}`
        : ""
    }
  </div>

  <div class="section-title">Determinação</div>
  <div class="box">
    Fica autorizada a execução do serviço, observando-se as condições da contratação,
    os documentos administrativos do processo e os prazos definidos pela Administração.
  </div>

  <div class="signature">
    <div class="signature-line">
      ${escapeHtml(data.requesterName)}
    </div>
  </div>
</body>
</html>
  `;
}