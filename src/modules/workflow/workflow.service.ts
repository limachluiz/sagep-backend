import { AppError } from "../../shared/app-error.js";
import {
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
  getAllowedNextStages(stage: ProjectStageValue) {
    return stageTransitions[stage] ?? [];
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
