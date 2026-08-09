import { describe, expect, it } from "vitest";

import { WorkflowService } from "../src/modules/workflow/workflow.service.js";
import type { ProjectStageValue } from "../src/modules/workflow/workflow.types.js";

describe("status macro do workflow", () => {
  const service = new WorkflowService();

  it("mantém apenas a estimativa inicial em planejamento", () => {
    expect(service.getMacroStatusFromStage("ESTIMATIVA_PRECO")).toBe("PLANEJAMENTO");
  });

  it("mantém em andamento um projeto que retorna à estimativa", () => {
    expect(service.getMacroStatusFromStage("ESTIMATIVA_PRECO", "EM_ANDAMENTO")).toBe(
      "EM_ANDAMENTO",
    );
    expect(service.getMacroStatusFromStage("ESTIMATIVA_PRECO", "CONCLUIDO")).toBe(
      "EM_ANDAMENTO",
    );
  });

  it("considera em andamento todas as etapas ativas após a estimativa", () => {
    const activeStages: ProjectStageValue[] = [
      "AGUARDANDO_NOTA_CREDITO",
      "DIEX_REQUISITORIO",
      "AGUARDANDO_NOTA_EMPENHO",
      "OS_LIBERADA",
      "AGUARDANDO_OS_ASSINADA",
      "AGUARDANDO_INICIO_EXECUCAO",
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

  it("permite arquivar o projeto somente antes do início da execução", () => {
    const stagesBeforeExecution: ProjectStageValue[] = [
      "ESTIMATIVA_PRECO",
      "AGUARDANDO_NOTA_CREDITO",
      "DIEX_REQUISITORIO",
      "AGUARDANDO_NOTA_EMPENHO",
      "OS_LIBERADA",
      "AGUARDANDO_OS_ASSINADA",
      "AGUARDANDO_INICIO_EXECUCAO",
    ];

    stagesBeforeExecution.forEach((stage) => {
      expect(() => service.assertCanArchiveProject({ id: "project-1", stage })).not.toThrow();
    });

    const blockedStages: ProjectStageValue[] = [
      "SERVICO_EM_EXECUCAO",
      "ANALISANDO_AS_BUILT",
      "ATESTAR_NF",
      "SERVICO_CONCLUIDO",
      "CANCELADO",
    ];

    blockedStages.forEach((stage) => {
      expect(() => service.assertCanArchiveProject({ id: "project-1", stage })).toThrow(
        "já entrou em execução",
      );
    });
  });

  it("bloqueia o início até o recebimento da OS assinada nas OS novas", () => {
    const snapshot = {
      id: "project-1",
      stage: "AGUARDANDO_INICIO_EXECUCAO" as const,
      creditNoteNumber: "NC-1",
      diexNumber: "DIEx-1",
      commitmentNoteNumber: "NE-1",
      serviceOrderNumber: "OS-1",
      serviceOrderSignatureRequired: true,
    };

    expect(() =>
      service.validateStageRequirements(
        "AGUARDANDO_INICIO_EXECUCAO",
        snapshot,
        1,
      ),
    ).toThrow("registre o link e a data de recebimento da OS assinada");

    expect(() =>
      service.validateStageRequirements(
        "AGUARDANDO_INICIO_EXECUCAO",
        {
          ...snapshot,
          signedServiceOrderLink: "https://drive.example/os-assinada.pdf",
          signedServiceOrderReceivedAt: new Date("2026-07-28"),
        },
        1,
      ),
    ).not.toThrow();
  });

  it("orienta o registro da OS assinada antes de iniciar a execução", () => {
    expect(
      service.getNextAction({
        id: "project-1",
        stage: "AGUARDANDO_OS_ASSINADA",
        serviceOrderNumber: "OS-1",
        serviceOrderSignatureRequired: true,
      }),
    ).toMatchObject({
      code: "REGISTRAR_OS_ASSINADA",
      targetStage: "AGUARDANDO_INICIO_EXECUCAO",
    });
  });
});
