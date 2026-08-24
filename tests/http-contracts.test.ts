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
  it("restringe auditoria tecnica a ADMIN e GESTOR por permissao dedicada", () => {
    expect(rolePermissions.ADMIN).toContain("audit.view");
    expect(rolePermissions.GESTOR).toContain("audit.view");
    expect(rolePermissions.PROJETISTA).not.toContain("audit.view");
    expect(rolePermissions.CONSULTA).not.toContain("audit.view");

    const auditOperation = (openApiDocument.paths as Record<string, any>)["/audits"].get;
    expect(auditOperation["x-permissions"]).toEqual(["audit.view"]);
  });

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

    expect(operationIds).toHaveLength(177);
    expect(operationIds.every(Boolean)).toBe(true);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it("documenta reautenticacao e a barreira das operacoes criticas", () => {
    const paths = openApiDocument.paths as Record<string, any>;
    const components = openApiDocument.components as Record<string, any>;

    expect(paths["/auth/reauthenticate"].post.requestBody.content["application/json"])
      .toEqual(expect.objectContaining({
        schema: { $ref: "#/components/schemas/ReauthenticateRequest" },
      }));
    expect(paths["/auth/sessions/revoke-all"].post.parameters).toContainEqual({
      $ref: "#/components/parameters/StepUpToken",
    });
    expect(paths["/auth/sessions/revoke-all"].post.responses["428"]).toEqual({
      $ref: "#/components/responses/StepUpRequired",
    });
    expect(components.schemas.StepUpResponse.required).toEqual([
      "stepUpToken",
      "expiresInSeconds",
    ]);
  });

  it("separa a saude publica sanitizada do diagnostico tecnico administrativo", () => {
    expect(rolePermissions.ADMIN).toEqual(expect.arrayContaining([
      "system_health.view",
      "system_health.view_details",
    ]));
    expect(rolePermissions.CONSULTA).toContain("system_health.view");
    expect(rolePermissions.CONSULTA).not.toContain("system_health.view_details");

    const paths = openApiDocument.paths as Record<string, any>;
    expect(paths["/health/status"].get.security).toBeUndefined();
    expect(paths["/health/details"].get["x-permissions"]).toEqual([
      "system_health.view_details",
    ]);
  });

  it("protege a pré-validação detalhada da implantação", () => {
    const paths = openApiDocument.paths as Record<string, any>;
    expect(paths["/deployment/preflight"].get["x-permissions"]).toEqual([
      "system_health.view_details",
    ]);
    expect(paths["/deployment/preflight"].get.responses["200"].content["application/json"].schema)
      .toEqual({ $ref: "#/components/schemas/DeploymentPreflight" });
  });

  it("protege a renovação do certificado com reautenticação administrativa", () => {
    const operation = (openApiDocument.paths as Record<string, any>)["/deployment/certificate/renew"].post;
    expect(operation["x-permissions"]).toEqual(["settings.manage"]);
    expect(operation["x-roles"]).toEqual(["ADMIN"]);
    expect(operation.parameters).toContainEqual({ $ref: "#/components/parameters/StepUpToken" });
    expect(operation.responses["201"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/CertificateStatus" });
    const certificateSchema = (openApiDocument.components.schemas as Record<string, any>).CertificateStatus;
    expect(certificateSchema.required).toContain("renewalAutomation");
    expect(certificateSchema.properties.renewalAutomation.properties.proxyReloadMode.enum).toEqual(["AUTOMATIC", "MANUAL"]);
  });

  it("protege exportação e restauração da autoridade com reautenticação administrativa", () => {
    const paths = openApiDocument.paths as Record<string, any>;
    for (const route of ["/deployment/certificate/authority/export", "/deployment/certificate/authority/restore"]) {
      const operation = paths[route].post;
      expect(operation["x-permissions"]).toEqual(["settings.manage"]);
      expect(operation["x-roles"]).toEqual(["ADMIN"]);
      expect(operation.parameters).toContainEqual({ $ref: "#/components/parameters/StepUpToken" });
    }
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

  it("separa timeline publica da trilha tecnica de auditoria", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    const detailsSchema = schemas.ProjectDetailsResponse;

    expect(detailsSchema.properties.timeline.items.$ref).toBe(
      "#/components/schemas/ProjectTimelineItem",
    );
    expect(detailsSchema.properties.auditTrail).toEqual(
      expect.objectContaining({
        nullable: true,
        type: "array",
        items: { $ref: "#/components/schemas/ProjectAuditItem" },
      }),
    );
    expect(schemas.ProjectTimelineItem.properties).not.toHaveProperty("before");
    expect(schemas.ProjectAuditItem.allOf[1].properties).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ nullable: true }),
        after: expect.objectContaining({ nullable: true }),
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

  it("não expõe mensagem nem detalhes internos de AppError 5xx", () => {
    const requestId = "2c4a3610-9e9f-40d7-97d0-886bf983302e";
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = { locals: { requestId }, status } as unknown as Response;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new AppError(
      "Falha interna em postgresql://usuario:senha@database/sagep",
      502,
      "PORTAL_TRANSPARENCIA_UNAVAILABLE",
      { cause: "ECONNREFUSED 10.0.0.5:5432" },
    );

    errorMiddleware(error, {} as Request, response, vi.fn() as NextFunction);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      code: "PORTAL_TRANSPARENCIA_UNAVAILABLE",
      message: "Portal da Transparência indisponível",
      requestId,
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain("postgresql://");
    expect(JSON.stringify(json.mock.calls)).not.toContain("ECONNREFUSED");
    expect(consoleError).toHaveBeenCalledOnce();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("usuario:senha");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("ECONNREFUSED");
    consoleError.mockRestore();
  });

  it("não grava o conteúdo bruto de erro inesperado no log HTTP", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = {
      locals: { requestId: "request-secret-test" },
      status,
    } as unknown as Response;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    errorMiddleware(
      new Error("Bearer token-super-secreto"),
      {} as Request,
      response,
      vi.fn() as NextFunction,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("token-super-secreto");
    expect(json).toHaveBeenCalledWith({
      code: "INTERNAL_ERROR",
      message: "Erro interno do servidor",
      requestId: "request-secret-test",
    });
    consoleError.mockRestore();
  });

  it("exige reautenticação também para baixar o backup completo", () => {
    const operation = (openApiDocument.paths as Record<string, any>)[
      "/backups/{id}/download"
    ].get;

    expect(operation.parameters).toContainEqual({
      $ref: "#/components/parameters/StepUpToken",
    });
    expect(operation.responses["428"]).toEqual({
      $ref: "#/components/responses/StepUpRequired",
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
