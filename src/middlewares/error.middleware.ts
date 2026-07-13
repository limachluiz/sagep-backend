import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/app-error.js";

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = String(res.locals.requestId ?? "unavailable");

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
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

  console.error("Erro HTTP não tratado", { requestId, error });

  return res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Erro interno do servidor",
    requestId,
  });
}
