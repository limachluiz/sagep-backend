import { describe, expect, it } from "vitest";
import { parseExternalBalanceItem, parsePublicDecimal } from "../src/modules/compras-gov/contratos-gov-balance.service.js";

const context = {
  ataItemId: "item-13",
  itemNumber: "00013",
  referenceCode: "13",
  description: "Projeto executivo",
  unit: "UN",
  ataNumber: "00001/2026",
  uasg: "160016",
  pregaoNumber: "90012",
  pregaoYear: "2025",
  contratosAtaId: "327576",
};

const table = (headers: string[], rows: string[][]) => `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

const html = `
  <main>
    <p>Número da ata de registro de preços: 00001/2026</p>
    <p>Unidade gerenciadora: 160016 - CMDO CMA</p>
    <p>Número da compra/ Ano: 90012/2025</p>
    <p>Número do item: 00013</p>
    ${table(
      ["Código", "Unidade", "Tipo da unidade", "Quantidade registrada", "Quantidade disponível para remanejamento/empenho"],
      [["160016", "CMDO CMA", "Gerenciadora", "120.00000", "117.00000"]],
    )}
    <section id="tab4">
      <p>Quantidade Registrada/Autorizada: 180.00000</p>
      <p>Saldo para Empenho: 176.00000</p>
      ${table(
        ["Unidade", "Tipo", "Quantidade registrada", "Quantidade empenhada", "Saldo para empenho"],
        [["160016 - CMDO CMA", "Gerenciadora", "120.00000", "3.00000", "117.00000"]],
      )}
    </section>
    <section id="tab3">
      <p>Qtd. limite para adesão: 240.00000</p>
      <p>Quantidade disponivel para adesão: 179.00000</p>
    </section>
  </main>`;

describe("consulta pública de saldo da ATA", () => {
  it("preserva a precisão das quantidades públicas", () => {
    expect(parsePublicDecimal("3.287,15400")).toBe("3287.15400");
    expect(parsePublicDecimal("117.00000")).toBe("117.00000");
  });

  it("extrai o saldo da unidade gerenciadora e os totais publicados", () => {
    const result = parseExternalBalanceItem(html, context);
    expect(result.managerRegisteredQuantity).toBe("120.00000");
    expect(result.managerCommittedQuantity).toBe("3.00000");
    expect(result.managerAvailableQuantity).toBe("117.00000");
    expect(result.publishedTotalAvailableForCommitment).toBe("176.00000");
    expect(result.publishedAvailableForAdhesion).toBe("179.00000");
    expect(result.detailUrl).toContain("/00013/327576/show");
  });

  it("aceita item sem empenhos e calcula os totais pelas alocações publicadas", () => {
    const withoutCommitments = html
      .replace(/<section id="tab4">[\s\S]*?<\/section>/, '<section id="tab4">Não há informações de empenho</section>')
      .replace("<p>Quantidade disponivel para adesão: 179.00000</p>", "");

    const result = parseExternalBalanceItem(withoutCommitments, context);

    expect(result.units).toEqual([]);
    expect(result.managerRegisteredQuantity).toBe("120.00000");
    expect(result.managerCommittedQuantity).toBeNull();
    expect(result.managerAvailableQuantity).toBe("117.00000");
    expect(result.publishedTotalRegisteredAuthorized).toBe("120");
    expect(result.publishedTotalAvailableForCommitment).toBe("117");
    expect(result.publishedAvailableForAdhesion).toBe("240.00000");
  });

  it("rejeita uma página que pertença a outro pregão", () => {
    expect(() => parseExternalBalanceItem(html.replace("90012/2025", "90013/2025"), context)).toThrow(
      "não corresponde à ATA ou ao item",
    );
  });
});
