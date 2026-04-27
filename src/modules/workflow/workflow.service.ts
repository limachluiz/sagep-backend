import { AppError } from "../../shared/app-error.js";
import {
  type ProjectStatusValue,
  type ProjectStageValue,
  type WorkflowAction,
  type WorkflowProjectSnapshot,
} from "./workflow.types.js";

const stageTransitions: Record<ProjectStageValue, ProjectStageValue[]> = {
  ESTIMATIVA_PRECO: ["AGUARDANDO_NOTA_CREDITO", "CANCELADO"],
  AGUARDANDO_NOTA_CREDITO: ["DIEX_REQUISITORIO", "CANCELADO"],
  DIEX_REQUISITORIO: ["AGUARDANDO_NOTA_EMPENHO", "CANCELADO"],
  AGUARDANDO_NOTA_EMPENHO: ["OS_LIBERADA", "CANCELADO"],
  OS_LIBERADA: ["SERVICO_EM_EXECUCAO", "CANCELADO"],
  SERVICO_EM_EXECUCAO: ["ANALISANDO_AS_BUILT", "CANCELADO"],
  ANALISANDO_AS_BUILT: ["ATESTAR_NF", "CANCELADO"],
  ATESTAR_NF: ["SERVICO_CONCLUIDO", "CANCELADO"],
  SERVICO_CONCLUIDO: [],
  CANCELADO: [],
};

export class WorkflowService {
  private stageOrder: ProjectStageValue[] = [
    "ESTIMATIVA_PRECO",
    "AGUARDANDO_NOTA_CREDITO",
    "DIEX_REQUISITORIO",
    "AGUARDANDO_NOTA_EMPENHO",
    "OS_LIBERADA",
    "SERVICO_EM_EXECUCAO",
    "ANALISANDO_AS_BUILT",
    "ATESTAR_NF",
    "SERVICO_CONCLUIDO",
    "CANCELADO",
  ];

  getAllowedNextStages(stage: ProjectStageValue) {
    return stageTransitions[stage] ?? [];
  }

  getMacroStatusFromStage(stage: ProjectStageValue): ProjectStatusValue {
    if (stage === "SERVICO_CONCLUIDO") {
      return "CONCLUIDO";
    }

    if (stage === "CANCELADO") {
      return "CANCELADO";
    }

    if (
      stage === "OS_LIBERADA" ||
      stage === "SERVICO_EM_EXECUCAO" ||
      stage === "ANALISANDO_AS_BUILT" ||
      stage === "ATESTAR_NF"
    ) {
      return "EM_ANDAMENTO";
    }

    return "PLANEJAMENTO";
  }

  isStageBefore(current: ProjectStageValue, target: ProjectStageValue) {
    return this.stageOrder.indexOf(current) < this.stageOrder.indexOf(target);
  }

  isStageAtOrBeyond(stage: ProjectStageValue, checkpoint: ProjectStageValue) {
    return this.stageOrder.indexOf(stage) >= this.stageOrder.indexOf(checkpoint);
  }

  assertStageTransition(currentStage: ProjectStageValue, nextStage: ProjectStageValue) {
    if (currentStage === nextStage) {
      return;
    }

    const allowed = this.getAllowedNextStages(currentStage);

    if (!allowed.includes(nextStage)) {
      throw new AppError(
        `Transição inválida: o projeto está em ${currentStage} e só pode avançar para ${allowed.join(", ") || "nenhuma etapa"}`,
        409,
      );
    }
  }

  assertCanCreateDiex(project: WorkflowProjectSnapshot) {
    if (project.stage !== "AGUARDANDO_NOTA_CREDITO" && project.stage !== "DIEX_REQUISITORIO") {
      throw new AppError(
        "O projeto precisa estar em AGUARDANDO_NOTA_CREDITO ou DIEX_REQUISITORIO para gerar DIEx",
        409,
      );
    }

    if (!project.creditNoteNumber && !project.creditNoteReceivedAt) {
      throw new AppError(
        "Para gerar o DIEx, informe a Nota de Crédito do projeto",
        409,
      );
    }
  }

  assertCanRemoveDiex(project: WorkflowProjectSnapshot) {
    if (!this.isStageBefore(project.stage, "AGUARDANDO_NOTA_EMPENHO")) {
      throw new AppError(
        "NÃ£o Ã© possÃ­vel excluir o DIEx quando o projeto jÃ¡ avanÃ§ou alÃ©m da etapa de DIEx",
        409,
      );
    }
  }

  assertCanCreateServiceOrder(project: WorkflowProjectSnapshot) {
    if (project.stage !== "AGUARDANDO_NOTA_EMPENHO" && project.stage !== "OS_LIBERADA") {
      throw new AppError(
        "O projeto precisa estar em AGUARDANDO_NOTA_EMPENHO ou OS_LIBERADA para gerar OS",
        409,
      );
    }

    if (!project.commitmentNoteNumber && !project.commitmentNoteReceivedAt) {
      throw new AppError(
        "Para gerar a OS, o projeto precisa ter Nota de Empenho informada",
        409,
      );
    }
  }

  assertCanRemoveServiceOrder(project: WorkflowProjectSnapshot) {
    if (!this.isStageBefore(project.stage, "SERVICO_EM_EXECUCAO")) {
      throw new AppError(
        "NÃ£o Ã© possÃ­vel excluir a OS quando o projeto jÃ¡ entrou em execuÃ§Ã£o",
        409,
      );
    }
  }

  validateStageRequirements(
    stage: ProjectStageValue,
    snapshot: WorkflowProjectSnapshot,
    finalizedEstimateCount: number,
  ) {
    if (
      stage !== "ESTIMATIVA_PRECO" &&
      stage !== "CANCELADO" &&
      finalizedEstimateCount === 0
    ) {
      throw new AppError(
        "Para avanÃ§ar o fluxo, o projeto precisa ter pelo menos uma estimativa finalizada",
        409,
      );
    }

    if (this.isStageAtOrBeyond(stage, "DIEX_REQUISITORIO")) {
      if (!snapshot.creditNoteNumber && !snapshot.creditNoteReceivedAt) {
        throw new AppError(
          "Para avanÃ§ar atÃ© DIEx RequisitÃ³rio, informe o nÃºmero ou a data de recebimento da Nota de CrÃ©dito",
          409,
        );
      }

      if (!snapshot.diexNumber && !snapshot.diexIssuedAt) {
        throw new AppError(
          "Para avanÃ§ar atÃ© DIEx RequisitÃ³rio, informe o nÃºmero ou a data do DIEx",
          409,
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "OS_LIBERADA")) {
      if (!snapshot.commitmentNoteNumber && !snapshot.commitmentNoteReceivedAt) {
        throw new AppError(
          "Para liberar a OS, informe o nÃºmero ou a data da Nota/Empenho",
          409,
        );
      }

      if (!snapshot.serviceOrderNumber && !snapshot.serviceOrderIssuedAt) {
        throw new AppError(
          "Para liberar a OS, informe o nÃºmero ou a data da Ordem de ServiÃ§o",
          409,
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "SERVICO_EM_EXECUCAO")) {
      if (!snapshot.executionStartedAt) {
        throw new AppError(
          "Para colocar o serviÃ§o em execuÃ§Ã£o, informe a data de inÃ­cio da execuÃ§Ã£o",
          409,
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "ANALISANDO_AS_BUILT")) {
      if (!snapshot.asBuiltReceivedAt) {
        throw new AppError(
          "Para entrar na etapa de anÃ¡lise do As-Built, informe a data de recebimento do As-Built",
          409,
        );
      }
    }

    if (stage === "SERVICO_CONCLUIDO") {
      if (!snapshot.invoiceAttestedAt) {
        throw new AppError(
          "Para concluir o serviÃ§o, informe a data de atesto da NF",
          409,
        );
      }

      if (!snapshot.serviceCompletedAt) {
        throw new AppError(
          "Para concluir o serviÃ§o, informe a data de conclusÃ£o do serviÃ§o",
          409,
        );
      }
    }
  }

  getProjectPatchAfterDiexCreated(project: WorkflowProjectSnapshot) {
    return {
      ...(project.stage === "AGUARDANDO_NOTA_CREDITO"
        ? {
            stage: "DIEX_REQUISITORIO" as const,
            status: this.getMacroStatusFromStage("DIEX_REQUISITORIO"),
          }
        : {}),
      ...(project.diexNumber ? { diexNumber: project.diexNumber } : {}),
      ...(project.diexIssuedAt ? { diexIssuedAt: project.diexIssuedAt } : {}),
    };
  }

  getProjectPatchAfterDiexRemoved() {
    return {
      diexNumber: null,
      diexIssuedAt: null,
      stage: "AGUARDANDO_NOTA_CREDITO" as const,
      status: this.getMacroStatusFromStage("AGUARDANDO_NOTA_CREDITO"),
    };
  }

  getProjectPatchAfterServiceOrderCreated(project: WorkflowProjectSnapshot) {
    return {
      ...(project.stage === "AGUARDANDO_NOTA_EMPENHO"
        ? {
            stage: "OS_LIBERADA" as const,
            status: this.getMacroStatusFromStage("OS_LIBERADA"),
          }
        : {}),
      ...(project.serviceOrderNumber
        ? { serviceOrderNumber: project.serviceOrderNumber }
        : {}),
      ...(project.serviceOrderIssuedAt
        ? { serviceOrderIssuedAt: project.serviceOrderIssuedAt }
        : {}),
    };
  }

  getProjectPatchAfterServiceOrderRemoved() {
    return {
      serviceOrderNumber: null,
      serviceOrderIssuedAt: null,
      stage: "AGUARDANDO_NOTA_EMPENHO" as const,
      status: this.getMacroStatusFromStage("AGUARDANDO_NOTA_EMPENHO"),
    };
  }

  getNextAction(project: WorkflowProjectSnapshot): WorkflowAction {
    switch (project.stage) {
      case "ESTIMATIVA_PRECO":
        return {
          code: "FINALIZAR_ESTIMATIVA",
          label: "Finalizar estimativa",
          description: "Finalize a estimativa para avançar o fluxo do projeto.",
          targetStage: "AGUARDANDO_NOTA_CREDITO",
        };
      case "AGUARDANDO_NOTA_CREDITO":
        return {
          code: "EMITIR_DIEX",
          label: "Emitir DIEx requisitório",
          description:
            "Com a Nota de Crédito em mãos, o próximo passo é formalizar o DIEx.",
          targetStage: "DIEX_REQUISITORIO",
        };
      case "DIEX_REQUISITORIO":
        return {
          code: "INFORMAR_NOTA_EMPENHO",
          label: "Informar Nota de Empenho",
          description: "Após o DIEx, registre os dados da Nota de Empenho.",
          targetStage: "AGUARDANDO_NOTA_EMPENHO",
        };
      case "AGUARDANDO_NOTA_EMPENHO":
        if (!project.commitmentNoteNumber && !project.commitmentNoteReceivedAt) {
          return {
            code: "INFORMAR_NOTA_EMPENHO",
            label: "Informar Nota de Empenho",
            description: "Antes de emitir a OS, registre os dados da Nota de Empenho.",
            targetStage: "AGUARDANDO_NOTA_EMPENHO",
          };
        }

        return {
          code: "EMITIR_OS",
          label: "Emitir Ordem de Serviço",
          description: "Com o empenho lançado, a OS já pode ser emitida.",
          targetStage: "OS_LIBERADA",
        };
      case "OS_LIBERADA":
        return {
          code: "INICIAR_EXECUCAO",
          label: "Iniciar execução",
          description: "Registre o início da execução do serviço.",
          targetStage: "SERVICO_EM_EXECUCAO",
        };
      case "SERVICO_EM_EXECUCAO":
        return {
          code: "ANEXAR_AS_BUILT",
          label: "Receber As-Built",
          description: "Após a execução, informe o recebimento do As-Built.",
          targetStage: "ANALISANDO_AS_BUILT",
        };
      case "ANALISANDO_AS_BUILT":
        return {
          code: "ATESTAR_NF",
          label: "Atestar NF",
          description: "Conclua a análise técnica e faça o ateste da NF.",
          targetStage: "ATESTAR_NF",
        };
      case "ATESTAR_NF":
        return {
          code: "CONCLUIR_SERVICO",
          label: "Concluir serviço",
          description: "Registre a conclusão final do serviço.",
          targetStage: "SERVICO_CONCLUIDO",
        };
      default:
        return {
          code: "SEM_ACAO",
          label: "Sem próxima ação",
          description: "O projeto não possui novas ações no fluxo atual.",
        };
    }
  }
}

export const workflowService = new WorkflowService();
