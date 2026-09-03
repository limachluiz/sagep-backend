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
    expect(row).toContain("00001");
  });

  it("não repete a palavra Projeto no rodapé", () => {
    const html = renderEstimateDocumentHtml(input);

    expect(html).toContain("<strong>Projeto CFTV: CRO/12</strong>");
    expect(html).not.toContain("<strong>Projeto:</strong> Projeto");
  });

  it("exibe no campo central o título informado na criação do projeto", () => {
    const html = renderEstimateDocumentHtml({
      ...input,
      project: {
        ...input.project,
        title: "Modernização do CFTV da CRO/12",
        description: "Descrição complementar que não deve substituir o título",
      },
    });
    const projectCell = html.match(/<td class="project-description"[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "";

    expect(projectCell).toContain("Modernização do CFTV da CRO/12");
    expect(projectCell).not.toContain("Projeto de Circuito Fechado de Televisão");
    expect(projectCell).not.toContain("Descrição complementar");
  });
});
