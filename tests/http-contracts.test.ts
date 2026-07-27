import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { openApiDocument } from "../src/docs/openapi.js";
import { errorMiddleware } from "../src/middlewares/error.middleware.js";
import {
  REQUEST_ID_HEADER,
  requestContextMiddleware,
} from "../src/middlewares/request-context.middleware.js";
import { AppError } from "../src/shared/app-error.js";
import { ERROR_CODES } from "../src/shared/error-codes.js";
import { rolePermissions } from "../src/modules/permissions/permissions.catalog.js";

describe("contratos HTTP transversais", () => {
  it("concede exclusao logica aos perfis operacionais e bloqueia consulta", () => {
    const deletionPermissions = [
      "projects.delete",
      "tasks.delete",
      "estimates.delete",
      "diex.delete",
      "service_orders.delete",
    ] as const;

    for (const role of ["ADMIN", "GESTOR", "PROJETISTA"] as const) {
      expect(rolePermissions[role]).toEqual(expect.arrayContaining(deletionPermissions));
    }

    expect(rolePermissions.CONSULTA).not.toEqual(expect.arrayContaining(deletionPermissions));
  });

  it("atribui operationId unico a todas as operacoes OpenAPI", () => {
    const paths = openApiDocument.paths as Record<string, Record<string, unknown>>;
    const operationIds: string[] = [];

    for (const pathItem of Object.values(paths)) {
      for (const method of ["get", "post", "put", "patch", "delete"]) {
        const operation = pathItem[method] as Record<string, unknown> | undefined;
        if (operation) {
          operationIds.push(operation.operationId as string);
        }
      }
    }

    expect(operationIds).toHaveLength(128);
    expect(operationIds.every(Boolean)).toBe(true);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it("documenta tarefas no detalhe contextual do projeto", () => {
    const schema = (openApiDocument.components.schemas as Record<string, any>)
      .ProjectDetailsResponse;

    expect(schema.properties.tasks.type).toBe("array");
    expect(schema.properties.tasks.items.properties).toEqual(
      expect.objectContaining({
        taskCode: expect.objectContaining({ type: "integer" }),
        status: expect.objectContaining({
          enum: expect.arrayContaining(["PENDENTE", "CONCLUIDA"]),
        }),
        assignee: expect.objectContaining({ nullable: true }),
      }),
    );
  });

  it("mantem message e acrescenta code, details e requestId em AppError", () => {
    const requestId = "2c4a3610-9e9f-40d7-97d0-886bf983302e";
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = {
      locals: { requestId },
      status,
    } as unknown as Response;
    const error = new AppError("Sem permissao", 403, "PERMISSION_DENIED", {
      requiredPermissions: ["projects.edit_all"],
    });

    errorMiddleware(
      error,
      {} as Request,
      response,
      vi.fn() as NextFunction,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      code: "PERMISSION_DENIED",
      message: "Sem permissao",
      details: { requiredPermissions: ["projects.edit_all"] },
      requiredPermissions: ["projects.edit_all"],
      requestId,
    });
  });

  it("atribui codigos de dominio estaveis sem alterar mensagens existentes", () => {
    expect(new AppError("Projeto não encontrado", 404).code).toBe(
      ERROR_CODES.PROJECT_NOT_FOUND,
    );
    expect(new AppError("Saldo insuficiente para o item", 409).code).toBe(
      ERROR_CODES.ATA_BALANCE_INSUFFICIENT,
    );
    expect(
      new AppError("Transição inválida: etapa não permitida", 409).code,
    ).toBe(ERROR_CODES.WORKFLOW_INVALID_TRANSITION);
    expect(new AppError("Conflito ainda não catalogado", 409).code).toBe("CONFLICT");
  });

  it("gera requestId e o devolve no header", () => {
    const setHeader = vi.fn();
    const response = { locals: {}, setHeader } as unknown as Response;
    const next = vi.fn();

    requestContextMiddleware({} as Request, response, next);

    expect(response.locals.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, response.locals.requestId);
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([
    ["P2002", 409, "DATABASE_UNIQUE_CONSTRAINT"],
    ["P2003", 409, "DATABASE_RELATION_CONSTRAINT"],
    ["P2025", 404, "RESOURCE_NOT_FOUND"],
    ["P2034", 409, "DATABASE_TRANSACTION_CONFLICT"],
  ])("mapeia erro Prisma %s sem expor metadados internos", (prismaCode, statusCode, code) => {
    const requestId = "2c4a3610-9e9f-40d7-97d0-886bf983302e";
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = { locals: { requestId }, status } as unknown as Response;
    const error = Object.assign(new Error("detalhe interno do banco"), {
      code: prismaCode,
      meta: { target: ["email"] },
    });

    errorMiddleware(error, {} as Request, response, vi.fn() as NextFunction);

    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith({
      code,
      message: expect.any(String),
      ...(prismaCode === "P2034" ? { details: { retryable: true } } : {}),
      requestId,
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain("email");
    expect(JSON.stringify(json.mock.calls)).not.toContain("detalhe interno");
  });
});
