import { z } from "zod";
import { paginationQuerySchema } from "../../shared/pagination.js";
import { optionalBoolean, optionalDate, optionalString } from "../../shared/zod-helpers.js";

const taskStatusEnum = z.enum([
  "PENDENTE",
  "EM_ANDAMENTO",
  "REVISAO",
  "CONCLUIDA",
  "CANCELADA",
]);

const optionalTaskAssigneeId = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.string().min(1).optional());

const optionalTaskAssigneeUserCode = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.coerce.number().int().positive().optional());

export const createTaskSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    projectCode: z.coerce.number().int().positive().optional(),
    title: z.string().trim().min(3, "Título deve ter pelo menos 3 caracteres"),
    description: optionalString,
    status: taskStatusEnum.optional(),
    priority: z.coerce.number().int().min(1).max(5).optional(),
    assigneeId: optionalTaskAssigneeId,
    assigneeUserCode: optionalTaskAssigneeUserCode,
    dueDate: optionalDate,
  })
  .refine((data) => data.projectId || data.projectCode, {
    message: "Informe projectId ou projectCode",
    path: ["projectId"],
  })
  .refine((data) => !(data.assigneeId && data.assigneeUserCode), {
    message: "Informe assigneeId ou assigneeUserCode, não ambos",
    path: ["assigneeId"],
  });

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(3, "Título deve ter pelo menos 3 caracteres").optional(),
    description: optionalString,
    status: taskStatusEnum.optional(),
    priority: z.coerce.number().int().min(1).max(5).optional(),
    assigneeId: optionalTaskAssigneeId,
    assigneeUserCode: optionalTaskAssigneeUserCode,
    clearAssignee: optionalBoolean,
    dueDate: optionalDate,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe pelo menos um campo para atualizar",
  })
  .refine((data) => !(data.assigneeId && data.assigneeUserCode), {
    message: "Informe assigneeId ou assigneeUserCode, não ambos",
    path: ["assigneeId"],
  })
  .refine((data) => !(data.clearAssignee && (data.assigneeId || data.assigneeUserCode)), {
    message: "Use clearAssignee ou informe um responsável, não ambos",
    path: ["clearAssignee"],
  });

export const updateTaskStatusSchema = z.object({
  status: taskStatusEnum,
});

export const listTasksQuerySchema = paginationQuerySchema.extend({
  code: z.coerce.number().int().positive().optional(),
  projectCode: z.coerce.number().int().positive().optional(),
  assigneeCode: z.coerce.number().int().positive().optional(),
  status: taskStatusEnum.optional(),
  search: z.string().trim().optional(),
  includeArchived: z.coerce.boolean().optional(),
  onlyArchived: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().optional(),
  onlyDeleted: z.coerce.boolean().optional(),
  archivedFrom: optionalDate,
  archivedUntil: optionalDate,
});

export const archivedTaskQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
});

export const taskIdParamSchema = z.object({
  id: z.string().min(1, "Id da tarefa é obrigatório"),
});

export const taskCodeParamSchema = z.object({
  code: z.coerce.number().int().positive("Código da tarefa inválido"),
});
