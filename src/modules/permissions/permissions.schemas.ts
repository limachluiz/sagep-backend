import { z } from "zod";
import { allPermissions, allRoles, type Permission, type UserRole } from "./permissions.catalog.js";

const permissionValues = new Set(allPermissions);
const roleValues = new Set(allRoles);

const permissionCodeSchema = z
  .string()
  .trim()
  .refine((value): value is Permission => permissionValues.has(value as Permission), {
    message: "Permissão inválida",
  });

const roleSchema = z
  .string()
  .trim()
  .refine((value): value is UserRole => roleValues.has(value as UserRole), {
    message: "Role inválida",
  });

export const permissionRoleParamSchema = z.object({
  role: roleSchema,
});

export const permissionUserIdParamSchema = z.object({
  id: z.string().min(1, "Id do usuário é obrigatório"),
});

export const permissionCodeParamSchema = z.object({
  permissionCode: permissionCodeSchema,
});

export const updateRolePermissionsSchema = z.object({
  permissions: z
    .array(permissionCodeSchema)
    .max(200, "Lista de permissões excede o limite suportado")
    .transform((values) => Array.from(new Set(values)) as Permission[]),
});

export const createUserPermissionOverrideSchema = z.object({
  permissionCode: permissionCodeSchema,
});
