type OpenApiDocument = Record<string, unknown>;

const bearerSecurity = [{ bearerAuth: [] }];

const tagExternalDocs = {
  auth: "./auth-and-permissions.md",
  audits: "./insights-and-admin.md",
  projects: "./projects-and-operations.md",
  tasks: "./projects-and-operations.md",
  estimates: "./projects-and-operations.md",
  diex: "./documents.md",
  "service-orders": "./documents.md",
  dashboard: "./insights-and-admin.md",
  search: "./insights-and-admin.md",
  "operational-alerts": "./insights-and-admin.md",
  exports: "./insights-and-admin.md",
  reports: "./insights-and-admin.md",
  users: "./insights-and-admin.md",
  permissions: "./insights-and-admin.md",
  atas: "./insights-and-admin.md",
  "ata-items": "./insights-and-admin.md",
  integrations: "./insights-and-admin.md",
  "military-organizations": "./insights-and-admin.md",
  health: "./README.md",
};

function jsonContent(schemaRef: string, example?: unknown) {
  return {
    "application/json": {
      schema: { $ref: schemaRef },
      ...(example ? { example } : {}),
    },
  };
}

function binaryContent(contentType: string) {
  return {
    [contentType]: {
      schema: {
        type: "string",
        format: "binary",
      },
    },
  };
}

function htmlContent() {
  return {
    "text/html": {
      schema: {
        type: "string",
      },
    },
  };
}

function okJson(schemaRef: string, description = "OK", example?: unknown) {
  return {
    description,
    content: jsonContent(schemaRef, example),
  };
}

function createdJson(schemaRef: string, description = "Criado com sucesso", example?: unknown) {
  return {
    description,
    content: jsonContent(schemaRef, example),
  };
}

function pathIdParameter(name: string, description: string, schema: Record<string, unknown> = { type: "string" }) {
  return {
    name,
    in: "path",
    required: true,
    description,
    schema,
  };
}

function queryParameter(
  name: string,
  description: string,
  schema: Record<string, unknown>,
) {
  return {
    name,
    in: "query",
    required: false,
    description,
    schema,
  };
}

const paginationParameters = [
  { $ref: "#/components/parameters/Page" },
  { $ref: "#/components/parameters/PageSize" },
  { $ref: "#/components/parameters/FormatEnvelopeOrLegacy" },
];

const archiveFilterParameters = [
  { $ref: "#/components/parameters/IncludeArchived" },
  { $ref: "#/components/parameters/OnlyArchived" },
  { $ref: "#/components/parameters/IncludeDeleted" },
  { $ref: "#/components/parameters/OnlyDeleted" },
  { $ref: "#/components/parameters/ArchivedFrom" },
  { $ref: "#/components/parameters/ArchivedUntil" },
];

const defaultErrorResponses = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "404": { $ref: "#/components/responses/NotFound" },
};

const archiveResponseExample = {
  message: "Tarefa arquivada com sucesso",
  permissionUsed: "tasks.archive",
  task: {
    id: "d6ed8efe-15cc-4db8-a283-5415f2747d3b",
    archivedAt: "2026-04-27T00:00:00.000Z",
  },
};

const restoreResponseExample = {
  message: "Projeto restaurado com sucesso",
  permissionUsed: "projects.restore",
  cascadeApplied: true,
  cascade: {
    restored: {
      tasks: 2,
      estimates: 1,
      diexRequests: 1,
      serviceOrders: 1,
    },
    skipped: {
      tasksDeleted: 0,
      estimatesDeleted: 0,
      diexDeleted: 0,
      serviceOrdersDeleted: 0,
    },
  },
  project: {
    id: "f4d9e8f8-4b26-4f9a-b1e2-a9913b77f69f",
    archivedAt: null,
  },
};

const restoreRequestExample = {
  cascade: true,
};

export const openApiDocument: OpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "SAGEP Backend API",
    version: "1.0.0",
    description:
      "Especificacao OpenAPI formal da API do backend do SAGEP. Esta documentacao complementa a base Markdown existente em docs/api e prioriza os modulos operacionais e administrativos em producao.",
  },
  servers: [
    {
      url: "/api",
      description: "Base path da API",
    },
  ],
  tags: [
    "health",
    "auth",
    "audits",
    "projects",
    "tasks",
    "estimates",
    "diex",
    "service-orders",
    "dashboard",
    "search",
    "operational-alerts",
    "exports",
    "reports",
    "users",
    "permissions",
    "atas",
    "ata-items",
    "integrations",
    "military-organizations",
  ].map((name) => ({
    name,
    description: `Modulo ${name} do backend SAGEP`,
    externalDocs: {
      description: "Documentacao Markdown complementar",
      url: tagExternalDocs[name as keyof typeof tagExternalDocs] ?? "./README.md",
    },
  })),
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token JWT emitido pelos endpoints de autenticacao.",
      },
    },
    parameters: {
      Page: queryParameter("page", "Pagina atual.", {
        type: "integer",
        minimum: 1,
        default: 1,
      }),
      PageSize: queryParameter("pageSize", "Quantidade por pagina.", {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 50,
      }),
      FormatEnvelopeOrLegacy: queryParameter(
        "format",
        "Formato de resposta. `legacy` preserva o array antigo onde aplicavel.",
        {
          type: "string",
          enum: ["envelope", "legacy"],
          default: "envelope",
        },
      ),
      IncludeArchived: queryParameter(
        "includeArchived",
        "Inclui ativos e arquivados. Uso administrativo.",
        { type: "boolean" },
      ),
      OnlyArchived: queryParameter(
        "onlyArchived",
        "Retorna apenas arquivados. Uso administrativo.",
        { type: "boolean" },
      ),
      IncludeDeleted: queryParameter(
        "includeDeleted",
        "Inclui ativos e deletados logicamente. Uso administrativo.",
        { type: "boolean" },
      ),
      OnlyDeleted: queryParameter(
        "onlyDeleted",
        "Retorna apenas deletados logicamente. Uso administrativo.",
        { type: "boolean" },
      ),
      ArchivedFrom: queryParameter(
        "archivedFrom",
        "Data inicial ISO para filtro de arquivamento.",
        { type: "string", format: "date-time" },
      ),
      ArchivedUntil: queryParameter(
        "archivedUntil",
        "Data final ISO para filtro de arquivamento.",
        { type: "string", format: "date-time" },
      ),
      ProjectId: pathIdParameter("id", "Identificador UUID do projeto."),
      ProjectCode: pathIdParameter("code", "Codigo sequencial do projeto.", {
        type: "integer",
        minimum: 1,
      }),
      TaskId: pathIdParameter("id", "Identificador UUID da tarefa."),
      TaskCode: pathIdParameter("code", "Codigo sequencial da tarefa.", {
        type: "integer",
        minimum: 1,
      }),
      EstimateId: pathIdParameter("id", "Identificador UUID da estimativa."),
      EstimateCode: pathIdParameter("code", "Codigo sequencial da estimativa.", {
        type: "integer",
        minimum: 1,
      }),
      DiexId: pathIdParameter("id", "Identificador UUID do DIEx."),
      DiexCode: pathIdParameter("code", "Codigo sequencial do DIEx.", {
        type: "integer",
        minimum: 1,
      }),
      ServiceOrderId: pathIdParameter("id", "Identificador UUID da ordem de servico."),
      ServiceOrderCode: pathIdParameter("code", "Codigo sequencial da ordem de servico.", {
        type: "integer",
        minimum: 1,
      }),
      ServiceOrderNumber: pathIdParameter(
        "serviceOrderNumber",
        "Numero documental da ordem de servico.",
        { type: "string" },
      ),
      UserId: pathIdParameter("id", "Identificador UUID do usuario."),
      RoleName: pathIdParameter("role", "Role do RBAC persistido.", {
        type: "string",
        enum: ["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"],
      }),
      PermissionCode: pathIdParameter(
        "permissionCode",
        "Codigo da permissao no catalogo RBAC persistido.",
      ),
      SessionId: pathIdParameter("sessionId", "Identificador da sessao."),
      AtaId: pathIdParameter("id", "Identificador UUID da ata."),
      AtaCoverageGroupId: pathIdParameter(
        "groupId",
        "Identificador UUID do grupo de cobertura da ata.",
      ),
      AtaCode: pathIdParameter("code", "Codigo sequencial da ata.", {
        type: "integer",
        minimum: 1,
      }),
      AtaItemId: pathIdParameter("id", "Identificador UUID do item da ata."),
      AtaItemCode: pathIdParameter("code", "Codigo sequencial do item da ata.", {
        type: "integer",
        minimum: 1,
      }),
      MilitaryOrganizationId: pathIdParameter("id", "Identificador UUID da OM."),
      MilitaryOrganizationCode: pathIdParameter("code", "Codigo sequencial da OM.", {
        type: "integer",
        minimum: 1,
      }),
      MemberId: pathIdParameter("memberId", "Identificador do vinculo de membro."),
    },
    responses: {
      BadRequest: {
        description: "Requisicao invalida.",
        content: jsonContent("#/components/schemas/ErrorResponse", {
          message: "Informe pelo menos um campo para atualizar",
        }),
      },
      Unauthorized: {
        description: "Autenticacao ausente ou invalida.",
        content: jsonContent("#/components/schemas/ErrorResponse", {
          message: "Token não informado",
        }),
      },
      Forbidden: {
        description: "Usuario autenticado sem permissao suficiente.",
        content: jsonContent("#/components/schemas/ErrorResponse", {
          message: "Você não tem permissão para acessar este recurso",
        }),
      },
      NotFound: {
        description: "Recurso nao encontrado.",
        content: jsonContent("#/components/schemas/ErrorResponse", {
          message: "Recurso não encontrado",
        }),
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      PaginationMeta: {
        type: "object",
        required: [
          "page",
          "pageSize",
          "totalItems",
          "totalPages",
          "hasNextPage",
          "hasPreviousPage",
        ],
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          totalItems: { type: "integer" },
          totalPages: { type: "integer" },
          hasNextPage: { type: "boolean" },
          hasPreviousPage: { type: "boolean" },
        },
      },
      ListLinks: {
        type: "object",
        required: ["self"],
        properties: {
          self: { type: "string" },
        },
      },
      ArchiveContext: {
        type: "object",
        properties: {
          archivedAt: { type: "string", format: "date-time" },
          auditLogId: { type: "string" },
          summary: { type: "string" },
          actorUserId: { type: "string" },
          actorName: { type: "string" },
          metadata: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      AuditLog: {
        type: "object",
        properties: {
          id: { type: "string" },
          entityType: { type: "string" },
          entityId: { type: "string" },
          action: { type: "string" },
          actorUserId: { type: "string", nullable: true },
          actorName: { type: "string", nullable: true },
          summary: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          metadata: {
            type: "object",
            nullable: true,
            additionalProperties: true,
          },
        },
        example: {
          id: "cmaudit123",
          entityType: "PROJECT",
          entityId: "cmproject123",
          action: "UPDATE",
          actorUserId: "cmuser123",
          actorName: "Gestor SAGEP",
          summary: "Projeto atualizado",
          createdAt: "2026-05-08T12:00:00.000Z",
          metadata: {
            source: "projects.update",
          },
        },
      },
      AuditLogListEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/AuditLog" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      AccessProfile: {
        type: "object",
        required: ["role", "permissions", "isAdmin"],
        properties: {
          role: {
            type: "string",
            enum: ["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"],
          },
          permissions: {
            type: "array",
            items: { type: "string" },
          },
          isAdmin: { type: "boolean" },
        },
      },
      UserSummary: {
        type: "object",
        required: ["id", "userCode", "name", "email", "role", "active", "createdAt"],
        properties: {
          id: { type: "string" },
          userCode: { type: "integer" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: {
            type: "string",
            enum: ["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"],
          },
          rank: { type: "string", nullable: true },
          cpf: { type: "string", nullable: true },
          active: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          permissions: {
            type: "array",
            items: { type: "string" },
          },
          access: { $ref: "#/components/schemas/AccessProfile" },
        },
      },
      UserUpdateRequest: {
        type: "object",
        description: "Atualiza dados cadastrais do usuario. Somente ADMIN.",
        properties: {
          name: { type: "string", minLength: 3 },
          email: { type: "string", format: "email" },
          rank: { type: "string", nullable: true },
          cpf: { type: "string", nullable: true },
        },
      },
      UserStatusUpdateRequest: {
        type: "object",
        required: ["active"],
        properties: {
          active: { type: "boolean" },
        },
      },
      PermissionCatalogItem: {
        type: "object",
        required: ["code", "module", "group", "action", "description", "defaultRoles", "critical"],
        properties: {
          code: { type: "string" },
          module: { type: "string" },
          group: { type: "string" },
          action: { type: "string" },
          description: { type: "string" },
          critical: { type: "boolean" },
          defaultRoles: {
            type: "array",
            items: {
              type: "string",
              enum: ["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"],
            },
          },
        },
      },
      PermissionCatalogResponse: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/PermissionCatalogItem" },
          },
        },
      },
      RolePermissionItem: {
        allOf: [
          { $ref: "#/components/schemas/PermissionCatalogItem" },
          {
            type: "object",
            required: ["assigned"],
            properties: {
              assigned: { type: "boolean" },
            },
          },
        ],
      },
      RolePermissionsRequest: {
        type: "object",
        required: ["permissions"],
        properties: {
          permissions: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      RolePermissionsResponse: {
        type: "object",
        required: ["role", "source", "basePermissions", "items"],
        properties: {
          message: { type: "string" },
          role: {
            type: "string",
            enum: ["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"],
          },
          source: {
            type: "string",
            enum: ["database", "fallback"],
          },
          basePermissions: {
            type: "array",
            items: { type: "string" },
          },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/RolePermissionItem" },
          },
        },
      },
      UserPermissionOverrideItem: {
        type: "object",
        required: [
          "code",
          "module",
          "group",
          "action",
          "description",
          "effect",
          "effective",
          "grantedByRole",
        ],
        properties: {
          code: { type: "string" },
          module: { type: "string" },
          group: { type: "string" },
          action: { type: "string" },
          description: { type: "string" },
          effect: { type: "string", enum: ["ALLOW", "DENY"] },
          effective: { type: "boolean" },
          grantedByRole: { type: "boolean" },
          createdAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      UserPermissionItem: {
        allOf: [
          { $ref: "#/components/schemas/PermissionCatalogItem" },
          {
            type: "object",
            required: ["grantedByRole", "overrideEffect", "effective"],
            properties: {
              grantedByRole: { type: "boolean" },
              overrideEffect: {
                type: "string",
                enum: ["ALLOW", "DENY"],
                nullable: true,
              },
              effective: { type: "boolean" },
            },
          },
        ],
      },
      UserPermissionsResponse: {
        type: "object",
        required: [
          "user",
          "rolePermissionSource",
          "roleBasePermissions",
          "overrides",
          "effectivePermissions",
          "items",
        ],
        properties: {
          user: { $ref: "#/components/schemas/UserSummary" },
          rolePermissionSource: {
            type: "string",
            enum: ["database", "fallback"],
          },
          roleBasePermissions: {
            type: "array",
            items: { type: "string" },
          },
          overrides: {
            type: "array",
            items: {
              type: "object",
              required: ["permission", "effect"],
              properties: {
                permission: { type: "string" },
                effect: { type: "string", enum: ["ALLOW", "DENY"] },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
          },
          effectivePermissions: {
            type: "array",
            items: { type: "string" },
          },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/UserPermissionItem" },
          },
        },
      },
      UserPermissionOverridesResponse: {
        type: "object",
        required: ["user", "overrides"],
        properties: {
          user: { $ref: "#/components/schemas/UserSummary" },
          overrides: {
            type: "array",
            items: { $ref: "#/components/schemas/UserPermissionOverrideItem" },
          },
        },
      },
      UserPermissionOverrideRequest: {
        type: "object",
        required: ["permissionCode"],
        properties: {
          permissionCode: { type: "string" },
        },
      },
      UserPermissionOverrideMutationResponse: {
        type: "object",
        required: ["message", "user", "summary"],
        properties: {
          message: { type: "string" },
          user: { $ref: "#/components/schemas/UserSummary" },
          override: {
            type: "object",
            properties: {
              code: { type: "string" },
              module: { type: "string" },
              group: { type: "string" },
              action: { type: "string" },
              description: { type: "string" },
              effect: { type: "string", enum: ["ALLOW", "DENY"] },
            },
          },
          removedOverride: {
            type: "object",
            properties: {
              code: { type: "string" },
              effect: { type: "string", enum: ["ALLOW", "DENY"] },
            },
          },
          summary: { $ref: "#/components/schemas/UserPermissionsResponse" },
        },
      },
      AuthTokensResponse: {
        type: "object",
        required: ["accessToken", "refreshToken", "user"],
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          user: { $ref: "#/components/schemas/UserSummary" },
        },
      },
      SessionStatusDetail: {
        type: "object",
        properties: {
          code: { type: "string", enum: ["ACTIVE", "REVOKED", "EXPIRED"] },
          label: { type: "string" },
          reason: { type: "string", nullable: true },
          reasonLabel: { type: "string", nullable: true },
        },
      },
      SessionItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "REVOKED", "EXPIRED"] },
          statusDetail: { $ref: "#/components/schemas/SessionStatusDetail" },
          currentSession: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          revokedAt: { type: "string", format: "date-time", nullable: true },
          lastActivityAt: { type: "string", format: "date-time", nullable: true },
          securityContext: {
            type: "object",
            properties: {
              ipAddress: { type: "string", nullable: true },
              userAgent: { type: "string", nullable: true },
            },
          },
        },
      },
      SessionsEnvelope: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["OWN", "ADMIN"] },
          permissionUsed: { type: "string" },
          summary: {
            type: "object",
            additionalProperties: true,
          },
          governance: {
            type: "object",
            additionalProperties: true,
          },
          sessions: {
            type: "array",
            items: { $ref: "#/components/schemas/SessionItem" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      CleanupSessionsRequest: {
        type: "object",
        properties: {
          refreshTokenRetentionDays: {
            type: "integer",
            minimum: 1,
            maximum: 3650,
            default: 90,
          },
          auditRetentionDays: {
            type: "integer",
            minimum: 1,
            maximum: 3650,
            default: 180,
          },
        },
      },
      CleanupSessionsResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
          permissionUsed: { type: "string" },
          scope: { type: "string", enum: ["ADMIN"] },
          retentionPolicy: {
            type: "object",
            additionalProperties: true,
          },
          deleted: {
            type: "object",
            additionalProperties: { type: "integer" },
          },
          summary: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string" },
          projectCode: { type: "integer" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: ["PLANEJAMENTO", "EM_ANDAMENTO", "PAUSADO", "CONCLUIDO", "CANCELADO"],
          },
          stage: {
            type: "string",
            enum: [
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
            ],
          },
          ownerId: { type: "string", nullable: true },
          ownerName: { type: "string", nullable: true },
          startDate: { type: "string", format: "date-time", nullable: true },
          endDate: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          archivedAt: { type: "string", format: "date-time", nullable: true },
          deletedAt: { type: "string", format: "date-time", nullable: true },
          archiveContext: { $ref: "#/components/schemas/ArchiveContext" },
        },
      },
      ProjectCreateRequest: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", minLength: 3 },
          description: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: ["PLANEJAMENTO", "EM_ANDAMENTO", "PAUSADO", "CONCLUIDO", "CANCELADO"],
          },
          startDate: { type: "string", format: "date-time", nullable: true },
          endDate: { type: "string", format: "date-time", nullable: true },
        },
      },
      ProjectUpdateRequest: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 3 },
          description: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: ["PLANEJAMENTO", "EM_ANDAMENTO", "PAUSADO", "CONCLUIDO", "CANCELADO"],
          },
          startDate: { type: "string", format: "date-time", nullable: true },
          endDate: { type: "string", format: "date-time", nullable: true },
        },
      },
      ProjectFlowUpdateRequest: {
        type: "object",
        required: ["stage"],
        properties: {
          stage: {
            type: "string",
            enum: [
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
            ],
          },
          creditNoteNumber: { type: "string", nullable: true },
          creditNoteReceivedAt: { type: "string", format: "date-time", nullable: true },
          diexNumber: { type: "string", nullable: true },
          diexIssuedAt: { type: "string", format: "date-time", nullable: true },
          commitmentNoteNumber: { type: "string", nullable: true },
          commitmentNoteReceivedAt: { type: "string", format: "date-time", nullable: true },
          serviceOrderNumber: { type: "string", nullable: true },
          serviceOrderIssuedAt: { type: "string", format: "date-time", nullable: true },
          executionStartedAt: { type: "string", format: "date-time", nullable: true },
          asBuiltReceivedAt: { type: "string", format: "date-time", nullable: true },
          asBuiltReviewedAt: { type: "string", format: "date-time", nullable: true },
          asBuiltApprovedAt: { type: "string", format: "date-time", nullable: true },
          asBuiltRejectedAt: { type: "string", format: "date-time", nullable: true },
          asBuiltRejectionReason: { type: "string", nullable: true },
          invoiceAttestedAt: { type: "string", format: "date-time", nullable: true },
          serviceCompletedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      ProjectAsBuiltReviewRequest: {
        oneOf: [
          {
            type: "object",
            required: ["approved", "reviewedAt"],
            properties: {
              approved: { type: "boolean", const: true },
              reviewedAt: { type: "string", format: "date-time" },
            },
          },
          {
            type: "object",
            required: ["approved", "reviewedAt", "rejectionReason"],
            properties: {
              approved: { type: "boolean", const: false },
              reviewedAt: { type: "string", format: "date-time" },
              rejectionReason: { type: "string", minLength: 3 },
            },
          },
        ],
      },
      ProjectCommitmentNoteCancelRequest: {
        type: "object",
        required: ["reason"],
        properties: {
          reason: { type: "string", minLength: 3 },
        },
        example: {
          reason: "Empenho cancelado pelo setor financeiro",
        },
      },
      ProjectCommitmentNoteCancelResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
          project: { $ref: "#/components/schemas/Project" },
          rollback: {
            type: "object",
            properties: {
              estimateId: { type: "string" },
              diexRequestId: { type: "string" },
              serviceOrderId: { type: "string", nullable: true },
              reason: { type: "string" },
            },
          },
        },
      },
      ProjectTimelineItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          at: { type: "string", format: "date-time" },
          action: { type: "string" },
          label: { type: "string" },
          summary: { type: "string", nullable: true },
          actorName: { type: "string", nullable: true },
          entityType: { type: "string" },
          entityId: { type: "string" },
          source: { type: "string", nullable: true },
          context: {
            type: "object",
            additionalProperties: true,
          },
          before: {
            type: "object",
            additionalProperties: true,
          },
          after: {
            type: "object",
            additionalProperties: true,
          },
          metadata: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      ProjectDetailsResponse: {
        type: "object",
        properties: {
          project: { $ref: "#/components/schemas/Project" },
          workflow: {
            type: "object",
            additionalProperties: true,
          },
          pendingActions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
          timeline: {
            type: "array",
            items: { $ref: "#/components/schemas/ProjectTimelineItem" },
          },
          documents: {
            type: "object",
            additionalProperties: true,
          },
          financialSummary: {
            type: "object",
            additionalProperties: true,
          },
          operationalSummary: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      ProjectListEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Project" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      ProjectMember: {
        type: "object",
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          userCode: { type: "integer" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string" },
        },
      },
      ProjectMemberCreateRequest: {
        type: "object",
        properties: {
          userId: { type: "string" },
          userCode: { type: "integer", minimum: 1 },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string" },
          taskCode: { type: "integer" },
          projectId: { type: "string" },
          projectCode: { type: "integer" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: ["PENDENTE", "EM_ANDAMENTO", "REVISAO", "CONCLUIDA", "CANCELADA"],
          },
          priority: { type: "integer", minimum: 1, maximum: 5, nullable: true },
          assigneeId: { type: "string", nullable: true },
          assigneeName: { type: "string", nullable: true },
          dueDate: { type: "string", format: "date-time", nullable: true },
          archivedAt: { type: "string", format: "date-time", nullable: true },
          deletedAt: { type: "string", format: "date-time", nullable: true },
          archiveContext: { $ref: "#/components/schemas/ArchiveContext" },
        },
      },
      TaskCreateRequest: {
        type: "object",
        required: ["title"],
        properties: {
          projectId: { type: "string" },
          projectCode: { type: "integer", minimum: 1 },
          title: { type: "string", minLength: 3 },
          description: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: ["PENDENTE", "EM_ANDAMENTO", "REVISAO", "CONCLUIDA", "CANCELADA"],
          },
          priority: { type: "integer", minimum: 1, maximum: 5 },
          assigneeId: { type: "string", nullable: true },
          assigneeUserCode: { type: "integer", minimum: 1, nullable: true },
          dueDate: { type: "string", format: "date-time", nullable: true },
        },
      },
      TaskUpdateRequest: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 3 },
          description: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: ["PENDENTE", "EM_ANDAMENTO", "REVISAO", "CONCLUIDA", "CANCELADA"],
          },
          priority: { type: "integer", minimum: 1, maximum: 5 },
          assigneeId: { type: "string", nullable: true },
          assigneeUserCode: { type: "integer", minimum: 1, nullable: true },
          clearAssignee: { type: "boolean", nullable: true },
          dueDate: { type: "string", format: "date-time", nullable: true },
        },
      },
      TaskStatusUpdateRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["PENDENTE", "EM_ANDAMENTO", "REVISAO", "CONCLUIDA", "CANCELADA"],
          },
        },
      },
      TaskListEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Task" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      EstimateLineInput: {
        type: "object",
        required: ["quantity"],
        properties: {
          ataItemId: { type: "string" },
          ataItemCode: { type: "integer", minimum: 1 },
          quantity: { type: "number", exclusiveMinimum: 0 },
          notes: { type: "string", nullable: true },
        },
      },
      Estimate: {
        type: "object",
        properties: {
          id: { type: "string" },
          estimateCode: { type: "integer" },
          projectId: { type: "string" },
          projectCode: { type: "integer" },
          status: {
            type: "string",
            enum: ["RASCUNHO", "FINALIZADA", "CANCELADA"],
          },
          notes: { type: "string", nullable: true },
          totalAmount: { type: "number", nullable: true },
          archivedAt: { type: "string", format: "date-time", nullable: true },
          deletedAt: { type: "string", format: "date-time", nullable: true },
          archiveContext: { $ref: "#/components/schemas/ArchiveContext" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
      EstimateCreateRequest: {
        type: "object",
        required: ["items"],
        properties: {
          projectId: { type: "string" },
          projectCode: { type: "integer", minimum: 1 },
          ataId: { type: "string" },
          ataCode: { type: "integer", minimum: 1 },
          coverageGroupId: { type: "string" },
          coverageGroupCode: { type: "string" },
          omId: { type: "string" },
          omCode: { type: "integer", minimum: 1 },
          notes: { type: "string", nullable: true },
          items: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/EstimateLineInput" },
          },
        },
      },
      EstimateUpdateRequest: {
        type: "object",
        properties: {
          omId: { type: "string" },
          omCode: { type: "integer", minimum: 1 },
          notes: { type: "string", nullable: true },
          status: {
            type: "string",
            enum: ["RASCUNHO", "FINALIZADA", "CANCELADA"],
          },
          items: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/EstimateLineInput" },
          },
        },
      },
      EstimateStatusUpdateRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["RASCUNHO", "FINALIZADA", "CANCELADA"],
          },
        },
      },
      EstimateListEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Estimate" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      Diex: {
        type: "object",
        properties: {
          id: { type: "string" },
          diexCode: { type: "integer" },
          projectId: { type: "string" },
          projectCode: { type: "integer" },
          estimateId: { type: "string" },
          estimateCode: { type: "integer" },
          diexNumber: { type: "string", nullable: true },
          issuedAt: { type: "string", format: "date-time", nullable: true },
          supplierCnpj: { type: "string" },
          requesterName: { type: "string", nullable: true },
          requesterRank: { type: "string", nullable: true },
          requesterCpf: { type: "string", nullable: true },
          requesterRole: { type: "string", nullable: true },
          issuingOrganization: { type: "string", nullable: true },
          commandName: { type: "string", nullable: true },
          pregaoNumber: { type: "string", nullable: true },
          uasg: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
          archivedAt: { type: "string", format: "date-time", nullable: true },
          deletedAt: { type: "string", format: "date-time", nullable: true },
          archiveContext: { $ref: "#/components/schemas/ArchiveContext" },
        },
      },
      DiexCreateRequest: {
        type: "object",
        required: ["supplierCnpj"],
        properties: {
          projectId: { type: "string" },
          projectCode: { type: "integer", minimum: 1 },
          estimateId: { type: "string" },
          estimateCode: { type: "integer", minimum: 1 },
          diexNumber: { type: "string", nullable: true },
          issuedAt: { type: "string", format: "date-time", nullable: true },
          supplierCnpj: { type: "string", minLength: 14 },
          requesterName: { type: "string", nullable: true },
          requesterRank: { type: "string", nullable: true },
          requesterCpf: { type: "string", nullable: true },
          requesterRole: { type: "string", nullable: true },
          issuingOrganization: { type: "string", nullable: true },
          commandName: { type: "string", nullable: true },
          pregaoNumber: { type: "string", nullable: true },
          uasg: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      DiexUpdateRequest: {
        type: "object",
        properties: {
          diexNumber: { type: "string", nullable: true },
          issuedAt: { type: "string", format: "date-time", nullable: true },
          supplierCnpj: { type: "string", minLength: 14 },
          requesterName: { type: "string", minLength: 3 },
          requesterRank: { type: "string", minLength: 2 },
          requesterCpf: { type: "string", nullable: true },
          requesterRole: { type: "string", nullable: true },
          issuingOrganization: { type: "string", nullable: true },
          commandName: { type: "string", nullable: true },
          pregaoNumber: { type: "string", nullable: true },
          uasg: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      DiexListEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Diex" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      ServiceOrderScheduleItem: {
        type: "object",
        required: ["orderIndex", "taskStep", "scheduleText"],
        properties: {
          orderIndex: { type: "integer", minimum: 1 },
          taskStep: { type: "string", minLength: 2 },
          scheduleText: { type: "string", minLength: 2 },
        },
      },
      ServiceOrderDeliveredDocument: {
        type: "object",
        required: ["description"],
        properties: {
          description: { type: "string", minLength: 2 },
          isChecked: { type: "boolean", nullable: true },
        },
      },
      ServiceOrder: {
        type: "object",
        properties: {
          id: { type: "string" },
          serviceOrderCode: { type: "integer" },
          projectId: { type: "string" },
          projectCode: { type: "integer" },
          estimateId: { type: "string" },
          estimateCode: { type: "integer" },
          diexId: { type: "string", nullable: true },
          diexCode: { type: "integer", nullable: true },
          serviceOrderNumber: { type: "string" },
          issuedAt: { type: "string", format: "date-time" },
          contractorCnpj: { type: "string" },
          requesterName: { type: "string", nullable: true },
          requesterRank: { type: "string", nullable: true },
          requesterCpf: { type: "string", nullable: true },
          requesterRole: { type: "string", nullable: true },
          issuingOrganization: { type: "string", nullable: true },
          isEmergency: { type: "boolean", nullable: true },
          plannedStartDate: { type: "string", format: "date-time", nullable: true },
          plannedEndDate: { type: "string", format: "date-time", nullable: true },
          notes: { type: "string", nullable: true },
          scheduleItems: {
            type: "array",
            items: { $ref: "#/components/schemas/ServiceOrderScheduleItem" },
          },
          deliveredDocuments: {
            type: "array",
            items: { $ref: "#/components/schemas/ServiceOrderDeliveredDocument" },
          },
          archivedAt: { type: "string", format: "date-time", nullable: true },
          deletedAt: { type: "string", format: "date-time", nullable: true },
          archiveContext: { $ref: "#/components/schemas/ArchiveContext" },
        },
      },
      ServiceOrderCreateRequest: {
        type: "object",
        required: ["issuedAt", "contractorCnpj"],
        properties: {
          projectId: { type: "string" },
          projectCode: { type: "integer", minimum: 1 },
          estimateId: { type: "string" },
          estimateCode: { type: "integer", minimum: 1 },
          diexId: { type: "string" },
          diexCode: { type: "integer", minimum: 1 },
          serviceOrderNumber: {
            type: "string",
            description: "Opcional. Se informado, sera sobrescrito pelo numero gerado automaticamente.",
          },
          issuedAt: { type: "string", format: "date-time" },
          contractorCnpj: { type: "string", minLength: 14 },
          requesterName: { type: "string", nullable: true },
          requesterRank: { type: "string", nullable: true },
          requesterRole: { type: "string", nullable: true },
          issuingOrganization: { type: "string", nullable: true },
          isEmergency: { type: "boolean", nullable: true },
          plannedStartDate: { type: "string", format: "date-time", nullable: true },
          plannedEndDate: { type: "string", format: "date-time", nullable: true },
          requestingArea: { type: "string", nullable: true },
          projectDisplayName: { type: "string", nullable: true },
          projectAcronym: { type: "string", nullable: true },
          contractNumber: { type: "string", nullable: true },
          executionLocation: { type: "string", nullable: true },
          executionHours: { type: "string", nullable: true },
          contactName: { type: "string", nullable: true },
          contactPhone: { type: "string", nullable: true },
          contactExtension: { type: "string", nullable: true },
          contractTotalTerm: { type: "string", nullable: true },
          originProcess: { type: "string", nullable: true },
          requesterCpf: { type: "string", nullable: true },
          contractorRepresentativeName: { type: "string", nullable: true },
          contractorRepresentativeRole: { type: "string", nullable: true },
          scheduleItems: {
            type: "array",
            items: { $ref: "#/components/schemas/ServiceOrderScheduleItem" },
          },
          deliveredDocuments: {
            type: "array",
            items: { $ref: "#/components/schemas/ServiceOrderDeliveredDocument" },
          },
          notes: { type: "string", nullable: true },
        },
      },
      ServiceOrderUpdateRequest: {
        type: "object",
        properties: {
          serviceOrderNumber: { type: "string", minLength: 3 },
          issuedAt: { type: "string", format: "date-time", nullable: true },
          contractorCnpj: { type: "string", minLength: 14 },
          requesterName: { type: "string", minLength: 3 },
          requesterRank: { type: "string", minLength: 2 },
          requesterCpf: { type: "string", nullable: true },
          requesterRole: { type: "string", nullable: true },
          issuingOrganization: { type: "string", nullable: true },
          isEmergency: { type: "boolean", nullable: true },
          plannedStartDate: { type: "string", format: "date-time", nullable: true },
          plannedEndDate: { type: "string", format: "date-time", nullable: true },
          requestingArea: { type: "string", nullable: true },
          projectDisplayName: { type: "string", nullable: true },
          projectAcronym: { type: "string", nullable: true },
          contractNumber: { type: "string", nullable: true },
          executionLocation: { type: "string", nullable: true },
          executionHours: { type: "string", nullable: true },
          contactName: { type: "string", nullable: true },
          contactPhone: { type: "string", nullable: true },
          contactExtension: { type: "string", nullable: true },
          contractTotalTerm: { type: "string", nullable: true },
          originProcess: { type: "string", nullable: true },
          contractorRepresentativeName: { type: "string", nullable: true },
          contractorRepresentativeRole: { type: "string", nullable: true },
          scheduleItems: {
            type: "array",
            items: { $ref: "#/components/schemas/ServiceOrderScheduleItem" },
          },
          deliveredDocuments: {
            type: "array",
            items: { $ref: "#/components/schemas/ServiceOrderDeliveredDocument" },
          },
          notes: { type: "string", nullable: true },
        },
      },
      ServiceOrderListEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ServiceOrder" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      ArchiveResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
          permissionUsed: { type: "string", nullable: true },
          cascadeApplied: { type: "boolean" },
          cascade: { $ref: "#/components/schemas/CascadeRestoreResult" },
          project: {
            type: "object",
            additionalProperties: true,
          },
          task: {
            type: "object",
            additionalProperties: true,
          },
          estimate: {
            type: "object",
            additionalProperties: true,
          },
          diex: {
            type: "object",
            additionalProperties: true,
          },
          serviceOrder: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      RestoreRequest: {
        type: "object",
        properties: {
          cascade: {
            type: "boolean",
            description:
              "Quando true, restaura dependencias pai ou filhos elegiveis em cascata, sem incluir registros com deletedAt.",
          },
        },
      },
      CascadeRestoreResult: {
        type: "object",
        properties: {
          restored: {
            type: "object",
            additionalProperties: {
              type: "integer",
            },
          },
          skipped: {
            type: "object",
            additionalProperties: {
              type: "integer",
            },
          },
        },
      },
      DashboardOperationalResponse: {
        type: "object",
        properties: {
          generatedAt: { type: "string", format: "date-time" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          summary: {
            type: "object",
            additionalProperties: true,
          },
          alerts: {
            type: "object",
            additionalProperties: true,
          },
          pendingByStage: {
            type: "object",
            additionalProperties: true,
          },
          inventory: {
            type: "object",
            properties: {
              summary: {
                type: "object",
                additionalProperties: true,
              },
              criticalItems: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              staleReservations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              recentReversals: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          operationalQueue: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
          frequentNextActions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
          latestMovements: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
      DashboardExecutiveResponse: {
        type: "object",
        properties: {
          generatedAt: { type: "string", format: "date-time" },
          filter: {
            type: "object",
            additionalProperties: true,
          },
          summary: {
            type: "object",
            additionalProperties: true,
          },
          financial: {
            type: "object",
            additionalProperties: true,
          },
          distribution: {
            type: "object",
            additionalProperties: true,
          },
          periodIndicators: {
            type: "object",
            additionalProperties: true,
          },
          inventory: {
            type: "object",
            properties: {
              snapshot: {
                type: "object",
                additionalProperties: true,
              },
              periodActivity: {
                type: "object",
                additionalProperties: true,
              },
              distribution: {
                type: "object",
                additionalProperties: true,
              },
              criticalItems: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
      DashboardOverviewResponse: {
        type: "object",
        additionalProperties: true,
      },
      SearchResponse: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer" },
          groups: {
            type: "object",
            additionalProperties: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
      },
      OperationalAlertsResponse: {
        type: "object",
        properties: {
          summary: {
            type: "object",
            additionalProperties: true,
          },
          groups: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
          alerts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
          inventoryAlerts: {
            type: "object",
            properties: {
              lowStock: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              insufficient: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              staleReservations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              reversals: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
      PublicRegisterRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 3 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6 },
        },
      },
      UserCreateRequest: {
        type: "object",
        description:
          "Cadastro administrativo de usuario. Na criacao administrativa atual, `ADMIN` nao e aceito como role de entrada.",
        required: ["name", "email", "password", "role"],
        properties: {
          name: { type: "string", minLength: 3 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6 },
          role: {
            type: "string",
            enum: ["PROJETISTA", "GESTOR", "CONSULTA"],
          },
          rank: { type: "string", nullable: true },
          cpf: { type: "string", nullable: true },
        },
        example: {
          name: "1 Ten Maria Souza",
          email: "maria.souza@sagep.mil.br",
          password: "123456",
          role: "GESTOR",
          rank: "1 Ten",
          cpf: "12345678900",
        },
      },
      UserRoleUpdateRequest: {
        type: "object",
        description:
          "O schema aceita `rank` e `cpf`, mas o backend atual persiste apenas a alteracao de `role` nesta rota.",
        required: ["role"],
        properties: {
          role: {
            type: "string",
            enum: ["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"],
          },
          rank: { type: "string", nullable: true },
          cpf: { type: "string", nullable: true },
        },
        example: {
          role: "CONSULTA",
          rank: "1 Ten",
          cpf: "12345678900",
        },
      },
      UserListEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/UserSummary" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      AtaCoverageLocality: {
        type: "object",
        required: ["cityName", "stateUf"],
        properties: {
          cityName: { type: "string", minLength: 2 },
          stateUf: { type: "string", enum: ["AM", "RO", "RR", "AC"] },
        },
      },
      AtaCoverageGroup: {
        type: "object",
        description:
          "Grupo de cobertura dentro da ATA. E a ponte entre a ata e as localidades atendidas, e tambem referencia os itens usados em estimativas.",
        required: ["code", "name", "localities"],
        properties: {
          code: { type: "string", minLength: 2 },
          name: { type: "string", minLength: 2 },
          description: { type: "string", nullable: true },
          localities: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/AtaCoverageLocality" },
          },
        },
        example: {
          code: "MNS",
          name: "Grupo Manaus",
          description: "Atendimento urbano",
          localities: [
            { cityName: "Manaus", stateUf: "AM" },
            { cityName: "Iranduba", stateUf: "AM" },
          ],
        },
      },
      AtaCoverageGroupUpdateRequest: {
        type: "object",
        description:
          "Update parcial de um grupo de cobertura. Quando `localities` e enviado, substitui apenas as localidades deste grupo.",
        properties: {
          code: { type: "string", minLength: 2 },
          name: { type: "string", minLength: 2 },
          description: { type: "string", nullable: true },
          localities: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/AtaCoverageLocality" },
          },
        },
        example: {
          name: "Grupo Roraima atualizado",
          localities: [
            { cityName: "Boa Vista", stateUf: "RR" },
            { cityName: "Pacaraima", stateUf: "RR" },
          ],
        },
      },
      Ata: {
        type: "object",
        description:
          "Catalogo principal de contratacao. Cada ata agrega grupos de cobertura e itens precificaveis consumidos pelo modulo de estimativas.",
        properties: {
          id: { type: "string" },
          ataCode: { type: "integer" },
          number: { type: "string" },
          type: { type: "string", enum: ["CFTV", "FIBRA_OPTICA"] },
          vendorName: { type: "string" },
          managingAgency: { type: "string", nullable: true },
          validFrom: { type: "string", format: "date-time", nullable: true },
          validUntil: { type: "string", format: "date-time", nullable: true },
          notes: { type: "string", nullable: true },
          isActive: { type: "boolean" },
          externalSource: { type: "string", nullable: true },
          externalUasg: { type: "string", nullable: true },
          externalPregaoNumber: { type: "string", nullable: true },
          externalPregaoYear: { type: "string", nullable: true },
          externalAtaNumber: { type: "string", nullable: true },
          externalLastSyncAt: { type: "string", format: "date-time", nullable: true },
          coverageGroups: {
            type: "array",
            items: { $ref: "#/components/schemas/AtaCoverageGroup" },
          },
        },
      },
      AtaCreateRequest: {
        type: "object",
        description:
          "Cria a ATA e toda a estrutura inicial de grupos/localidades em uma unica operacao.",
        required: ["number", "type", "vendorName", "coverageGroups"],
        properties: {
          number: { type: "string", minLength: 3 },
          type: { type: "string", enum: ["CFTV", "FIBRA_OPTICA"] },
          vendorName: { type: "string", minLength: 3 },
          managingAgency: { type: "string", nullable: true },
          validFrom: { type: "string", format: "date-time", nullable: true },
          validUntil: { type: "string", format: "date-time", nullable: true },
          notes: { type: "string", nullable: true },
          coverageGroups: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/AtaCoverageGroup" },
          },
        },
        example: {
          number: "ATA 04/2025",
          type: "CFTV",
          vendorName: "Empresa Alpha Ltda",
          managingAgency: "4 CTA",
          validFrom: "2026-01-01T00:00:00.000Z",
          validUntil: "2026-12-31T00:00:00.000Z",
          notes: "Ata principal de CFTV",
          coverageGroups: [
            {
              code: "MNS",
              name: "Grupo Manaus",
              description: "Atendimento urbano",
              localities: [
                { cityName: "Manaus", stateUf: "AM" },
                { cityName: "Iranduba", stateUf: "AM" },
              ],
            },
          ],
        },
      },
      AtaUpdateRequest: {
        type: "object",
        description:
          "Update parcial. Quando `coverageGroups` e enviado, o backend atual substitui toda a estrutura de grupos/localidades da ata.",
        properties: {
          number: { type: "string", minLength: 3 },
          type: { type: "string", enum: ["CFTV", "FIBRA_OPTICA"] },
          vendorName: { type: "string", minLength: 3 },
          managingAgency: { type: "string", nullable: true },
          validFrom: { type: "string", format: "date-time", nullable: true },
          validUntil: { type: "string", format: "date-time", nullable: true },
          notes: { type: "string", nullable: true },
          isActive: { type: "boolean", nullable: true },
          coverageGroups: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/AtaCoverageGroup" },
          },
        },
      },
      AtaListEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Ata" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      ComprasGovAtaPreviewItem: {
        type: "object",
        properties: {
          referenceCode: { type: "string" },
          description: { type: "string" },
          unit: { type: "string" },
          unitPrice: { type: "number" },
          initialQuantity: { type: "number" },
          externalItemId: { type: "string" },
          externalItemNumber: { type: "string" },
        },
      },
      ComprasGovAtaFound: {
        type: "object",
        properties: {
          ataNumber: { type: "string" },
          vendorName: { type: "string", nullable: true },
          itemCount: { type: "number" },
          totalAmount: { type: "number", nullable: true },
          validFrom: { type: "string", format: "date-time", nullable: true },
          validUntil: { type: "string", format: "date-time", nullable: true },
          sampleItems: {
            type: "array",
            items: { $ref: "#/components/schemas/ComprasGovAtaPreviewItem" },
          },
        },
      },
      ComprasGovAtaPreview: {
        type: "object",
        properties: {
          source: { type: "string", enum: ["COMPRAS_GOV"] },
          uasg: { type: "string" },
          numeroPregao: { type: "string" },
          anoPregao: { type: "string" },
          ata: {
            nullable: true,
            oneOf: [
              {
                type: "object",
                properties: {
                  number: { type: "string" },
                  type: {
                    type: "string",
                    enum: ["CFTV", "FIBRA_OPTICA"],
                    nullable: true,
                  },
                  vendorName: { type: "string", nullable: true },
                  managingAgency: { type: "string", nullable: true },
                  validFrom: { type: "string", format: "date-time", nullable: true },
                  validUntil: { type: "string", format: "date-time", nullable: true },
                },
              },
            ],
          },
          coverageGroups: {
            type: "array",
            items: { type: "object" },
          },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ComprasGovAtaPreviewItem" },
          },
          atasFound: {
            type: "array",
            items: { $ref: "#/components/schemas/ComprasGovAtaFound" },
          },
          selectedAta: {
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/ComprasGovAtaFound" }],
          },
          warnings: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      ComprasGovAtaImportRequest: {
        type: "object",
        required: ["uasg", "numeroPregao", "anoPregao", "ataType"],
        properties: {
          uasg: { type: "string" },
          numeroPregao: { type: "string" },
          anoPregao: { type: "string" },
          numeroAta: { type: "string", nullable: true },
          ataType: { type: "string", enum: ["CFTV", "FIBRA_OPTICA"] },
          coverageGroupId: { type: "string", nullable: true },
          coverageGroupCode: { type: "string", nullable: true },
          coverageGroupName: { type: "string", nullable: true },
          coverageGroupStateUf: { type: "string", enum: ["AM", "RO", "RR", "AC"], nullable: true },
          coverageGroupCityName: { type: "string", nullable: true },
          coverageGroupLocalities: {
            type: "array",
            nullable: true,
            items: { $ref: "#/components/schemas/AtaCoverageLocality" },
          },
          dryRun: { type: "boolean", nullable: true },
        },
      },
      ComprasGovAtaImportResponse: {
        type: "object",
        properties: {
          dryRun: { type: "boolean" },
          preview: { $ref: "#/components/schemas/ComprasGovAtaPreview" },
          ata: {
            nullable: true,
            type: "object",
            properties: {
              id: { type: "string" },
              ataCode: { type: "integer" },
              number: { type: "string" },
              type: { type: "string", enum: ["CFTV", "FIBRA_OPTICA"] },
              vendorName: { type: "string" },
              managingAgency: { type: "string", nullable: true },
              validFrom: { type: "string", format: "date-time", nullable: true },
              validUntil: { type: "string", format: "date-time", nullable: true },
            },
          },
          coverageGroup: {
            nullable: true,
            type: "object",
            properties: {
              id: { type: "string" },
              code: { type: "string" },
              name: { type: "string" },
              localities: {
                type: "array",
                items: { $ref: "#/components/schemas/AtaCoverageLocality" },
              },
            },
          },
          itemsCreated: { type: "integer" },
          itemsUpdated: { type: "integer" },
          warnings: {
            type: "array",
            items: { type: "string" },
          },
          imported: {
            type: "object",
            properties: {
              ataId: { type: "string", nullable: true },
              coverageGroupId: { type: "string", nullable: true },
              coverageGroupCode: { type: "string", nullable: true },
              createdItems: { type: "integer" },
              updatedItems: { type: "integer" },
            },
          },
        },
      },
      AtaItem: {
        type: "object",
        description:
          "Item precificavel de uma ATA, sempre associado a um grupo de cobertura especifico.",
        properties: {
          id: { type: "string" },
          ataItemCode: { type: "integer" },
          ataId: { type: "string" },
          coverageGroupId: { type: "string" },
          referenceCode: { type: "string" },
          description: { type: "string" },
          unit: { type: "string" },
          unitPrice: { type: "string", description: "Decimal serializado pelo Prisma." },
          initialQuantity: {
            type: "string",
            description: "Saldo inicial configurado para o item da ATA.",
          },
          notes: { type: "string", nullable: true },
          isActive: { type: "boolean" },
          deletedAt: { type: "string", format: "date-time", nullable: true },
          externalSource: { type: "string", nullable: true },
          externalItemId: { type: "string", nullable: true },
          externalItemNumber: { type: "string", nullable: true },
          externalLastSyncAt: { type: "string", format: "date-time", nullable: true },
          balance: {
            type: "object",
            properties: {
              initialQuantity: { type: "string" },
              reservedQuantity: { type: "string" },
              consumedQuantity: { type: "string" },
              availableQuantity: { type: "string" },
              initialAmount: { type: "string" },
              reservedAmount: { type: "string" },
              consumedAmount: { type: "string" },
              availableAmount: { type: "string" },
              lowStock: { type: "boolean" },
              insufficient: { type: "boolean" },
              lastMovementAt: { type: "string", format: "date-time", nullable: true },
            },
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          ata: {
            type: "object",
            properties: {
              id: { type: "string" },
              ataCode: { type: "integer" },
              number: { type: "string" },
              type: { type: "string", enum: ["CFTV", "FIBRA_OPTICA"] },
              vendorName: { type: "string" },
              isActive: { type: "boolean" },
            },
          },
          coverageGroup: {
            type: "object",
            properties: {
              id: { type: "string" },
              code: { type: "string" },
              name: { type: "string" },
              description: { type: "string", nullable: true },
              localities: {
                type: "array",
                items: { $ref: "#/components/schemas/AtaCoverageLocality" },
              },
            },
          },
        },
        example: {
          id: "cmitem123",
          ataItemCode: 12,
          ataId: "cmata123",
          coverageGroupId: "cmgroup123",
          referenceCode: "CAM-001",
          description: "Camera IP externa",
          unit: "UN",
          unitPrice: "1250.50",
          initialQuantity: "1000.00",
          notes: "Modelo padrao",
          isActive: true,
          deletedAt: null,
          balance: {
            initialQuantity: "1000.00",
            reservedQuantity: "0.00",
            consumedQuantity: "0.00",
            availableQuantity: "1000.00",
            initialAmount: "1250500.00",
            reservedAmount: "0.00",
            consumedAmount: "0.00",
            availableAmount: "1250500.00",
            lowStock: false,
            insufficient: false,
            lastMovementAt: null,
          },
          createdAt: "2026-04-29T00:00:00.000Z",
          updatedAt: "2026-04-29T00:00:00.000Z",
          ata: {
            id: "cmata123",
            ataCode: 3,
            number: "ATA 04/2025",
            type: "CFTV",
            vendorName: "Empresa Alpha Ltda",
            isActive: true,
          },
          coverageGroup: {
            id: "cmgroup123",
            code: "MNS",
            name: "Grupo Manaus",
            description: "Atendimento urbano",
            localities: [{ cityName: "Manaus", stateUf: "AM" }],
          },
        },
      },
      AtaItemCreateRequest: {
        type: "object",
        required: [
          "coverageGroupCode",
          "referenceCode",
          "description",
          "unit",
          "unitPrice",
          "initialQuantity",
        ],
        properties: {
          coverageGroupCode: { type: "string", minLength: 2 },
          referenceCode: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 3 },
          unit: { type: "string", minLength: 1 },
          unitPrice: { type: "number", exclusiveMinimum: 0 },
          initialQuantity: { type: "number", exclusiveMinimum: 0 },
          notes: { type: "string", nullable: true },
        },
        example: {
          coverageGroupCode: "MNS",
          referenceCode: "CAM-001",
          description: "Camera IP externa",
          unit: "un",
          unitPrice: 1250.5,
          initialQuantity: 1000,
          notes: "Modelo padrao",
        },
      },
      AtaItemUpdateRequest: {
        type: "object",
        properties: {
          coverageGroupCode: { type: "string", minLength: 2 },
          referenceCode: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 3 },
          unit: { type: "string", minLength: 1 },
          unitPrice: { type: "number", exclusiveMinimum: 0 },
          initialQuantity: { type: "number", exclusiveMinimum: 0 },
          notes: { type: "string", nullable: true },
          isActive: { type: "boolean", nullable: true },
        },
        example: {
          coverageGroupCode: "INT",
          unitPrice: 1310,
          initialQuantity: 750,
          isActive: false,
        },
      },
      AtaItemsEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/AtaItem" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      AtaItemBalanceMovement: {
        type: "object",
        description:
          "Movimentacao historica de saldo de um item de ATA. Leitura apenas; nao altera regra de saldo.",
        properties: {
          id: { type: "string" },
          movementType: {
            type: "string",
            enum: ["RESERVE", "RELEASE", "CONSUME", "REVERSE_CONSUME", "ADJUSTMENT"],
          },
          quantity: { type: "string", description: "Decimal serializado pelo Prisma." },
          unitPrice: { type: "string", description: "Decimal serializado pelo Prisma." },
          totalAmount: { type: "string", description: "Decimal serializado pelo Prisma." },
          summary: { type: "string" },
          actorName: { type: "string", nullable: true },
          projectId: { type: "string", nullable: true },
          projectCode: { type: "integer", nullable: true },
          estimateId: { type: "string", nullable: true },
          estimateCode: { type: "integer", nullable: true },
          diexRequestId: { type: "string", nullable: true },
          diexCode: { type: "integer", nullable: true },
          serviceOrderId: { type: "string", nullable: true },
          serviceOrderCode: { type: "integer", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
        example: {
          id: "cmmovement123",
          movementType: "RESERVE",
          quantity: "2",
          unitPrice: "100",
          totalAmount: "200",
          summary: "Reserva de saldo para o DIEx #7",
          actorName: "ADMIN",
          projectId: "cmproject123",
          projectCode: 15,
          estimateId: "cmestimate123",
          estimateCode: 21,
          diexRequestId: "cmdiex123",
          diexCode: 7,
          serviceOrderId: null,
          serviceOrderCode: null,
          createdAt: "2026-04-29T00:00:00.000Z",
        },
      },
      AtaItemBalanceMovementsResponse: {
        type: "array",
        items: { $ref: "#/components/schemas/AtaItemBalanceMovement" },
      },
      ComprasGovExternalBalanceComparisonItem: {
        type: "object",
        properties: {
          item: {
            type: "object",
            properties: {
              id: { type: "string" },
              ataItemCode: { type: "integer" },
              referenceCode: { type: "string" },
              description: { type: "string" },
              externalItemId: { type: "string", nullable: true },
              externalItemNumber: { type: "string", nullable: true },
            },
          },
          localBalance: {
            type: "object",
            additionalProperties: true,
          },
          externalBalance: {
            nullable: true,
            type: "object",
            properties: {
              externalItemNumber: { type: "string" },
              source: { type: "string", enum: ["COMPRAS_GOV", "COMPRAS_GOV_IMPORT_FALLBACK"] },
              registeredQuantity: { type: "string" },
              committedQuantity: { type: "string" },
              availableQuantity: { type: "string" },
              lastUpdatedAt: { type: "string", format: "date-time", nullable: true },
              rawRecords: { type: "integer" },
            },
          },
          difference: { type: "string", nullable: true },
          lastSyncAt: { type: "string", format: "date-time", nullable: true },
          status: {
            type: "string",
            enum: [
              "OK",
              "DIVERGENTE",
              "CONSUMO_EXTERNO_DETECTADO",
              "NAO_ENCONTRADO",
              "ERRO_CONSULTA_EXTERNA",
              "SEM_EMPENHO_REGISTRADO",
            ],
          },
          externalError: {
            type: "object",
            nullable: true,
            properties: {
              status: { type: "integer", nullable: true },
              url: { type: "string", nullable: true },
              body: { type: "string", nullable: true },
            },
          },
        },
      },
      ComprasGovExternalBalanceComparison: {
        type: "object",
        properties: {
          source: { type: "string", enum: ["COMPRAS_GOV"] },
          ata: {
            type: "object",
            properties: {
              id: { type: "string" },
              ataCode: { type: "integer" },
              number: { type: "string" },
              externalUasg: { type: "string", nullable: true },
              externalPregaoNumber: { type: "string", nullable: true },
              externalPregaoYear: { type: "string", nullable: true },
              externalAtaNumber: { type: "string", nullable: true },
              externalLastSyncAt: { type: "string", format: "date-time", nullable: true },
            },
          },
          comparedAt: { type: "string", format: "date-time" },
          summary: {
            type: "object",
            properties: {
              totalItems: { type: "integer" },
              ok: { type: "integer" },
              divergent: { type: "integer" },
              externalConsumptionDetected: { type: "integer" },
              notFound: { type: "integer" },
              externalQueryErrors: { type: "integer" },
              semEmpenhoRegistrado: { type: "integer" },
            },
          },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ComprasGovExternalBalanceComparisonItem" },
          },
          warnings: {
            type: "array",
            items: { type: "string" },
          },
          debug: {
            type: "array",
            nullable: true,
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
      ComprasGovExternalBalanceSyncResponse: {
        allOf: [
          { $ref: "#/components/schemas/ComprasGovExternalBalanceComparison" },
          {
            type: "object",
            properties: {
              syncedAt: { type: "string", format: "date-time" },
              updatedItems: { type: "integer" },
              warnings: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        ],
      },
      MilitaryOrganization: {
        type: "object",
        description:
          "Catalogo de OMs usadas como destino operacional em estimativas. A localidade da OM e usada para validar compatibilidade com o grupo de cobertura da ATA.",
        properties: {
          id: { type: "string" },
          omCode: { type: "integer" },
          sigla: { type: "string" },
          name: { type: "string" },
          cityName: { type: "string" },
          stateUf: { type: "string", enum: ["AM", "RO", "RR", "AC"] },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      MilitaryOrganizationCreateRequest: {
        type: "object",
        required: ["sigla", "name", "cityName", "stateUf"],
        properties: {
          sigla: { type: "string", minLength: 2 },
          name: { type: "string", minLength: 3 },
          cityName: { type: "string", minLength: 2 },
          stateUf: { type: "string", enum: ["AM", "RO", "RR", "AC"] },
        },
        example: {
          sigla: "4CTA",
          name: "4 Centro de Telematica de Area",
          cityName: "Manaus",
          stateUf: "AM",
        },
      },
      MilitaryOrganizationUpdateRequest: {
        type: "object",
        properties: {
          sigla: { type: "string", minLength: 2 },
          name: { type: "string", minLength: 3 },
          cityName: { type: "string", minLength: 2 },
          stateUf: { type: "string", enum: ["AM", "RO", "RR", "AC"] },
          isActive: { type: "boolean", nullable: true },
        },
        example: {
          name: "4 Centro de Telematica de Area - Sede Manaus",
          isActive: false,
        },
      },
      MilitaryOrganizationListEnvelope: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/MilitaryOrganization" },
          },
          meta: { $ref: "#/components/schemas/PaginationMeta" },
          filters: {
            type: "object",
            additionalProperties: true,
          },
          links: { $ref: "#/components/schemas/ListLinks" },
        },
      },
      HealthResponse: {
        type: "object",
        required: ["message", "status", "timestamp"],
        properties: {
          message: { type: "string" },
          status: { type: "string", enum: ["ok"] },
          timestamp: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["health"],
        summary: "Health check publico",
        responses: {
          "200": okJson("#/components/schemas/HealthResponse"),
        },
      },
    },
    "/auth/register": {
      post: {
        tags: ["auth"],
        summary: "Registrar usuario publico",
        description: "Cria um usuario com role inicial CONSULTA.",
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/PublicRegisterRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/UserSummary"),
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Autenticar usuario",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 1 },
                },
              },
            },
          },
        },
        responses: {
          "200": okJson("#/components/schemas/AuthTokensResponse"),
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["auth"],
        summary: "Usuario autenticado atual",
        security: bearerSecurity,
        responses: {
          "200": okJson("#/components/schemas/UserSummary"),
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["auth"],
        summary: "Rotacionar refresh token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                  refreshToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": okJson("#/components/schemas/AuthTokensResponse"),
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["auth"],
        summary: "Revogar refresh token atual",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                  refreshToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "Logout realizado"),
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/auth/sessions": {
      get: {
        tags: ["auth"],
        summary: "Listar sessoes proprias",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          queryParameter("status", "Filtro por status de sessao.", {
            type: "string",
            enum: ["ACTIVE", "REVOKED", "EXPIRED", "ALL"],
            default: "ACTIVE",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/SessionsEnvelope"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["sessions.manage_own"],
      },
    },
    "/auth/sessions/{sessionId}/revoke": {
      post: {
        tags: ["auth"],
        summary: "Revogar uma sessao propria",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/SessionId" }],
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "Sessao revogada"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["sessions.manage_own"],
      },
    },
    "/auth/sessions/revoke-all": {
      post: {
        tags: ["auth"],
        summary: "Revogar todas as sessoes proprias",
        security: bearerSecurity,
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "Sessoes revogadas"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["sessions.manage_own"],
      },
    },
    "/auth/users/{userId}/sessions": {
      get: {
        tags: ["auth"],
        summary: "Listar sessoes de um usuario",
        security: bearerSecurity,
        parameters: [
          pathIdParameter("userId", "Identificador do usuario."),
          ...paginationParameters,
          queryParameter("status", "Filtro por status de sessao.", {
            type: "string",
            enum: ["ACTIVE", "REVOKED", "EXPIRED", "ALL"],
            default: "ACTIVE",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/SessionsEnvelope"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["sessions.manage_all"],
      },
    },
    "/auth/users/{userId}/sessions/{sessionId}/revoke": {
      post: {
        tags: ["auth"],
        summary: "Revogar sessao de outro usuario",
        security: bearerSecurity,
        parameters: [
          pathIdParameter("userId", "Identificador do usuario."),
          { $ref: "#/components/parameters/SessionId" },
        ],
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "Sessao revogada"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["sessions.manage_all"],
      },
    },
    "/auth/users/{userId}/sessions/revoke-all": {
      post: {
        tags: ["auth"],
        summary: "Revogar todas as sessoes de outro usuario",
        security: bearerSecurity,
        parameters: [pathIdParameter("userId", "Identificador do usuario.")],
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "Sessoes revogadas"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["sessions.manage_all"],
      },
    },
    "/auth/sessions/cleanup": {
      post: {
        tags: ["auth"],
        summary: "Executar limpeza administrativa de sessoes e auditoria",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/CleanupSessionsRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/CleanupSessionsResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["sessions.manage_all"],
      },
    },
    "/audits": {
      get: {
        tags: ["audits"],
        summary: "Listar logs de auditoria",
        description:
          "Retorna AuditLog ordenado por createdAt desc. Acesso restrito a usuarios ADMIN e GESTOR.",
        security: bearerSecurity,
        parameters: [
          { $ref: "#/components/parameters/Page" },
          queryParameter("limit", "Quantidade por pagina.", {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 50,
          }),
          queryParameter("entityType", "Tipo da entidade auditada.", { type: "string" }),
          queryParameter("action", "Acao auditada.", { type: "string" }),
          queryParameter("actor", "Busca por nome do ator ou id do usuario.", {
            type: "string",
          }),
          queryParameter("search", "Busca em resumo, entidade e ator.", { type: "string" }),
          queryParameter("startDate", "Inicio do periodo por createdAt.", {
            type: "string",
            format: "date-time",
          }),
          queryParameter("endDate", "Fim do periodo por createdAt.", {
            type: "string",
            format: "date-time",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/AuditLogListEnvelope"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN", "GESTOR"],
      },
    },
    "/projects": {
      get: {
        tags: ["projects"],
        summary: "Listar projetos",
        description: "Aceita `format=legacy` para preservar o array historico.",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          ...archiveFilterParameters,
          queryParameter("code", "Codigo sequencial do projeto.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("status", "Status do projeto.", {
            type: "string",
            enum: ["PLANEJAMENTO", "EM_ANDAMENTO", "PAUSADO", "CONCLUIDO", "CANCELADO"],
          }),
          queryParameter("stage", "Etapa atual do workflow.", {
            type: "string",
            enum: [
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
            ],
          }),
          queryParameter("search", "Busca textual por titulo e campos relacionados.", {
            type: "string",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/ProjectListEnvelope"),
          ...defaultErrorResponses,
        },
      },
      post: {
        tags: ["projects"],
        summary: "Criar projeto",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/ProjectCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/Project"),
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/code/{code}": {
      get: {
        tags: ["projects"],
        summary: "Buscar projeto por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectCode" }],
        responses: {
          "200": okJson("#/components/schemas/Project"),
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/{id}": {
      get: {
        tags: ["projects"],
        summary: "Detalhe simples do projeto",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: {
          "200": okJson("#/components/schemas/Project"),
          ...defaultErrorResponses,
        },
      },
      patch: {
        tags: ["projects"],
        summary: "Atualizar projeto",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/ProjectUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/Project"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["projects.edit_all", "projects.edit_own"],
      },
      delete: {
        tags: ["projects"],
        summary: "Arquivar projeto",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "Projeto arquivado", archiveResponseExample),
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/{id}/flow": {
      patch: {
        tags: ["projects"],
        summary: "Atualizar etapa e marcos documentais",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/ProjectFlowUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/Project"),
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/{id}/as-built/review": {
      patch: {
        tags: ["projects"],
        summary: "Aprovar ou reprovar a análise do As-Built",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/ProjectAsBuiltReviewRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/Project"),
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/{id}/commitment-note/cancel": {
      post: {
        tags: ["projects"],
        summary: "Cancelar Nota de Empenho com rollback documental e financeiro",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/ProjectCommitmentNoteCancelRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/ProjectCommitmentNoteCancelResponse"),
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/{id}/restore": {
      post: {
        tags: ["projects"],
        summary: "Restaurar projeto arquivado",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        requestBody: {
          required: false,
          content: jsonContent("#/components/schemas/RestoreRequest", restoreRequestExample),
        },
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "Projeto restaurado", restoreResponseExample),
          ...defaultErrorResponses,
        },
        "x-permissions": ["projects.restore"],
      },
    },
    "/projects/{id}/details": {
      get: {
        tags: ["projects"],
        summary: "Detalhe ampliado para a tela principal do projeto",
        security: bearerSecurity,
        parameters: [
          { $ref: "#/components/parameters/ProjectId" },
          { $ref: "#/components/parameters/IncludeArchived" },
        ],
        responses: {
          "200": okJson("#/components/schemas/ProjectDetailsResponse"),
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/{id}/timeline": {
      get: {
        tags: ["projects"],
        summary: "Timeline unificada de auditoria do projeto",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: {
          "200": {
            description: "Eventos cronologicos do projeto e entidades relacionadas.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ProjectTimelineItem" },
                },
              },
            },
          },
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/{id}/next-action": {
      get: {
        tags: ["projects"],
        summary: "Obter proxima acao recomendada do workflow",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: {
          "200": {
            description: "Proxima acao calculada para UX operacional.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/{id}/members": {
      get: {
        tags: ["projects"],
        summary: "Listar membros vinculados ao projeto",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: {
          "200": {
            description: "Membros vinculados.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ProjectMember" },
                },
              },
            },
          },
          ...defaultErrorResponses,
        },
      },
      post: {
        tags: ["projects"],
        summary: "Adicionar membro ao projeto",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/ProjectMemberCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/ProjectMember"),
          ...defaultErrorResponses,
        },
      },
    },
    "/projects/{id}/members/{memberId}": {
      delete: {
        tags: ["projects"],
        summary: "Remover membro do projeto",
        security: bearerSecurity,
        parameters: [
          { $ref: "#/components/parameters/ProjectId" },
          { $ref: "#/components/parameters/MemberId" },
        ],
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "Membro removido"),
          ...defaultErrorResponses,
        },
      },
    },
    "/tasks": {
      get: {
        tags: ["tasks"],
        summary: "Listar tarefas",
        description: "Aceita `format=legacy` para preservar o array historico.",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          ...archiveFilterParameters,
          queryParameter("code", "Codigo sequencial da tarefa.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("projectCode", "Codigo do projeto vinculado.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("assigneeCode", "Codigo do responsavel.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("status", "Status da tarefa.", {
            type: "string",
            enum: ["PENDENTE", "EM_ANDAMENTO", "REVISAO", "CONCLUIDA", "CANCELADA"],
          }),
          queryParameter("search", "Busca textual.", { type: "string" }),
        ],
        responses: {
          "200": okJson("#/components/schemas/TaskListEnvelope"),
          ...defaultErrorResponses,
        },
      },
      post: {
        tags: ["tasks"],
        summary: "Criar tarefa",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/TaskCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/Task"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["tasks.create"],
      },
    },
    "/tasks/code/{code}": {
      get: {
        tags: ["tasks"],
        summary: "Buscar tarefa por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/TaskCode" }],
        responses: {
          "200": okJson("#/components/schemas/Task"),
          ...defaultErrorResponses,
        },
      },
    },
    "/tasks/{id}": {
      get: {
        tags: ["tasks"],
        summary: "Detalhe da tarefa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/TaskId" }],
        responses: {
          "200": okJson("#/components/schemas/Task"),
          ...defaultErrorResponses,
        },
      },
      patch: {
        tags: ["tasks"],
        summary: "Atualizar tarefa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/TaskId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/TaskUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/Task"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["tasks.edit_all", "tasks.edit_own", "tasks.assign"],
      },
      delete: {
        tags: ["tasks"],
        summary: "Arquivar tarefa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/TaskId" }],
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "Tarefa arquivada", archiveResponseExample),
          ...defaultErrorResponses,
        },
        "x-permissions": ["tasks.archive"],
      },
    },
    "/tasks/{id}/status": {
      patch: {
        tags: ["tasks"],
        summary: "Atualizar status da tarefa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/TaskId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/TaskStatusUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/Task"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["tasks.edit_all", "tasks.edit_own", "tasks.complete"],
      },
    },
    "/tasks/{id}/restore": {
      post: {
        tags: ["tasks"],
        summary: "Restaurar tarefa arquivada",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/TaskId" }],
        requestBody: {
          required: false,
          content: jsonContent("#/components/schemas/RestoreRequest", restoreRequestExample),
        },
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "Tarefa restaurada"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["tasks.restore"],
      },
    },
    "/estimates": {
      get: {
        tags: ["estimates"],
        summary: "Listar estimativas",
        description: "Aceita `format=legacy` para preservar o array historico.",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          ...archiveFilterParameters,
          queryParameter("code", "Codigo sequencial da estimativa.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("projectCode", "Codigo do projeto vinculado.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("ataCode", "Codigo da ata.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("omCode", "Codigo da OM.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("status", "Status da estimativa.", {
            type: "string",
            enum: ["RASCUNHO", "FINALIZADA", "CANCELADA"],
          }),
          queryParameter("cityName", "Cidade do grupo de cobertura.", { type: "string" }),
          queryParameter("stateUf", "UF do grupo de cobertura.", {
            type: "string",
            enum: ["AM", "RO", "RR", "AC"],
          }),
          queryParameter("search", "Busca textual.", { type: "string" }),
        ],
        responses: {
          "200": okJson("#/components/schemas/EstimateListEnvelope"),
          ...defaultErrorResponses,
        },
      },
      post: {
        tags: ["estimates"],
        summary: "Criar estimativa",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/EstimateCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/Estimate"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["estimates.create"],
      },
    },
    "/estimates/code/{code}": {
      get: {
        tags: ["estimates"],
        summary: "Buscar estimativa por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/EstimateCode" }],
        responses: {
          "200": okJson("#/components/schemas/Estimate"),
          ...defaultErrorResponses,
        },
      },
    },
    "/estimates/{id}": {
      get: {
        tags: ["estimates"],
        summary: "Detalhe da estimativa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/EstimateId" }],
        responses: {
          "200": okJson("#/components/schemas/Estimate"),
          ...defaultErrorResponses,
        },
      },
      patch: {
        tags: ["estimates"],
        summary: "Atualizar estimativa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/EstimateId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/EstimateUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/Estimate"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["estimates.edit", "estimates.finalize"],
      },
      delete: {
        tags: ["estimates"],
        summary: "Arquivar estimativa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/EstimateId" }],
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "Estimativa arquivada"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["estimates.archive"],
      },
    },
    "/estimates/{id}/status": {
      patch: {
        tags: ["estimates"],
        summary: "Atualizar status da estimativa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/EstimateId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/EstimateStatusUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/Estimate"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["estimates.edit", "estimates.finalize"],
      },
    },
    "/estimates/{id}/restore": {
      post: {
        tags: ["estimates"],
        summary: "Restaurar estimativa arquivada",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/EstimateId" }],
        requestBody: {
          required: false,
          content: jsonContent("#/components/schemas/RestoreRequest", restoreRequestExample),
        },
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "Estimativa restaurada"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["estimates.restore"],
      },
    },
    "/estimates/{id}/document/html": {
      get: {
        tags: ["estimates"],
        summary: "Gerar documento HTML da estimativa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/EstimateId" }],
        responses: {
          "200": { description: "Documento HTML", content: htmlContent() },
          ...defaultErrorResponses,
        },
      },
    },
    "/estimates/{id}/document/pdf": {
      get: {
        tags: ["estimates"],
        summary: "Gerar documento PDF da estimativa",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/EstimateId" }],
        responses: {
          "200": { description: "Documento PDF", content: binaryContent("application/pdf") },
          ...defaultErrorResponses,
        },
      },
    },
    "/diex": {
      get: {
        tags: ["diex"],
        summary: "Listar DIEx",
        description: "Aceita `format=legacy` para preservar o array historico.",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          ...archiveFilterParameters,
          queryParameter("code", "Codigo sequencial do DIEx.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("projectCode", "Codigo do projeto vinculado.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("estimateCode", "Codigo da estimativa vinculada.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("search", "Busca textual.", { type: "string" }),
        ],
        responses: {
          "200": okJson("#/components/schemas/DiexListEnvelope"),
          ...defaultErrorResponses,
        },
      },
      post: {
        tags: ["diex"],
        summary: "Emitir DIEx",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/DiexCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/Diex"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["diex.issue"],
      },
    },
    "/diex/code/{code}": {
      get: {
        tags: ["diex"],
        summary: "Buscar DIEx por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/DiexCode" }],
        responses: {
          "200": okJson("#/components/schemas/Diex"),
          ...defaultErrorResponses,
        },
      },
    },
    "/diex/{id}": {
      get: {
        tags: ["diex"],
        summary: "Detalhe do DIEx",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/DiexId" }],
        responses: {
          "200": okJson("#/components/schemas/Diex"),
          ...defaultErrorResponses,
        },
      },
      patch: {
        tags: ["diex"],
        summary: "Atualizar DIEx",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/DiexId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/DiexUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/Diex"),
          ...defaultErrorResponses,
        },
      },
      delete: {
        tags: ["diex"],
        summary: "Arquivar ou cancelar DIEx",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/DiexId" }],
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "DIEx arquivado"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["diex.cancel"],
      },
    },
    "/diex/{id}/restore": {
      post: {
        tags: ["diex"],
        summary: "Restaurar DIEx arquivado",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/DiexId" }],
        requestBody: {
          required: false,
          content: jsonContent("#/components/schemas/RestoreRequest", restoreRequestExample),
        },
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "DIEx restaurado"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["diex.restore"],
      },
    },
    "/diex/{id}/document/html": {
      get: {
        tags: ["diex"],
        summary: "Gerar documento HTML do DIEx",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/DiexId" }],
        responses: {
          "200": { description: "Documento HTML", content: htmlContent() },
          ...defaultErrorResponses,
        },
      },
    },
    "/diex/{id}/document/pdf": {
      get: {
        tags: ["diex"],
        summary: "Gerar documento PDF do DIEx",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/DiexId" }],
        responses: {
          "200": { description: "Documento PDF", content: binaryContent("application/pdf") },
          ...defaultErrorResponses,
        },
      },
    },
    "/service-orders": {
      get: {
        tags: ["service-orders"],
        summary: "Listar ordens de servico",
        description: "Aceita `format=legacy` para preservar o array historico.",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          ...archiveFilterParameters,
          queryParameter("code", "Codigo sequencial da OS.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("projectCode", "Codigo do projeto vinculado.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("estimateCode", "Codigo da estimativa vinculada.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("diexCode", "Codigo do DIEx vinculado.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("emergency", "Filtrar ordens emergenciais.", { type: "boolean" }),
          queryParameter("search", "Busca textual.", { type: "string" }),
        ],
        responses: {
          "200": okJson("#/components/schemas/ServiceOrderListEnvelope"),
          ...defaultErrorResponses,
        },
      },
      post: {
        tags: ["service-orders"],
        summary: "Emitir ordem de servico",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/ServiceOrderCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/ServiceOrder"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["service_orders.issue"],
      },
    },
    "/service-orders/code/{code}": {
      get: {
        tags: ["service-orders"],
        summary: "Buscar ordem de servico por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ServiceOrderCode" }],
        responses: {
          "200": okJson("#/components/schemas/ServiceOrder"),
          ...defaultErrorResponses,
        },
      },
    },
    "/service-orders/number/{serviceOrderNumber}": {
      get: {
        tags: ["service-orders"],
        summary: "Buscar ordem de servico por numero documental",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ServiceOrderNumber" }],
        responses: {
          "200": okJson("#/components/schemas/ServiceOrder"),
          ...defaultErrorResponses,
        },
      },
    },
    "/service-orders/{id}": {
      get: {
        tags: ["service-orders"],
        summary: "Detalhe da ordem de servico",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ServiceOrderId" }],
        responses: {
          "200": okJson("#/components/schemas/ServiceOrder"),
          ...defaultErrorResponses,
        },
      },
      patch: {
        tags: ["service-orders"],
        summary: "Atualizar ordem de servico",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ServiceOrderId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/ServiceOrderUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/ServiceOrder"),
          ...defaultErrorResponses,
        },
      },
      delete: {
        tags: ["service-orders"],
        summary: "Arquivar ou cancelar ordem de servico",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ServiceOrderId" }],
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "OS arquivada"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["service_orders.cancel"],
      },
    },
    "/service-orders/{id}/restore": {
      post: {
        tags: ["service-orders"],
        summary: "Restaurar ordem de servico arquivada",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ServiceOrderId" }],
        requestBody: {
          required: false,
          content: jsonContent("#/components/schemas/RestoreRequest", restoreRequestExample),
        },
        responses: {
          "200": okJson("#/components/schemas/ArchiveResponse", "OS restaurada"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["service_orders.restore"],
      },
    },
    "/service-orders/{id}/document/html": {
      get: {
        tags: ["service-orders"],
        summary: "Gerar documento HTML da OS",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ServiceOrderId" }],
        responses: {
          "200": { description: "Documento HTML", content: htmlContent() },
          ...defaultErrorResponses,
        },
      },
    },
    "/service-orders/{id}/document/pdf": {
      get: {
        tags: ["service-orders"],
        summary: "Gerar documento PDF da OS",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ServiceOrderId" }],
        responses: {
          "200": { description: "Documento PDF", content: binaryContent("application/pdf") },
          ...defaultErrorResponses,
        },
      },
    },
    "/dashboard/operational": {
      get: {
        tags: ["dashboard"],
        summary: "Dashboard operacional",
        security: bearerSecurity,
        parameters: [
          queryParameter("staleDays", "Dias para marcar item como atrasado.", {
            type: "integer",
            minimum: 1,
            maximum: 365,
            default: 15,
          }),
          queryParameter("limit", "Limite de itens retornados.", {
            type: "integer",
            minimum: 1,
            maximum: 200,
            default: 100,
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/DashboardOperationalResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["dashboard.view_operational"],
      },
    },
    "/dashboard/executive": {
      get: {
        tags: ["dashboard"],
        summary: "Dashboard executivo",
        security: bearerSecurity,
        parameters: [
          queryParameter("periodType", "Periodo relativo.", {
            type: "string",
            enum: ["month", "quarter", "semester", "year"],
          }),
          queryParameter("referenceDate", "Data de referencia ISO.", {
            type: "string",
            format: "date-time",
          }),
          queryParameter("startDate", "Data inicial ISO.", {
            type: "string",
            format: "date-time",
          }),
          queryParameter("endDate", "Data final ISO.", {
            type: "string",
            format: "date-time",
          }),
          queryParameter("asOfDate", "Ponto no tempo ISO.", {
            type: "string",
            format: "date-time",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/DashboardExecutiveResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["dashboard.view_executive"],
      },
    },
    "/dashboard": {
      get: {
        tags: ["dashboard"],
        summary: "Dashboard financeiro e visao geral",
        security: bearerSecurity,
        parameters: [
          queryParameter("periodType", "Periodo relativo.", {
            type: "string",
            enum: ["month", "quarter", "semester", "year"],
          }),
          queryParameter("referenceDate", "Data de referencia ISO.", {
            type: "string",
            format: "date-time",
          }),
          queryParameter("startDate", "Data inicial ISO.", {
            type: "string",
            format: "date-time",
          }),
          queryParameter("endDate", "Data final ISO.", {
            type: "string",
            format: "date-time",
          }),
          queryParameter("asOfDate", "Ponto no tempo ISO.", {
            type: "string",
            format: "date-time",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/DashboardOverviewResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["dashboard.financial_view"],
      },
    },
    "/search": {
      get: {
        tags: ["search"],
        summary: "Busca global agrupada",
        security: bearerSecurity,
        parameters: [
          queryParameter("q", "Termo de busca obrigatorio.", {
            type: "string",
            minLength: 1,
          }),
          queryParameter("limit", "Limite maximo por grupo.", {
            type: "integer",
            minimum: 1,
            maximum: 20,
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/SearchResponse"),
          ...defaultErrorResponses,
        },
      },
    },
    "/operational-alerts": {
      get: {
        tags: ["operational-alerts"],
        summary: "Alertas operacionais",
        security: bearerSecurity,
        parameters: [
          queryParameter("staleDays", "Dias para marcar item como atrasado.", {
            type: "integer",
            minimum: 1,
            maximum: 365,
            default: 15,
          }),
          queryParameter("limit", "Limite maximo de alertas.", {
            type: "integer",
            minimum: 1,
            maximum: 200,
            default: 100,
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/OperationalAlertsResponse"),
          ...defaultErrorResponses,
        },
      },
    },
    "/exports/projects.xlsx": {
      get: {
        tags: ["exports"],
        summary: "Exportar projetos em XLSX",
        security: bearerSecurity,
        parameters: [
          queryParameter("code", "Codigo sequencial do projeto.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("status", "Status do projeto.", {
            type: "string",
            enum: ["PLANEJAMENTO", "EM_ANDAMENTO", "PAUSADO", "CONCLUIDO", "CANCELADO"],
          }),
          queryParameter("stage", "Etapa do workflow.", {
            type: "string",
            enum: [
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
            ],
          }),
          queryParameter("search", "Busca textual.", { type: "string" }),
          { $ref: "#/components/parameters/IncludeArchived" },
        ],
        responses: {
          "200": {
            description: "Planilha XLSX",
            content: binaryContent(
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
          },
          ...defaultErrorResponses,
        },
        "x-permissions": ["reports.export"],
      },
    },
    "/reports/projects/{id}/dossier": {
      get: {
        tags: ["reports"],
        summary: "Gerar dossie consolidado em JSON",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: {
          "200": {
            description: "Dossie consolidado do projeto.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          ...defaultErrorResponses,
        },
        "x-permissions": ["reports.export"],
      },
    },
    "/reports/projects/{id}/dossier.pdf": {
      get: {
        tags: ["reports"],
        summary: "Gerar dossie consolidado em PDF",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: {
          "200": { description: "Dossie PDF", content: binaryContent("application/pdf") },
          ...defaultErrorResponses,
        },
        "x-permissions": ["reports.export"],
      },
    },
    "/users": {
      get: {
        tags: ["users"],
        summary: "Listar usuarios",
        description:
          "Endpoint administrativo. Usa envelope paginado por padrao e `legacy` para compatibilidade. A busca textual atual cobre `name`, `email`, `rank` e `cpf`.",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          queryParameter("role", "Filtrar por perfil.", {
            type: "string",
            enum: ["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"],
          }),
          queryParameter("active", "Filtrar usuarios ativos.", {
            type: "boolean",
          }),
          queryParameter("search", "Busca textual por nome e email.", {
            type: "string",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/UserListEnvelope"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["users.manage"],
      },
      post: {
        tags: ["users"],
        summary: "Criar usuario administrativo",
        description:
          "Cria usuario com role inicial entre `PROJETISTA`, `GESTOR` e `CONSULTA`. A resposta atual nao inclui `rank` e `cpf`.",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/UserCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/UserSummary"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["users.manage"],
      },
    },
    "/users/{id}": {
      get: {
        tags: ["users"],
        summary: "Detalhar usuario",
        description: "Consulta administrativa de usuario por id. Somente ADMIN.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        responses: {
          "200": okJson("#/components/schemas/UserSummary"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["users.manage"],
      },
      patch: {
        tags: ["users"],
        summary: "Atualizar dados cadastrais de usuario",
        description: "Atualiza name, email, rank e cpf. Somente ADMIN.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/UserUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/UserSummary"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["users.manage"],
      },
    },
    "/users/{id}/status": {
      patch: {
        tags: ["users"],
        summary: "Atualizar status de usuario",
        description:
          "Ativa ou desativa usuario. Nao permite que o ADMIN autenticado desative a si mesmo quando isso deixaria o sistema sem ADMIN ativo.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/UserStatusUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/UserSummary"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["users.manage"],
      },
    },
    "/users/{id}/role": {
      patch: {
        tags: ["users"],
        summary: "Atualizar role de usuario",
        description:
          "Embora o schema aceite `rank` e `cpf`, o service atual persiste apenas a alteracao de `role` nesta rota.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/UserRoleUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/UserSummary"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["users.manage"],
      },
    },
    "/permissions/catalog": {
      get: {
        tags: ["permissions"],
        summary: "Listar catalogo administrativo de permissões",
        description:
          "Retorna o catalogo RBAC com metadados de UI, incluindo modulo, grupo, descricao, roles padrao e sinalizacao de permissao critica.",
        security: bearerSecurity,
        responses: {
          "200": okJson("#/components/schemas/PermissionCatalogResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["permissions.view"],
      },
    },
    "/permissions/roles/{role}": {
      get: {
        tags: ["permissions"],
        summary: "Consultar permissões base de uma role",
        description:
          "Expõe a base persistida da role e um espelho do catalogo com flag `assigned` para facilitar checklists no frontend.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/RoleName" }],
        responses: {
          "200": okJson("#/components/schemas/RolePermissionsResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["permissions.view"],
      },
      put: {
        tags: ["permissions"],
        summary: "Atualizar permissões base de uma role",
        description:
          "Substitui a base atual da role no banco. O backend bloqueia autoedicao da propria role e restringe alteracoes de permissoes criticas a ADMIN.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/RoleName" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/RolePermissionsRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/RolePermissionsResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["permissions.manage_role_permissions"],
      },
    },
    "/permissions/users/{id}": {
      get: {
        tags: ["permissions"],
        summary: "Consultar permissões efetivas de um usuário",
        description:
          "Retorna lado a lado a base da role, os overrides aplicados e o resultado efetivo final para montagem de telas administrativas.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        responses: {
          "200": okJson("#/components/schemas/UserPermissionsResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["permissions.view"],
      },
    },
    "/permissions/users/{id}/overrides": {
      get: {
        tags: ["permissions"],
        summary: "Listar overrides de permissões de um usuário",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        responses: {
          "200": okJson("#/components/schemas/UserPermissionOverridesResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["permissions.view"],
      },
    },
    "/permissions/users/{id}/overrides/allow": {
      post: {
        tags: ["permissions"],
        summary: "Aplicar override ALLOW para um usuário",
        description:
          "Aplica override ALLOW respeitando bloqueios de autoedicao, hierarquia e protecao extra para permissoes criticas.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/UserPermissionOverrideRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/UserPermissionOverrideMutationResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["permissions.manage_user_overrides"],
      },
    },
    "/permissions/users/{id}/overrides/deny": {
      post: {
        tags: ["permissions"],
        summary: "Aplicar override DENY para um usuário",
        description:
          "Aplica override DENY respeitando bloqueios de autoedicao, hierarquia e protecao extra para permissoes criticas.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/UserPermissionOverrideRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/UserPermissionOverrideMutationResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["permissions.manage_user_overrides"],
      },
    },
    "/permissions/users/{id}/overrides/{permissionCode}": {
      delete: {
        tags: ["permissions"],
        summary: "Remover override de permissão de um usuário",
        description:
          "Remove override existente respeitando bloqueios de autoedicao, hierarquia e protecao extra para permissoes criticas.",
        security: bearerSecurity,
        parameters: [
          { $ref: "#/components/parameters/UserId" },
          { $ref: "#/components/parameters/PermissionCode" },
        ],
        responses: {
          "200": okJson("#/components/schemas/UserPermissionOverrideMutationResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["permissions.manage_user_overrides"],
      },
    },
    "/atas": {
      get: {
        tags: ["atas"],
        summary: "Listar atas",
        description:
          "Catalogo autenticado de atas. Pode filtrar por grupo de cobertura e por localidades cobertas, o que o torna util para telas de selecao do fluxo de estimativas.",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          queryParameter("code", "Codigo sequencial da ata.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("type", "Tipo da ata.", {
            type: "string",
            enum: ["CFTV", "FIBRA_OPTICA"],
          }),
          queryParameter("groupCode", "Codigo do grupo de cobertura.", {
            type: "string",
          }),
          queryParameter("cityName", "Cidade do grupo de cobertura.", { type: "string" }),
          queryParameter("stateUf", "UF do grupo de cobertura.", {
            type: "string",
            enum: ["AM", "RO", "RR", "AC"],
          }),
          queryParameter("active", "Filtrar atas ativas.", { type: "boolean" }),
          queryParameter("search", "Busca textual.", { type: "string" }),
        ],
        responses: {
          "200": okJson("#/components/schemas/AtaListEnvelope"),
          ...defaultErrorResponses,
        },
      },
      post: {
        tags: ["atas"],
        summary: "Criar ata",
        description:
          "Cria a ata junto com a estrutura inicial de grupos de cobertura e localidades.",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/AtaCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/Ata"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["atas.manage"],
      },
    },
    "/integrations/compras-gov/atas/preview": {
      get: {
        tags: ["integrations"],
        summary: "Previsualizar importacao de ATA do Compras.gov.br",
        description:
          "Consulta a API publica do Compras.gov.br no backend e retorna uma previa normalizada da ARP e de seus itens. Usa os endpoints oficiais `/modulo-arp/1_consultarARP` e `/modulo-arp/2_consultarARPItem`.",
        security: bearerSecurity,
        parameters: [
          queryParameter("uasg", "Codigo da UASG gerenciadora.", { type: "string" }),
          queryParameter("numeroPregao", "Numero do pregao/compra.", {
            type: "string",
          }),
          queryParameter("anoPregao", "Ano do pregao/compra.", { type: "string" }),
          queryParameter("numeroAta", "Numero da ata de registro de preco.", {
            type: "string",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/ComprasGovAtaPreview"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["atas.manage"],
      },
    },
    "/integrations/compras-gov/atas/import": {
      post: {
        tags: ["integrations"],
        summary: "Importar ATA do Compras.gov.br",
        description:
          "Consulta a API publica do Compras.gov.br no backend e cria ou atualiza a ATA e seus itens sem duplicar registros. Nao altera movimentos de saldo local.",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/ComprasGovAtaImportRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/ComprasGovAtaImportResponse"),
          "200": okJson("#/components/schemas/ComprasGovAtaImportResponse"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["atas.manage"],
      },
    },
    "/atas/code/{code}": {
      get: {
        tags: ["atas"],
        summary: "Buscar ata por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaCode" }],
        responses: {
          "200": okJson("#/components/schemas/Ata"),
          ...defaultErrorResponses,
        },
      },
    },
    "/atas/{id}": {
      get: {
        tags: ["atas"],
        summary: "Detalhe da ata",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaId" }],
        responses: {
          "200": okJson("#/components/schemas/Ata"),
          ...defaultErrorResponses,
        },
      },
      patch: {
        tags: ["atas"],
        summary: "Atualizar ata",
        description:
          "Update parcial. Se `coverageGroups` for enviado, o backend atual substitui todos os grupos/localidades anteriores da ata.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/AtaUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/Ata"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["atas.manage"],
      },
      delete: {
        tags: ["atas"],
        summary: "Remover ata",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaId" }],
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "Ata removida"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["atas.manage"],
      },
    },
    "/atas/{id}/coverage-groups": {
      post: {
        tags: ["atas"],
        summary: "Criar grupo de cobertura da ata",
        description:
          "Cria um grupo de cobertura em uma ATA existente sem substituir os demais grupos.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/AtaCoverageGroup"),
        },
        responses: {
          "201": createdJson("#/components/schemas/AtaCoverageGroup"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["atas.manage"],
      },
    },
    "/atas/{id}/coverage-groups/{groupId}": {
      patch: {
        tags: ["atas"],
        summary: "Atualizar grupo de cobertura da ata",
        description:
          "Atualiza um grupo de cobertura especifico. Se `localities` for enviado, substitui apenas as localidades deste grupo.",
        security: bearerSecurity,
        parameters: [
          { $ref: "#/components/parameters/AtaId" },
          { $ref: "#/components/parameters/AtaCoverageGroupId" },
        ],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/AtaCoverageGroupUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/AtaCoverageGroup"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["atas.manage"],
      },
      delete: {
        tags: ["atas"],
        summary: "Remover grupo de cobertura da ata",
        description:
          "Remove o grupo de cobertura quando ele nao possui itens ou estimativas vinculadas.",
        security: bearerSecurity,
        parameters: [
          { $ref: "#/components/parameters/AtaId" },
          { $ref: "#/components/parameters/AtaCoverageGroupId" },
        ],
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "Grupo removido"),
          ...defaultErrorResponses,
        },
        "x-roles": ["ADMIN"],
        "x-permissions": ["atas.manage"],
      },
    },
    "/atas/{id}/items": {
      get: {
        tags: ["ata-items"],
        summary: "Listar itens de uma ata",
        description:
          "Lista itens filtrados no contexto de uma ata especifica. O filtro opcional `groupCode` ajuda a montar seletores em cascata no frontend.",
        security: bearerSecurity,
        parameters: [
          { $ref: "#/components/parameters/AtaId" },
          ...paginationParameters,
          queryParameter("code", "Codigo sequencial do item.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("groupCode", "Codigo do grupo de cobertura.", { type: "string" }),
          queryParameter("cityName", "Cidade da localidade do grupo.", { type: "string" }),
          queryParameter("stateUf", "UF da localidade do grupo.", {
            type: "string",
            enum: ["AM", "RO", "RR", "AC"],
          }),
          queryParameter("active", "Filtrar itens ativos.", { type: "boolean" }),
          queryParameter("search", "Busca em referencia, descricao e notas.", {
            type: "string",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/AtaItemsEnvelope"),
          ...defaultErrorResponses,
        },
      },
      post: {
        tags: ["ata-items"],
        summary: "Criar item em uma ata",
        description:
          "Cria item precificavel vinculado a um grupo de cobertura existente dentro da ata informada.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/AtaItemCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/AtaItem"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["atas.manage"],
      },
    },
    "/atas/{id}/external-balance": {
      get: {
        tags: ["atas"],
        summary: "Comparar saldo externo Compras.gov.br da ATA",
        description:
          "Consulta o saldo externo da ARP no Compras.gov.br por ATA, usando apenas `numeroAta` e `unidadeGerenciadora`, e casa os itens localmente por numero do item normalizado. Nao altera saldo local.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaId" }],
        responses: {
          "200": okJson("#/components/schemas/ComprasGovExternalBalanceComparison"),
          ...defaultErrorResponses,
        },
      },
    },
    "/atas/{id}/sync-external-balance": {
      post: {
        tags: ["atas"],
        summary: "Sincronizar snapshot externo de saldo Compras.gov.br",
        description:
          "Consulta e compara saldo externo por ATA, atualizando apenas timestamps/snapshot externo para itens encontrados. Nao altera movimentos nem saldo local.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaId" }],
        responses: {
          "200": okJson("#/components/schemas/ComprasGovExternalBalanceSyncResponse"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["atas.manage"],
      },
    },
    "/ata-items": {
      get: {
        tags: ["ata-items"],
        summary: "Listar itens de ata",
        description:
          "Listagem global de itens de catalogo. Permite filtrar por ata, grupo, localidade e status de ativacao.",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          queryParameter("code", "Codigo sequencial do item.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("ataCode", "Codigo da ata.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("groupCode", "Codigo do grupo de cobertura.", { type: "string" }),
          queryParameter("cityName", "Cidade da localidade do grupo.", { type: "string" }),
          queryParameter("stateUf", "UF da localidade do grupo.", {
            type: "string",
            enum: ["AM", "RO", "RR", "AC"],
          }),
          queryParameter("active", "Filtrar itens ativos.", { type: "boolean" }),
          queryParameter("search", "Busca em referencia, descricao e notas.", {
            type: "string",
          }),
        ],
        responses: {
          "200": okJson("#/components/schemas/AtaItemsEnvelope"),
          ...defaultErrorResponses,
        },
      },
    },
    "/ata-items/code/{code}": {
      get: {
        tags: ["ata-items"],
        summary: "Buscar item de ata por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaItemCode" }],
        responses: {
          "200": okJson("#/components/schemas/AtaItem"),
          ...defaultErrorResponses,
        },
      },
    },
    "/ata-items/{id}/movements": {
      get: {
        tags: ["ata-items"],
        summary: "Listar movimentacoes de saldo do item de ata",
        description:
          "Retorna o historico de movimentacoes de saldo do item, ordenado por criacao desc. Endpoint de consulta; nao altera regra de saldo nem fluxo documental.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaItemId" }],
        responses: {
          "200": okJson("#/components/schemas/AtaItemBalanceMovementsResponse"),
          ...defaultErrorResponses,
        },
      },
    },
    "/ata-items/{id}/balance-comparison": {
      get: {
        tags: ["ata-items"],
        summary: "Comparar saldo externo Compras.gov.br do item",
        description:
          "Retorna a comparacao entre o saldo local do item e o saldo externo do Compras.gov.br. Endpoint de consulta; nao altera saldo local.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaItemId" }],
        responses: {
          "200": okJson("#/components/schemas/ComprasGovExternalBalanceComparisonItem"),
          ...defaultErrorResponses,
        },
      },
    },
    "/ata-items/{id}": {
      get: {
        tags: ["ata-items"],
        summary: "Detalhe do item de ata",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaItemId" }],
        responses: {
          "200": okJson("#/components/schemas/AtaItem"),
          ...defaultErrorResponses,
        },
      },
      patch: {
        tags: ["ata-items"],
        summary: "Atualizar item de ata",
        description:
          "Update parcial. Se `coverageGroupCode` for enviado, ele deve existir na mesma ata do item atual.",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaItemId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/AtaItemUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/AtaItem"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["atas.manage"],
      },
      delete: {
        tags: ["ata-items"],
        summary: "Remover item de ata",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/AtaItemId" }],
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "Item removido"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["atas.manage"],
      },
    },
    "/military-organizations": {
      get: {
        tags: ["military-organizations"],
        summary: "Listar organizacoes militares",
        description:
          "Catalogo autenticado de OMs. No fluxo de estimativas, a localidade da OM e usada para validar compatibilidade com o grupo de cobertura da ATA.",
        security: bearerSecurity,
        parameters: [
          ...paginationParameters,
          queryParameter("code", "Codigo sequencial da OM.", {
            type: "integer",
            minimum: 1,
          }),
          queryParameter("sigla", "Filtrar por sigla.", { type: "string" }),
          queryParameter("cityName", "Filtrar por cidade.", { type: "string" }),
          queryParameter("stateUf", "Filtrar por UF.", {
            type: "string",
            enum: ["AM", "RO", "RR", "AC"],
          }),
          queryParameter("active", "Filtrar OMs ativas.", { type: "boolean" }),
          queryParameter("search", "Busca textual.", { type: "string" }),
        ],
        responses: {
          "200": okJson("#/components/schemas/MilitaryOrganizationListEnvelope"),
          ...defaultErrorResponses,
        },
      },
      post: {
        tags: ["military-organizations"],
        summary: "Criar organizacao militar",
        description: "Cria uma OM com `sigla` unica no catalogo.",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/MilitaryOrganizationCreateRequest"),
        },
        responses: {
          "201": createdJson("#/components/schemas/MilitaryOrganization"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["military_organizations.manage"],
      },
    },
    "/military-organizations/code/{code}": {
      get: {
        tags: ["military-organizations"],
        summary: "Buscar OM por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/MilitaryOrganizationCode" }],
        responses: {
          "200": okJson("#/components/schemas/MilitaryOrganization"),
          ...defaultErrorResponses,
        },
      },
      patch: {
        tags: ["military-organizations"],
        summary: "Atualizar OM por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/MilitaryOrganizationCode" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/MilitaryOrganizationUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/MilitaryOrganization"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["military_organizations.manage"],
      },
      delete: {
        tags: ["military-organizations"],
        summary: "Remover OM por codigo",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/MilitaryOrganizationCode" }],
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "OM removida"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["military_organizations.manage"],
      },
    },
    "/military-organizations/{id}": {
      get: {
        tags: ["military-organizations"],
        summary: "Detalhe da OM",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/MilitaryOrganizationId" }],
        responses: {
          "200": okJson("#/components/schemas/MilitaryOrganization"),
          ...defaultErrorResponses,
        },
      },
      patch: {
        tags: ["military-organizations"],
        summary: "Atualizar OM por id",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/MilitaryOrganizationId" }],
        requestBody: {
          required: true,
          content: jsonContent("#/components/schemas/MilitaryOrganizationUpdateRequest"),
        },
        responses: {
          "200": okJson("#/components/schemas/MilitaryOrganization"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["military_organizations.manage"],
      },
      delete: {
        tags: ["military-organizations"],
        summary: "Remover OM por id",
        security: bearerSecurity,
        parameters: [{ $ref: "#/components/parameters/MilitaryOrganizationId" }],
        responses: {
          "200": okJson("#/components/schemas/ErrorResponse", "OM removida"),
          ...defaultErrorResponses,
        },
        "x-permissions": ["military_organizations.manage"],
      },
    },
  },
};

export function buildOpenApiDocsHtml(specUrl: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SAGEP API Docs</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f1e8;
        --panel: #fffdf8;
        --line: #d7c8ad;
        --text: #1f2328;
        --muted: #6f6252;
        --accent: #005f73;
        --accent-soft: #d8ecef;
        --get: #2a9d8f;
        --post: #e76f51;
        --patch: #e9c46a;
        --delete: #d62828;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top right, rgba(0, 95, 115, 0.12), transparent 30%),
          linear-gradient(180deg, #efe6d3 0%, var(--bg) 35%, #f8f6f1 100%);
        color: var(--text);
      }
      header {
        padding: 32px 24px 20px;
        border-bottom: 1px solid rgba(31, 35, 40, 0.08);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 2rem;
      }
      p {
        margin: 0;
        color: var(--muted);
        max-width: 70ch;
      }
      main {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        gap: 24px;
        padding: 24px;
      }
      nav, section {
        background: rgba(255, 253, 248, 0.9);
        backdrop-filter: blur(4px);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 12px 32px rgba(79, 64, 46, 0.08);
      }
      nav {
        padding: 18px;
        position: sticky;
        top: 20px;
        max-height: calc(100vh - 40px);
        overflow: auto;
      }
      nav a {
        display: block;
        padding: 10px 12px;
        border-radius: 10px;
        color: var(--text);
        text-decoration: none;
      }
      nav a:hover {
        background: var(--accent-soft);
      }
      section {
        padding: 22px;
      }
      .hero {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin: 14px 0 20px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.92rem;
        font-weight: 600;
      }
      .route {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 16px;
        margin-bottom: 14px;
        background: var(--panel);
      }
      .route-head {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
      }
      .method {
        min-width: 74px;
        text-align: center;
        border-radius: 999px;
        padding: 6px 10px;
        color: white;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .method.get { background: var(--get); }
      .method.post { background: var(--post); }
      .method.patch { background: var(--patch); color: #5a3b00; }
      .method.delete { background: var(--delete); }
      code {
        font-family: "SFMono-Regular", Consolas, monospace;
        font-size: 0.92rem;
        white-space: pre-wrap;
      }
      .summary {
        font-weight: 700;
      }
      .route p {
        margin: 8px 0;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0;
      }
      .meta span {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 4px 10px;
        color: var(--muted);
        font-size: 0.84rem;
      }
      .block {
        margin-top: 12px;
      }
      .block strong {
        display: block;
        margin-bottom: 6px;
      }
      pre {
        margin: 0;
        padding: 14px;
        background: #f4efe4;
        border-radius: 12px;
        overflow: auto;
        border: 1px solid #e1d7c3;
      }
      .footer {
        margin-top: 20px;
        color: var(--muted);
      }
      @media (max-width: 960px) {
        main { grid-template-columns: 1fr; }
        nav { position: static; max-height: none; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>SAGEP OpenAPI</h1>
      <p>Especificacao formal da API atual. O Markdown continua como referencia narrativa, e esta pagina serve como indice navegavel dos contratos expostos pelo backend.</p>
    </header>
    <main>
      <nav>
        <strong>Modulos</strong>
        <div id="tag-nav"></div>
        <div class="footer">
          <a href="${specUrl}">Baixar openapi.json</a>
        </div>
      </nav>
      <section>
        <div class="hero">
          <span class="chip">JWT Bearer</span>
          <span class="chip">Listagens com envelope</span>
          <span class="chip">format=legacy quando aplicavel</span>
          <span class="chip">Arquivamento e restore</span>
        </div>
        <div id="content"></div>
      </section>
    </main>
    <script>
      const specUrl = ${JSON.stringify(specUrl)};
      const methodOrder = ["get", "post", "patch", "delete"];

      function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
      }

      function schemaPreview(operation) {
        const schema = operation.requestBody?.content?.["application/json"]?.schema;
        if (!schema) return null;
        return JSON.stringify(schema, null, 2);
      }

      function responsePreview(operation) {
        const response = operation.responses?.["200"] || operation.responses?.["201"];
        if (!response?.content) return null;
        const firstContent = Object.values(response.content)[0];
        return firstContent?.schema ? JSON.stringify(firstContent.schema, null, 2) : null;
      }

      fetch(specUrl)
        .then((res) => res.json())
        .then((spec) => {
          const tags = spec.tags || [];
          const paths = spec.paths || {};
          const content = document.getElementById("content");
          const nav = document.getElementById("tag-nav");

          for (const tag of tags) {
            const routes = [];
            for (const [path, operations] of Object.entries(paths)) {
              for (const method of methodOrder) {
                const operation = operations[method];
                if (operation?.tags?.includes(tag.name)) {
                  routes.push({ path, method, operation });
                }
              }
            }

            if (!routes.length) continue;

            const link = el("a", "", tag.name);
            link.href = "#" + tag.name;
            nav.appendChild(link);

            const wrapper = el("div");
            wrapper.id = tag.name;

            const title = el("h2", "", tag.name);
            wrapper.appendChild(title);

            if (tag.externalDocs?.url) {
              const doc = el("p", "", "Markdown complementar: " + tag.externalDocs.url);
              wrapper.appendChild(doc);
            }

            for (const route of routes) {
              const card = el("article", "route");
              const head = el("div", "route-head");
              const method = el("span", "method " + route.method, route.method.toUpperCase());
              head.appendChild(method);
              head.appendChild(el("code", "", route.path));
              card.appendChild(head);

              card.appendChild(el("div", "summary", route.operation.summary || route.path));

              if (route.operation.description) {
                card.appendChild(el("p", "", route.operation.description));
              }

              const meta = el("div", "meta");
              if (route.operation.security?.length) meta.appendChild(el("span", "", "Bearer JWT"));
              if (route.operation["x-permissions"]?.length) {
                meta.appendChild(el("span", "", "Permissoes: " + route.operation["x-permissions"].join(", ")));
              }
              const paramsCount = route.operation.parameters?.length || 0;
              if (paramsCount) meta.appendChild(el("span", "", paramsCount + " parametros"));
              card.appendChild(meta);

              const req = schemaPreview(route.operation);
              if (req) {
                const block = el("div", "block");
                block.appendChild(el("strong", "", "Request schema"));
                const pre = el("pre");
                pre.textContent = req;
                block.appendChild(pre);
                card.appendChild(block);
              }

              const res = responsePreview(route.operation);
              if (res) {
                const block = el("div", "block");
                block.appendChild(el("strong", "", "Response schema"));
                const pre = el("pre");
                pre.textContent = res;
                block.appendChild(pre);
                card.appendChild(block);
              }

              wrapper.appendChild(card);
            }

            content.appendChild(wrapper);
          }
        })
        .catch((error) => {
          const content = document.getElementById("content");
          content.textContent = "Falha ao carregar a especificacao: " + error.message;
        });
    </script>
  </body>
</html>`;
}
