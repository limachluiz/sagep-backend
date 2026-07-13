export const ERROR_CODES = {
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  PROJECT_ACCESS_DENIED: "PROJECT_ACCESS_DENIED",
  ESTIMATE_NOT_FOUND: "ESTIMATE_NOT_FOUND",
  ESTIMATE_ACCESS_DENIED: "ESTIMATE_ACCESS_DENIED",
  ATA_NOT_FOUND: "ATA_NOT_FOUND",
  ATA_ITEM_NOT_FOUND: "ATA_ITEM_NOT_FOUND",
  ATA_COVERAGE_GROUP_NOT_FOUND: "ATA_COVERAGE_GROUP_NOT_FOUND",
  ATA_BALANCE_NOT_FOUND: "ATA_BALANCE_NOT_FOUND",
  ATA_BALANCE_INSUFFICIENT: "ATA_BALANCE_INSUFFICIENT",
  ATA_BALANCE_INCONSISTENT: "ATA_BALANCE_INCONSISTENT",
  DIEX_NOT_FOUND: "DIEX_NOT_FOUND",
  DIEX_ACCESS_DENIED: "DIEX_ACCESS_DENIED",
  SERVICE_ORDER_NOT_FOUND: "SERVICE_ORDER_NOT_FOUND",
  SERVICE_ORDER_ACCESS_DENIED: "SERVICE_ORDER_ACCESS_DENIED",
  WORKFLOW_INVALID_TRANSITION: "WORKFLOW_INVALID_TRANSITION",
  WORKFLOW_ESTIMATE_REQUIRED: "WORKFLOW_ESTIMATE_REQUIRED",
  WORKFLOW_CREDIT_NOTE_REQUIRED: "WORKFLOW_CREDIT_NOTE_REQUIRED",
  WORKFLOW_DIEX_REQUIRED: "WORKFLOW_DIEX_REQUIRED",
  WORKFLOW_COMMITMENT_NOTE_REQUIRED: "WORKFLOW_COMMITMENT_NOTE_REQUIRED",
  WORKFLOW_SERVICE_ORDER_REQUIRED: "WORKFLOW_SERVICE_ORDER_REQUIRED",
  WORKFLOW_EXECUTION_START_REQUIRED: "WORKFLOW_EXECUTION_START_REQUIRED",
  WORKFLOW_AS_BUILT_REQUIRED: "WORKFLOW_AS_BUILT_REQUIRED",
  WORKFLOW_AS_BUILT_APPROVAL_REQUIRED: "WORKFLOW_AS_BUILT_APPROVAL_REQUIRED",
  WORKFLOW_AS_BUILT_LINK_REQUIRED: "WORKFLOW_AS_BUILT_LINK_REQUIRED",
  WORKFLOW_INVOICE_ATTEST_REQUIRED: "WORKFLOW_INVOICE_ATTEST_REQUIRED",
  WORKFLOW_SERVICE_COMPLETION_REQUIRED: "WORKFLOW_SERVICE_COMPLETION_REQUIRED",
} as const;

export type DomainErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const exactMessageCodes = new Map<string, DomainErrorCode>([
  ["Projeto não encontrado", ERROR_CODES.PROJECT_NOT_FOUND],
  ["Estimativa não encontrada", ERROR_CODES.ESTIMATE_NOT_FOUND],
  ["Ata não encontrada", ERROR_CODES.ATA_NOT_FOUND],
  ["Item da ata não encontrado", ERROR_CODES.ATA_ITEM_NOT_FOUND],
  ["Grupo de cobertura não encontrado para esta ata", ERROR_CODES.ATA_COVERAGE_GROUP_NOT_FOUND],
  ["Saldo do item da ata não encontrado", ERROR_CODES.ATA_BALANCE_NOT_FOUND],
  ["Inconsistência de saldo detectada para item da ATA", ERROR_CODES.ATA_BALANCE_INCONSISTENT],
  ["Saldo negativo detectado para item da ATA", ERROR_CODES.ATA_BALANCE_INCONSISTENT],
  ["DIEx não encontrado", ERROR_CODES.DIEX_NOT_FOUND],
  ["OS não encontrada", ERROR_CODES.SERVICE_ORDER_NOT_FOUND],
  ["Você não tem acesso a este projeto", ERROR_CODES.PROJECT_ACCESS_DENIED],
  ["Você não tem acesso a esta estimativa", ERROR_CODES.ESTIMATE_ACCESS_DENIED],
  ["Você não tem acesso a este DIEx", ERROR_CODES.DIEX_ACCESS_DENIED],
  ["Você não tem acesso a esta OS", ERROR_CODES.SERVICE_ORDER_ACCESS_DENIED],
  ["Para avançar o fluxo, o projeto precisa ter pelo menos uma estimativa finalizada", ERROR_CODES.WORKFLOW_ESTIMATE_REQUIRED],
  ["Para gerar o DIEx, informe a Nota de Crédito do projeto", ERROR_CODES.WORKFLOW_CREDIT_NOTE_REQUIRED],
  ["Para gerar a OS, o projeto precisa ter Nota de Empenho informada", ERROR_CODES.WORKFLOW_COMMITMENT_NOTE_REQUIRED],
  ["Para colocar o serviço em execução, informe a data de início da execução", ERROR_CODES.WORKFLOW_EXECUTION_START_REQUIRED],
  ["Para entrar na etapa de análise do As-Built, informe a data de recebimento do As-Built", ERROR_CODES.WORKFLOW_AS_BUILT_REQUIRED],
  ["Para avançar para o ateste da NF, o As-Built precisa estar aprovado", ERROR_CODES.WORKFLOW_AS_BUILT_APPROVAL_REQUIRED],
  ["Para concluir o serviço, informe a data de atesto da NF", ERROR_CODES.WORKFLOW_INVOICE_ATTEST_REQUIRED],
  ["Para concluir o serviço, informe a data de conclusão do serviço", ERROR_CODES.WORKFLOW_SERVICE_COMPLETION_REQUIRED],
]);

export function domainCodeForMessage(message: string): DomainErrorCode | undefined {
  const exactCode = exactMessageCodes.get(message);
  if (exactCode) return exactCode;

  const normalizedMessage = message.toLocaleLowerCase("pt-BR");

  if (message.startsWith("Transição inválida:")) return ERROR_CODES.WORKFLOW_INVALID_TRANSITION;
  if (normalizedMessage.includes("saldo") && normalizedMessage.includes("insuficiente")) {
    return ERROR_CODES.ATA_BALANCE_INSUFFICIENT;
  }
  if (message.startsWith("Para avançar até DIEx Requisitório")) return ERROR_CODES.WORKFLOW_CREDIT_NOTE_REQUIRED;
  if (message.startsWith("Para avançar após o DIEx Requisitório")) return ERROR_CODES.WORKFLOW_DIEX_REQUIRED;
  if (message.startsWith("Para liberar a OS")) return ERROR_CODES.WORKFLOW_COMMITMENT_NOTE_REQUIRED;
  if (message.startsWith("Para iniciar a execução")) return ERROR_CODES.WORKFLOW_SERVICE_ORDER_REQUIRED;

  return undefined;
}
