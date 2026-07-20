import { describe, expect, it } from "vitest";

import { WorkflowService } from "../src/modules/workflow/workflow.service.js";
import type { ProjectStageValue } from "../src/modules/workflow/workflow.types.js";

describe("status macro do workflow", () => {
  const service = new WorkflowService();

  it("mantém apenas a estimativa inicial em planejamento", () => {
    expect(service.getMacroStatusFromStage("ESTIMATIVA_PRECO")).toBe("PLANEJAMENTO");
  });

  it("considera em andamento todas as etapas ativas após a estimativa", () => {
    const activeStages: ProjectStageValue[] = [
      "AGUARDANDO_NOTA_CREDITO",
      "DIEX_REQUISITORIO",
      "AGUARDANDO_NOTA_EMPENHO",
      "OS_LIBERADA",
      "SERVICO_EM_EXECUCAO",
      "ANALISANDO_AS_BUILT",
      "ATESTAR_NF",
    ];

    activeStages.forEach((stage) => {
      expect(service.getMacroStatusFromStage(stage)).toBe("EM_ANDAMENTO");
    });
  });

  it("preserva os status terminais", () => {
    expect(service.getMacroStatusFromStage("SERVICO_CONCLUIDO")).toBe("CONCLUIDO");
    expect(service.getMacroStatusFromStage("CANCELADO")).toBe("CANCELADO");
  });
});
