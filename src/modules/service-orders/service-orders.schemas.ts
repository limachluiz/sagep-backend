import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import {
  optionalBoolean,
  optionalDate,
  optionalString,
} from "../../shared/zod-helpers.js";

const scheduleItemSchema = z.object({
  orderIndex: z.coerce.number().int().positive("Ordem inválida"),
  taskStep: z.string().trim().min(2, "Tarefa/etapa inválida"),
  scheduleText: z.string().trim().min(2, "Texto de cronograma inválido"),
});

const deliveredDocumentSchema = z.object({
  description: z.string().trim().min(2, "Descrição do documento inválida"),
  isChecked: optionalBoolean,
});

export const createServiceOrderSchema = z.object({
  projectId: z.string().min(1).optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  estimateId: z.string().min(1).optional(),
  estimateCode: z.coerce.number().int().positive().optional(),
  diexId: z.string().min(1).optional(),
  diexCode: z.coerce.number().int().positive().optional(),
  serviceOrderNumber: z.string().trim().optional(),
  issuedAt: z.coerce.date(),
  contractorName: optionalString,
  contractorCnpj: z.string().trim().min(14, "CNPJ da empresa inválido").optional(),
  requesterName: optionalString,
  requesterRank: optionalString,
  requesterRole: optionalString,
  issuingOrganization: optionalString,
  isEmergency: optionalBoolean,
  plannedStartDate: optionalDate,
  plannedEndDate: optionalDate,
  requestingArea: optionalString,
  projectDisplayName: optionalString,
  projectAcronym: optionalString,
  contractNumber: optionalString,
  executionLocation: optionalString,
  executionHours: optionalString,
  contactName: optionalString,
  contactPhone: optionalString,
  contactExtension: optionalString,
  contractTotalTerm: optionalString,
  originProcess: optionalString,
  requesterCpf: optionalString,
  hasProjectInspector: optionalBoolean,
  projectInspectorName: optionalString,
  projectInspectorRank: optionalString,
  projectInspectorCpf: optionalString,
  projectInspectorRole: optionalString,
  contractorRepresentativeName: optionalString,
  contractorRepresentativeRole: optionalString,
  scheduleItems: z.array(scheduleItemSchema).optional(),
  deliveredDocuments: z.array(deliveredDocumentSchema).optional(),
  notes: optionalString,
})
  .superRefine((data, ctx) => {
    if (!data.hasProjectInspector) return;
    const required = [
      ["projectInspectorName", data.projectInspectorName, "Informe o nome do fiscal do projeto"],
      ["projectInspectorRank", data.projectInspectorRank, "Informe o posto ou graduação do fiscal"],
      ["projectInspectorCpf", data.projectInspectorCpf, "Informe o CPF do fiscal"],
      ["projectInspectorRole", data.projectInspectorRole, "Informe a função do fiscal"],
    ] as const;
    for (const [path, value, message] of required) {
      if (!value?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    }
    if (data.projectInspectorCpf && data.projectInspectorCpf.replace(/\D/g, "").length !== 11) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["projectInspectorCpf"], message: "CPF do fiscal deve conter 11 dígitos" });
    }
  })
  .refine((data) => data.projectId || data.projectCode, {
    message: "Informe projectId ou projectCode",
    path: ["projectId"],
  })
  .refine((data) => !(data.projectId && data.projectCode), {
    message: "Informe projectId ou projectCode, não ambos",
    path: ["projectId"],
  })
  .refine((data) => data.estimateId || data.estimateCode, {
    message: "Informe estimateId ou estimateCode",
    path: ["estimateId"],
  })
  .refine((data) => !(data.estimateId && data.estimateCode), {
    message: "Informe estimateId ou estimateCode, não ambos",
    path: ["estimateId"],
  })
  .refine((data) => !(data.diexId && data.diexCode), {
    message: "Informe diexId ou diexCode, não ambos",
    path: ["diexId"],
  })
  .refine((data) => {
    if (data.plannedStartDate && data.plannedEndDate) {
      return data.plannedEndDate >= data.plannedStartDate;
    }
    return true;
  }, {
    message: "A data prevista de entrega não pode ser menor que a data prevista de início",
    path: ["plannedEndDate"],
  });

export const updateServiceOrderSchema = z.object({
  serviceOrderNumber: z.string().trim().min(3).optional(),
  issuedAt: optionalDate,
  contractorName: z.string().trim().min(2).optional(),
  contractorCnpj: z.string().trim().min(14).optional(),
  requesterName: z.string().trim().min(3).optional(),
  requesterRank: z.string().trim().min(2).optional(),
  requesterCpf: optionalString,
  hasProjectInspector: optionalBoolean,
  projectInspectorName: optionalString,
  projectInspectorRank: optionalString,
  projectInspectorCpf: optionalString,
  projectInspectorRole: optionalString,
  requesterRole: optionalString,
  issuingOrganization: optionalString,
  isEmergency: optionalBoolean,
  plannedStartDate: optionalDate,
  plannedEndDate: optionalDate,
  requestingArea: optionalString,
  projectDisplayName: optionalString,
  projectAcronym: optionalString,
  contractNumber: optionalString,
  executionLocation: optionalString,
  executionHours: optionalString,
  contactName: optionalString,
  contactPhone: optionalString,
  contactExtension: optionalString,
  contractTotalTerm: optionalString,
  originProcess: optionalString,
  contractorRepresentativeName: optionalString,
  contractorRepresentativeRole: optionalString,
  scheduleItems: z.array(scheduleItemSchema).optional(),
  deliveredDocuments: z.array(deliveredDocumentSchema).optional(),
  notes: optionalString,
}).superRefine((data, ctx) => {
  if (data.hasProjectInspector !== true) return;
  const required = [
    ["projectInspectorName", data.projectInspectorName, "Informe o nome do fiscal do projeto"],
    ["projectInspectorRank", data.projectInspectorRank, "Informe o posto ou graduação do fiscal"],
    ["projectInspectorCpf", data.projectInspectorCpf, "Informe o CPF do fiscal"],
    ["projectInspectorRole", data.projectInspectorRole, "Informe a função do fiscal"],
  ] as const;
  for (const [path, value, message] of required) {
    if (!value?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  }
  if (data.projectInspectorCpf && data.projectInspectorCpf.replace(/\D/g, "").length !== 11) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["projectInspectorCpf"], message: "CPF do fiscal deve conter 11 dígitos" });
  }
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe pelo menos um campo para atualizar",
}).refine((data) => {
  if (data.plannedStartDate && data.plannedEndDate) {
    return data.plannedEndDate >= data.plannedStartDate;
  }
  return true;
}, {
  message: "A data prevista de entrega não pode ser menor que a data prevista de início",
  path: ["plannedEndDate"],
});

export const listServiceOrdersQuerySchema = paginationQuerySchema.extend({
  code: z.coerce.number().int().positive().optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  estimateCode: z.coerce.number().int().positive().optional(),
  diexCode: z.coerce.number().int().positive().optional(),
  emergency: optionalBoolean,
  search: z.string().trim().optional(),
  includeArchived: z.coerce.boolean().optional(),
  onlyArchived: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().optional(),
  onlyDeleted: z.coerce.boolean().optional(),
  archivedFrom: optionalDate,
  archivedUntil: optionalDate,
});

export const ganttServiceOrdersQuerySchema = z.object({
  projectCode: z.coerce.number().int().positive().optional(),
  from: optionalDate,
  until: optionalDate,
  stateUf: z.enum(["AM", "RO", "RR", "AC"]).optional(),
  projectType: z.enum(["CFTV", "FIBRA_OPTICA_PONTO_LOGICO"]).optional(),
  ownerId: z.string().trim().min(1).optional(),
});

export const archivedServiceOrdersQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
});

export const serviceOrderIdParamSchema = z.object({
  id: z.string().min(1, "Id da OS é obrigatório"),
});

export const serviceOrderCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código da OS inválido"),
});

export const serviceOrderNumberParamSchema = z.object({
  serviceOrderNumber: z.string().trim().min(1, "Número documental da OS é obrigatório"),
});
