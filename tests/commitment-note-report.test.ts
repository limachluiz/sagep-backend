import { describe, expect, it } from "vitest";
import { commitmentNoteReportQuerySchema } from "../src/modules/reports/commitment-note-report.schemas.js";
import { filterCommitmentNoteReportRows } from "../src/modules/reports/commitment-note-report.service.js";

const rows = [
  { externalCode: "160016000012026NE000021", number: "2026NE000021", managementUnit: "160016", origin: "IMPORTED", supplierName: "FORNECEDOR ALFA LTDA", supplierCnpj: "00000000000000", attendedOm: { id: "om-1", sigla: "2ª Cia Sup", name: "Segunda Companhia de Suprimento", cityName: "Manaus", stateUf: "AM", isActive: true }, observation: "Enlace principal", issuedAt: "2026-01-21", updatedAt: new Date(), current: 100, liquidated: 100, paid: 100, status: "PAGA", inconsistent: false, incomplete: false, project: null },
  { externalCode: "160016000012026NE000572", number: "2026NE000572", managementUnit: "160016", origin: "IMPORTED", supplierName: "FORNECEDOR BETA LTDA", supplierCnpj: "", attendedOm: null, observation: null, issuedAt: "04/05/2026", updatedAt: new Date(), current: 200, liquidated: 200, paid: 200, status: "PAGA", inconsistent: false, incomplete: false, project: null },
] as never[];

describe("relatório financeiro de Notas de Empenho", () => {
  it("filtra dinamicamente por fornecedor, situação e período", () => {
    const filters = commitmentNoteReportQuerySchema.parse({ supplier: "FORNECEDOR ALFA LTDA", status: "PAGA", issuedFrom: "2026-01-01", issuedTo: "2026-02-01" });
    expect(filterCommitmentNoteReportRows(rows, filters).map((row) => row.number)).toEqual(["2026NE000021"]);
  });

  it("inclui a OM atendida e a observação na busca textual", () => {
    const filters = commitmentNoteReportQuerySchema.parse({ search: "2ª cia sup" });
    expect(filterCommitmentNoteReportRows(rows, filters).map((row) => row.number)).toEqual(["2026NE000021"]);
    expect(filterCommitmentNoteReportRows(rows, commitmentNoteReportQuerySchema.parse({ search: "enlace principal" })).map((row) => row.number)).toEqual(["2026NE000021"]);
  });

  it("aceita datas brasileiras salvas nos snapshots e seleção explícita", () => {
    const filters = commitmentNoteReportQuerySchema.parse({ issuedFrom: "2026-05-01", issuedTo: "2026-05-31", codes: "160016000012026NE000572" });
    expect(filterCommitmentNoteReportRows(rows, filters).map((row) => row.number)).toEqual(["2026NE000572"]);
  });

  it("rejeita intervalo invertido e códigos inválidos", () => {
    expect(() => commitmentNoteReportQuerySchema.parse({ issuedFrom: "2026-05-02", issuedTo: "2026-05-01" })).toThrow();
    expect(() => commitmentNoteReportQuerySchema.parse({ codes: "NE000001" })).toThrow();
  });
});
