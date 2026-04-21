import { z } from "zod";

const projectStatusEnum = z.enum([
  "PLANEJAMENTO",
  "EM_ANDAMENTO",
  "PAUSADO",
  "CONCLUIDO",
  "CANCELADO",
]);

const projectStageEnum = z.enum([
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
]);

const optionalDate = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.coerce.date().optional());

const optionalString = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}, z.string().trim().optional());

export const createProjectSchema = z
  .object({
    title: z.string().trim().min(3, "Título deve ter pelo menos 3 caracteres"),
    description: optionalString,
    status: projectStatusEnum.optional(),
    startDate: optionalDate,
    endDate: optionalDate,
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
    status: projectStatusEnum.optional(),
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

export const listProjectsQuerySchema = z.object({
  code: z.coerce.number().int().positive().optional(),
  status: projectStatusEnum.optional(),
  stage: projectStageEnum.optional(),
  search: z.string().trim().optional(),
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