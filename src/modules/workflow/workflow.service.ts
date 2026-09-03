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
  OS_LIBERADA: ["AGUARDANDO_OS_ASSINADA", "SERVICO_EM_EXECUCAO", "CANCELADO"],
  AGUARDANDO_OS_ASSINADA: ["AGUARDANDO_INICIO_EXECUCAO", "CANCELADO"],
  AGUARDANDO_INICIO_EXECUCAO: ["SERVICO_EM_EXECUCAO", "CANCELADO"],
  SERVICO_EM_EXECUCAO: ["ANALISANDO_AS_BUILT", "CANCELADO"],
  ANALISANDO_AS_BUILT: ["ATESTAR_NF", "SERVICO_EM_EXECUCAO", "CANCELADO"],
  ATESTAR_NF: ["ENTREGA_TECNICA", "CANCELADO"],
  ENTREGA_TECNICA: ["SERVICO_CONCLUIDO", "CANCELADO"],
  SERVICO_CONCLUIDO: [],
  CANCELADO: [],
};

const DELIVERY_REPORT_TIME_ZONE = "America/Manaus";

const instantCalendarDay = (value: Date | string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DELIVERY_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const signedCalendarDay = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

export class WorkflowService {
  isDeliveryReportSignatureValid(snapshot: Pick<WorkflowProjectSnapshot, "deliveryReportGeneratedAt" | "deliveryReportSignedAt">) {
    if (!snapshot.deliveryReportGeneratedAt || !snapshot.deliveryReportSignedAt) return false;
    return signedCalendarDay(snapshot.deliveryReportSignedAt) >= instantCalendarDay(snapshot.deliveryReportGeneratedAt);
  }

  isDeliveryReportSignatureInFuture(signedAt: Date, now = new Date()) {
    return signedCalendarDay(signedAt) > instantCalendarDay(now);
  }

  private stageOrder: ProjectStageValue[] = [
    "ESTIMATIVA_PRECO",
    "AGUARDANDO_NOTA_CREDITO",
    "DIEX_REQUISITORIO",
    "AGUARDANDO_NOTA_EMPENHO",
    "OS_LIBERADA",
    "AGUARDANDO_OS_ASSINADA",
    "AGUARDANDO_INICIO_EXECUCAO",
    "SERVICO_EM_EXECUCAO",
    "ANALISANDO_AS_BUILT",
    "ATESTAR_NF",
    "ENTREGA_TECNICA",
    "SERVICO_CONCLUIDO",
    "CANCELADO",
  ];

  getAllowedNextStages(stage: ProjectStageValue) {
    return stageTransitions[stage] ?? [];
  }

  getMacroStatusFromStage(
    stage: ProjectStageValue,
    previousStatus?: ProjectStatusValue,
  ): ProjectStatusValue {
    if (stage === "SERVICO_CONCLUIDO") {
      return "CONCLUIDO";
    }

    if (stage === "CANCELADO") {
      return "CANCELADO";
    }

    if (stage !== "ESTIMATIVA_PRECO") {
      return "EM_ANDAMENTO";
    }

    if (previousStatus && previousStatus !== "PLANEJAMENTO") {
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
        "Não é possível excluir o DIEx quando o projeto já avançou além da etapa de DIEx",
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
        "Não é possível excluir a OS quando o projeto já entrou em execução",
        409,
      );
    }
  }

  assertCanArchiveProject(project: WorkflowProjectSnapshot) {
    if (!this.isStageBefore(project.stage, "SERVICO_EM_EXECUCAO")) {
      throw new AppError(
        "Não é possível arquivar um projeto que já entrou em execução",
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
        "Para avançar o fluxo, o projeto precisa ter pelo menos uma estimativa finalizada",
        409,
      );
    }

    if (this.isStageAtOrBeyond(stage, "DIEX_REQUISITORIO")) {
      if (!snapshot.creditNoteNumber && !snapshot.creditNoteReceivedAt) {
        throw new AppError(
          "Para avançar até DIEx Requisitório, informe o número ou a data de recebimento da Nota de Crédito",
          409,
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "AGUARDANDO_NOTA_EMPENHO")) {
      if (!snapshot.diexNumber && !snapshot.diexIssuedAt) {
        throw new AppError(
          "Para avançar após o DIEx Requisitório, informe o número ou a data do DIEx",
          409,
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "OS_LIBERADA")) {
      if (!snapshot.commitmentNoteNumber && !snapshot.commitmentNoteReceivedAt) {
        throw new AppError(
          "Para liberar a OS, informe o número ou a data da Nota/Empenho",
          409,
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "AGUARDANDO_OS_ASSINADA")) {
      if (!snapshot.serviceOrderNumber && !snapshot.serviceOrderIssuedAt) {
        throw new AppError(
          "Para aguardar a OS assinada, a Ordem de Serviço precisa estar emitida",
          409,
          "WORKFLOW_SERVICE_ORDER_REQUIRED",
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "SERVICO_EM_EXECUCAO")) {
      if (!snapshot.serviceOrderNumber && !snapshot.serviceOrderIssuedAt) {
        throw new AppError(
          "Para iniciar a execução, informe o número ou a data da Ordem de Serviço",
          409,
        );
      }

      if (!snapshot.executionStartedAt) {
        throw new AppError(
          "Para colocar o serviço em execução, informe a data de início da execução",
          409,
        );
      }
    }

    if (
      this.isStageAtOrBeyond(stage, "AGUARDANDO_INICIO_EXECUCAO") &&
      snapshot.serviceOrderSignatureRequired
    ) {
      if (!snapshot.signedServiceOrderLink || !snapshot.signedServiceOrderReceivedAt) {
        throw new AppError(
          "Para liberar o início da execução, registre o link e a data de recebimento da OS assinada",
          409,
          "WORKFLOW_SIGNED_SERVICE_ORDER_REQUIRED",
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "ANALISANDO_AS_BUILT")) {
      if (!snapshot.asBuiltReceivedAt) {
        throw new AppError(
          "Para entrar na etapa de análise do As-Built, informe a data de recebimento do As-Built",
          409,
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "ATESTAR_NF")) {
      if (!snapshot.asBuiltApprovedAt) {
        throw new AppError(
          "Para avançar para o ateste da NF, o As-Built precisa estar aprovado",
          409,
        );
      }

      if (!snapshot.asBuiltLink) {
        throw new AppError(
          "Para finalizar a etapa do As-Built, informe o link do arquivo ou pasta em nuvem",
          409,
          "WORKFLOW_AS_BUILT_LINK_REQUIRED",
        );
      }
    }

    if (this.isStageAtOrBeyond(stage, "ENTREGA_TECNICA")) {
      if (!snapshot.invoiceAttestedAt) {
        throw new AppError("Para iniciar a entrega técnica, informe a data de atesto da NF", 409);
      }
      if (!snapshot.serviceCompletedAt) {
        throw new AppError("Para iniciar a entrega técnica, informe a data de conclusão da execução", 409);
      }
    }

    if (stage === "SERVICO_CONCLUIDO") {
      if (!snapshot.deliveryReportGeneratedAt) throw new AppError("Gere o Relatório Técnico de Conclusão e Entrega antes de concluir o projeto", 409);
      if (!snapshot.deliveryReportSignedAt) throw new AppError("Confirme a revisão e assinatura do relatório de entrega antes de concluir o projeto", 409);
      if (!this.isDeliveryReportSignatureValid(snapshot)) throw new AppError("A assinatura registrada é anterior à versão atual do relatório; confirme novamente a revisão e assinatura", 409);
    }
  }

  getProjectPatchAfterDiexCreated(project: WorkflowProjectSnapshot) {
    return {
      ...(this.isStageBefore(project.stage, "AGUARDANDO_NOTA_EMPENHO")
        ? {
            stage: "AGUARDANDO_NOTA_EMPENHO" as const,
            status: this.getMacroStatusFromStage("AGUARDANDO_NOTA_EMPENHO"),
          }
        : {}),
      ...(project.diexNumber ? { diexNumber: project.diexNumber } : {}),
      ...(project.diexIssuedAt ? { diexIssuedAt: project.diexIssuedAt } : {}),
    };
  }

  getProjectPatchAfterEstimateFinalized(project: WorkflowProjectSnapshot) {
    return {
      ...(project.stage === "ESTIMATIVA_PRECO"
        ? {
            stage: "AGUARDANDO_NOTA_CREDITO" as const,
            status: this.getMacroStatusFromStage("AGUARDANDO_NOTA_CREDITO"),
          }
        : {}),
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
      ...(project.stage === "OS_LIBERADA" ||
        project.stage === "AGUARDANDO_NOTA_EMPENHO"
        ? {
            stage: "AGUARDANDO_OS_ASSINADA" as const,
            status: this.getMacroStatusFromStage("AGUARDANDO_OS_ASSINADA"),
          }
        : {}),
      serviceOrderSignatureRequired: true,
      signedServiceOrderLink: null,
      signedServiceOrderReceivedAt: null,
      signedServiceOrderNotes: null,
      signedServiceOrderRegisteredById: null,
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
      serviceOrderSignatureRequired: false,
      signedServiceOrderLink: null,
      signedServiceOrderReceivedAt: null,
      signedServiceOrderNotes: null,
      signedServiceOrderRegisteredById: null,
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
        if (!project.diexNumber && !project.diexIssuedAt) {
          return {
            code: "EMITIR_DIEX",
            label: "Emitir DIEx requisitório",
            description:
              "Com a Nota de Crédito registrada, formalize o DIEx requisitório.",
            targetStage: "DIEX_REQUISITORIO",
          };
        }

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
        if (!project.serviceOrderNumber && !project.serviceOrderIssuedAt) {
          return {
            code: "EMITIR_OS",
            label: "Emitir Ordem de Serviço",
            description: "Com o empenho lançado, a OS já pode ser emitida.",
            targetStage: "OS_LIBERADA",
          };
        }

        return {
          code: "INICIAR_EXECUCAO",
          label: "Iniciar execução",
          description: "Registre o início da execução do serviço.",
          targetStage: "SERVICO_EM_EXECUCAO",
        };
      case "AGUARDANDO_OS_ASSINADA":
        return {
          code: "REGISTRAR_OS_ASSINADA",
          label: "Registrar OS assinada",
          description:
            "Informe o link e a data de recebimento da Ordem de Serviço assinada pela contratada.",
          targetStage: "AGUARDANDO_INICIO_EXECUCAO",
        };
      case "AGUARDANDO_INICIO_EXECUCAO":
        return {
          code: "INICIAR_EXECUCAO",
          label: "Iniciar execução",
          description: "A OS assinada foi recebida. Registre o início real da execução.",
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
          code: "VALIDAR_AS_BUILT",
          label: "Validar As-Built",
          description:
            "Analise o As-Built recebido para aprovar e seguir ao ateste da NF, ou reprovar para correção.",
          targetStage: "ATESTAR_NF",
        };
      case "ATESTAR_NF":
        if (!project.invoiceAttestedAt) {
          return {
            code: "ATESTAR_NF",
            label: "Atestar NF",
            description: "Conclua a análise técnica e faça o ateste da NF.",
            targetStage: "ATESTAR_NF",
          };
        }

        return { code: "PREPARAR_ENTREGA_TECNICA", label: "Iniciar entrega técnica", description: "Registre o encerramento da execução e prepare as evidências do relatório.", targetStage: "ENTREGA_TECNICA" };
      case "ENTREGA_TECNICA":
        if (!project.deliveryReportGeneratedAt) return { code: "GERAR_RELATORIO_ENTREGA", label: "Gerar relatório de entrega", description: "Revise as evidências selecionadas e gere o PDF.", targetStage: "ENTREGA_TECNICA" };
        if (!this.isDeliveryReportSignatureValid(project)) return { code: "GERAR_RELATORIO_ENTREGA", label: "Registrar relatório assinado", description: "Após a revisão e assinatura da versão atual, registre a confirmação para concluir o projeto.", targetStage: "ENTREGA_TECNICA" };
        return { code: "CONCLUIR_SERVICO", label: "Concluir projeto", description: "O relatório foi gerado e assinado. Conclua o workflow.", targetStage: "SERVICO_CONCLUIDO" };
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
