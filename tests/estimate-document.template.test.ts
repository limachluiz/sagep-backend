import { describe, expect, it } from "vitest";

import { renderEstimateDocumentHtml } from "../src/modules/estimates/estimate-document.template.js";

const input = {
  estimateCode: 1,
  createdAt: "2026-08-31T00:00:00.000Z",
  status: "FINALIZADA",
  totalAmount: "20.00",
  project: {
    projectCode: 1,
    title: "CRO 12",
    description: "CRO 12",
    stage: "ESTIMATIVA",
  },
  ata: {
    ataCode: 1,
    number: "ARP 00001/2026",
    type: "CFTV",
    vendorName: "Fornecedor",
  },
  coverageGroup: {
    code: "REG-01",
    name: "Região 1",
  },
  omName: "CRO/12",
  destinationCityName: "Manaus",
  destinationStateUf: "AM",
  items: [
    {
      estimateItemCode: 1,
      referenceCode: "00001",
      description: "Instalação",
      unit: "UND",
      quantity: "2",
      unitPrice: "10",
      subtotal: "20",
    },
  ],
  logos: { citex: "data:image/png;base64,citex", cta: "data:image/png;base64,cta" },
};

describe("renderEstimateDocumentHtml", () => {
  it("mantém UASG, pregão e item na mesma ordem do cabeçalho", () => {
    const html = renderEstimateDocumentHtml(input);
    const row = html.match(/<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/)?.[1] ?? "";

    expect(row.indexOf('class="uasg"')).toBeLessThan(row.indexOf('class="pregao"'));
    expect(row.indexOf('class="pregao"')).toBeLessThan(row.indexOf('class="item-code"'));
    expect(row).toContain("160016");
    expect(row).toContain("04/2025");
    expect(row).toContain('<td class="item-code">01</td>');
    expect(row).not.toContain('<td class="item-code">00001</td>');
  });

  it("não repete a palavra Projeto no rodapé", () => {
    const html = renderEstimateDocumentHtml(input);

    expect(html).toContain("<strong>Projeto CFTV: CRO 12</strong>");
    expect(html).not.toContain("<strong>Projeto:</strong> Projeto");
  });

  it("exibe o título no cabeçalho e a descrição técnica sem repetir o nome do projeto", () => {
    const html = renderEstimateDocumentHtml({
      ...input,
      project: {
        ...input.project,
        title: "Modernização do CFTV da CRO/12",
        description: "Descrição complementar que não deve substituir o título",
      },
    });
    const projectCell = html.match(/<td class="project-description"[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "";

    expect(projectCell).toContain("Implantação, modernização ou ampliação da solução de Circuito Fechado de Televisão (CFTV)");
    expect(projectCell).not.toContain("Modernização do CFTV da CRO/12");
    expect(projectCell).not.toContain("Descrição complementar");
    expect(html).toContain("Projeto CFTV: Modernização do CFTV da CRO/12");
    expect(html).not.toContain("Projeto CFTV: CRO/12");
  });

  it("usa uma descrição de redes que admite fibra óptica ou pontos lógicos separadamente", () => {
    const html = renderEstimateDocumentHtml({ ...input, ata: { ...input.ata, type: "FO_PONTO_LOGICO" } });
    expect(html).toContain("Projeto de Infraestrutura de Redes: CRO 12");
    expect(html).not.toContain("Projeto FO + Ponto Lógico");
    expect(html).toContain("Implantação, modernização ou ampliação da infraestrutura de redes (Fibra óptica ou Pontos lógicos)");
  });
});
