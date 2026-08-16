import { describe, expect, it } from "vitest";
import { militaryOrganizationsCsvTemplate, parseMilitaryOrganizationsCsv } from "../src/modules/military-organizations/military-organizations.csv.js";

describe("importação CSV de OMs", () => {
  it("interpreta o modelo separado por ponto e vírgula", () => {
    const rows = parseMilitaryOrganizationsCsv(militaryOrganizationsCsvTemplate());

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sigla: "4º CTA", cityName: "Manaus", stateUf: "AM", isActive: true, issues: [] });
  });

  it("aceita vírgulas, campos entre aspas e status inativo", () => {
    const rows = parseMilitaryOrganizationsCsv('sigla,nome,cidade,uf,ativo\n"17º B LOG","17º Batalhão, Logístico","Porto Velho",RO,NÃO');

    expect(rows[0]).toMatchObject({ sigla: "17º B LOG", name: "17º Batalhão, Logístico", isActive: false, issues: [] });
  });

  it("aponta UF, status e siglas duplicadas sem descartar as demais linhas", () => {
    const rows = parseMilitaryOrganizationsCsv("sigla;nome;cidade;uf;ativo\nOM X;Organização X;Manaus;PA;TALVEZ\nom x;Organização repetida;Manaus;AM;SIM");

    expect(rows[0].issues).toEqual(expect.arrayContaining(["UF deve ser AM, RO, RR ou AC", "Ativo deve ser SIM ou NÃO"]));
    expect(rows[1].issues[0]).toContain("Sigla repetida");
  });
});
