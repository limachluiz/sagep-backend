import { z } from "zod";
import { optionalDate, optionalString } from "../../shared/zod-helpers.js";
import { paginationQuerySchema } from "../../shared/pagination.js";

const projectStatusEnum = z.enum([
  "PLANEJAMENTO",
  "EM_ANDAMENTO",
  "PAUSADO",
  "CONCLUIDO",
  "CANCELADO",
]);

const projectTypeEnum = z.enum(["CFTV", "FIBRA_OPTICA_PONTO_LOGICO"]);
const federativeUnitEnum = z.enum(["AM", "RO", "RR", "AC"]);

function hasCompleteClassification(data: { projectType?: string; omId?: string }) {
  return Boolean(data.projectType) === Boolean(data.omId);
}

const projectStageEnum = z.enum([
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
]);

export const createProjectSchema = z
  .object({
    title: z.string().trim().min(3, "Título deve ter pelo menos 3 caracteres"),
    description: optionalString,
    projectType: projectTypeEnum.optional(),
    omId: optionalString,
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine(hasCompleteClassification, {
    message: "Informe o tipo do projeto e a OM de destino",
    path: ["omId"],
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }

      return true;
    },
    {
      message: "A data de término não pode ser menor que a data de início",
      path: ["endDate"],
    }
  );

export const updateProjectSchema = z
  .object({
    title: z.string().trim().min(3, "Título deve ter pelo menos 3 caracteres").optional(),
    description: optionalString,
    projectType: projectTypeEnum.optional(),
    omId: optionalString,
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe pelo menos um campo para atualizar",
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }

      return true;
    },
    {
      message: "A data de término não pode ser menor que a data de início",
      path: ["endDate"],
    }
  );

export const updateProjectFlowSchema = z.object({
  stage: projectStageEnum,
  creditNoteNumber: optionalString,
  creditNoteReceivedAt: optionalDate,
  diexNumber: optionalString,
  diexIssuedAt: optionalDate,
  commitmentNoteNumber: optionalString,
  commitmentNoteReceivedAt: optionalDate,
  serviceOrderNumber: optionalString,
  serviceOrderIssuedAt: optionalDate,
  executionStartedAt: optionalDate,
  asBuiltReceivedAt: optionalDate,
  invoiceAttestedAt: optionalDate,
  serviceCompletedAt: optionalDate,
});

export const listProjectsQuerySchema = paginationQuerySchema.extend({
  code: z.coerce.number().int().positive().optional(),
  status: projectStatusEnum.optional(),
  stage: projectStageEnum.optional(),
  search: z.string().trim().optional(),
  includeArchived: z.coerce.boolean().optional(),
  onlyArchived: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().optional(),
  onlyDeleted: z.coerce.boolean().optional(),
  archivedFrom: optionalDate,
  archivedUntil: optionalDate,
});

export const kanbanProjectsQuerySchema = z.object({
  ownerId: z.string().trim().optional(),
  stage: projectStageEnum.optional(),
  projectType: projectTypeEnum.optional(),
  omId: z.string().trim().optional(),
  stateUf: federativeUnitEnum.optional(),
  search: z.string().trim().optional(),
  onlyMine: z.coerce.boolean().optional(),
});

export const archivedQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
});

export const projectIdParamSchema = z.object({
  id: z.string().min(1, "Id do projeto é obrigatório"),
});

export const projectCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código do projeto inválido"),
});

export const issueServiceOrderSchema = z.object({
  serviceOrderNumber: optionalString,
  serviceOrderIssuedAt: optionalDate,
});

export const cancelCommitmentNoteSchema = z.object({
  reason: z.string().trim().min(3, "Motivo do cancelamento da NE é obrigatório"),
});

export const reviewAsBuiltSchema = z.discriminatedUnion("approved", [
  z.object({
    approved: z.literal(true),
    reviewedAt: z.coerce.date(),
    asBuiltLink: z
      .string()
      .trim()
      .url("Informe um link válido para o arquivo ou pasta do As-Built")
      .max(2048, "Link do As-Built muito longo"),
  }),
  z.object({
    approved: z.literal(false),
    reviewedAt: z.coerce.date(),
    rejectionReason: z
      .string()
      .trim()
      .min(3, "Motivo da reprovação do As-Built é obrigatório"),
  }),
]);

export const registerSignedServiceOrderSchema = z.object({
  signedServiceOrderLink: z
    .string()
    .trim()
    .url("Informe um link válido para o arquivo ou pasta da OS assinada")
    .max(2048, "Link da OS assinada muito longo"),
  signedServiceOrderReceivedAt: z.coerce.date(),
  signedServiceOrderNotes: z
    .string()
    .trim()
    .max(2000, "Observação da OS assinada muito longa")
    .optional(),
});

export const registerDeliveryReportSignatureSchema = z.object({
  signedAt: z.coerce.date(),
  signedLink: z.string().trim().url().max(2048).optional(),
});

export const deliveryReportDraftSchema = z.object({
  version: z.literal(2),
  sections: z.array(z.object({
    key: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
    title: z.string().trim().min(3).max(160),
    content: z.string().trim().max(20_000),
    included: z.boolean(),
    reviewed: z.boolean(),
  })).min(1).max(20),
  itemDetails: z.array(z.object({
    itemId: z.string().trim().min(1).max(128),
    unit: z.string().trim().min(1).max(20),
    quantity: z.string().trim().min(1).max(40),
    technicalDescription: z.string().trim().max(12_000),
  })).max(250),
  formalization: z.object({
    requiresOmAcknowledgement: z.boolean(),
    recipientName: z.string().trim().max(160),
    recipientRank: z.string().trim().max(80),
    recipientRole: z.string().trim().max(160),
    recipientOrganization: z.string().trim().max(200),
    acknowledgementNotes: z.string().trim().max(4_000),
  }),
});
