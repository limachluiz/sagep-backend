import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/app-error.js";

type PrismaRequestError = Error & { code: string; meta?: unknown };

function isPrismaRequestError(error: unknown): error is PrismaRequestError {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^P\d{4}$/.test(error.code)
  );
}

const prismaHttpErrors: Record<string, { status: number; code: string; message: string }> = {
  P2002: {
    status: 409,
    code: "DATABASE_UNIQUE_CONSTRAINT",
    message: "Já existe um registro com estes dados",
  },
  P2003: {
    status: 409,
    code: "DATABASE_RELATION_CONSTRAINT",
    message: "A operação viola um vínculo entre registros",
  },
  P2025: {
    status: 404,
    code: "RESOURCE_NOT_FOUND",
    message: "Registro não encontrado",
  },
  P2034: {
    status: 409,
    code: "DATABASE_TRANSACTION_CONFLICT",
    message: "A operação entrou em conflito com outra alteração; tente novamente",
  },
};

const safeServerErrorMessages: Record<string, string> = {
  BACKUP_COMMAND_FAILED: "Falha ao processar a operação de backup",
  BACKUP_RESTORE_FAILED:
    "A restauração falhou. O backup de segurança foi preservado",
  BACKUP_TOOL_UNAVAILABLE: "Ferramenta de backup indisponível no servidor",
  CERTIFICATE_TOOL_UNAVAILABLE: "Ferramenta de certificados indisponível no servidor",
  PORTAL_TRANSPARENCIA_ERROR: "Falha ao consultar o Portal da Transparência",
  PORTAL_TRANSPARENCIA_UNAVAILABLE: "Portal da Transparência indisponível",
};

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = String(res.locals.requestId ?? "unavailable");

  if (error instanceof AppError) {
    const isServerError = error.statusCode >= 500;
    const structuredDetails =
      !isServerError && error.details && typeof error.details === "object"
        ? (error.details as Record<string, unknown>)
        : null;
    const requiredPermissions = Array.isArray(structuredDetails?.requiredPermissions)
      ? structuredDetails.requiredPermissions
      : undefined;

    if (isServerError) {
      console.error("Falha HTTP controlada", {
        requestId,
        statusCode: error.statusCode,
        code: error.code,
        errorName: error.name,
      });
    }

    return res.status(error.statusCode).json({
      code: error.code,
      message: isServerError
        ? (safeServerErrorMessages[error.code] ?? "Erro interno do servidor")
        : error.message,
      ...(!isServerError && error.details !== undefined ? { details: error.details } : {}),
      // Compatibilidade temporaria com consumidores anteriores ao contrato estruturado.
      ...(requiredPermissions ? { requiredPermissions } : {}),
      requestId,
    });
  }

  if (error instanceof ZodError) {
    const flattened = error.flatten();

    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Dados inválidos",
      details: {
        fieldErrors: flattened.fieldErrors,
        formErrors: flattened.formErrors,
      },
      // Compatibilidade com consumidores que ja leem `errors`.
      errors: flattened.fieldErrors,
      requestId,
    });
  }

  if (isPrismaRequestError(error)) {
    const mappedError = prismaHttpErrors[error.code];

    if (mappedError) {
      return res.status(mappedError.status).json({
        code: mappedError.code,
        message: mappedError.message,
        ...(error.code === "P2034" ? { details: { retryable: true } } : {}),
        requestId,
      });
    }
  }

  console.error("Erro HTTP não tratado", {
    requestId,
    errorName: error instanceof Error ? error.name : typeof error,
  });

  return res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Erro interno do servidor",
    requestId,
  });
}
