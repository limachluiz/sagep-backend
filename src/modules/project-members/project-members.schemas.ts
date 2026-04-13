import { z } from "zod";

const optionalUserId = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.string().min(1).optional());

const optionalUserCode = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.coerce.number().int().positive().optional());

const optionalRole = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.string().trim().optional());

export const addProjectMemberSchema = z
  .object({
    userId: optionalUserId,
    userCode: optionalUserCode,
    role: optionalRole,
  })
  .refine((data) => data.userId || data.userCode, {
    message: "Informe userId ou userCode",
    path: ["userId"],
  })
  .refine((data) => !(data.userId && data.userCode), {
    message: "Informe userId ou userCode, não ambos",
    path: ["userId"],
  });

export const projectIdParamSchema = z.object({
  id: z.string().min(1, "Id do projeto é obrigatório"),
});

export const projectMemberIdParamSchema = z.object({
  id: z.string().min(1, "Id do projeto é obrigatório"),
  memberId: z.string().min(1, "Id do vínculo do membro é obrigatório"),
});