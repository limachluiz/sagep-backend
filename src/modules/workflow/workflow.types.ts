export type ProjectStageValue =
  | "ESTIMATIVA_PRECO"
  | "AGUARDANDO_NOTA_CREDITO"
  | "DIEX_REQUISITORIO"
  | "AGUARDANDO_NOTA_EMPENHO"
  | "OS_LIBERADA"
  | "SERVICO_EM_EXECUCAO"
  | "ANALISANDO_AS_BUILT"
  | "ATESTAR_NF"
  | "SERVICO_CONCLUIDO"
  | "CANCELADO";

export type WorkflowActionCode =
  | "FINALIZAR_ESTIMATIVA"
  | "INFORMAR_NOTA_CREDITO"
  | "EMITIR_DIEX"
  | "INFORMAR_NOTA_EMPENHO"
  | "EMITIR_OS"
  | "INICIAR_EXECUCAO"
  | "ANEXAR_AS_BUILT"
  | "VALIDAR_AS_BUILT"
  | "ATESTAR_NF"
  | "CONCLUIR_SERVICO"
  | "SEM_ACAO";

export type WorkflowAction = {
  code: WorkflowActionCode;
  label: string;
  description: string;
  targetStage?: ProjectStageValue;
};

export type WorkflowProjectSnapshot = {
  id: string;
  projectCode?: number;
  stage: ProjectStageValue;
  creditNoteNumber?: string | null;
  creditNoteReceivedAt?: Date | null;
  diexNumber?: string | null;
  diexIssuedAt?: Date | null;
  commitmentNoteNumber?: string | null;
  commitmentNoteReceivedAt?: Date | null;
  serviceOrderNumber?: string | null;
  serviceOrderIssuedAt?: Date | null;
  executionStartedAt?: Date | null;
  asBuiltReceivedAt?: Date | null;
  asBuiltReviewedAt?: Date | null;
  asBuiltApprovedAt?: Date | null;
  asBuiltRejectedAt?: Date | null;
  asBuiltRejectionReason?: string | null;
  invoiceAttestedAt?: Date | null;
  serviceCompletedAt?: Date | null;
};

export type ProjectStatusValue =
  | "PLANEJAMENTO"
  | "EM_ANDAMENTO"
  | "PAUSADO"
  | "CONCLUIDO"
  | "CANCELADO";
