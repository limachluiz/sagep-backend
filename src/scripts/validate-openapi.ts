import { openApiDocument } from "../docs/openapi.js";

const requiredTags = [
  "auth",
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
  "atas",
  "military-organizations",
];

const requiredPaths = [
  "/auth/login",
  "/projects",
  "/tasks",
  "/estimates",
  "/diex",
  "/service-orders",
  "/dashboard/operational",
  "/search",
  "/operational-alerts",
  "/exports/projects.xlsx",
  "/reports/projects/{id}/dossier",
  "/users",
  "/atas",
  "/military-organizations",
];

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveLocalRef(value: unknown): Record<string, unknown> {
  const candidate = value as Record<string, unknown>;
  const ref = candidate?.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return candidate;

  return ref
    .slice(2)
    .split("/")
    .reduce<unknown>((current, segment) => {
      return (current as Record<string, unknown>)?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
    }, openApiDocument) as Record<string, unknown>;
}

function main() {
  assert(openApiDocument.openapi === "3.1.0", "Versao OpenAPI ausente ou invalida");

  const info = openApiDocument.info as Record<string, unknown> | undefined;
  assert(info?.title, "Campo info.title ausente");
  assert(info?.version, "Campo info.version ausente");

  const tags = ((openApiDocument.tags as Array<{ name?: string }> | undefined) ?? []).map(
    (tag) => tag.name,
  );
  for (const tag of requiredTags) {
    assert(tags.includes(tag), `Tag obrigatoria ausente: ${tag}`);
  }

  const paths = (openApiDocument.paths as Record<string, unknown> | undefined) ?? {};
  for (const path of requiredPaths) {
    assert(path in paths, `Path obrigatorio ausente: ${path}`);
  }

  const components = openApiDocument.components as Record<string, unknown> | undefined;
  const securitySchemes = components?.securitySchemes as Record<string, unknown> | undefined;
  assert(securitySchemes?.bearerAuth, "Security scheme bearerAuth ausente");

  const operationIds = new Set<string>();
  let operationCount = 0;
  const httpMethods = new Set(["get", "post", "put", "patch", "delete"]);

  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = rawPathItem as Record<string, unknown>;

    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method)) {
        continue;
      }

      operationCount += 1;
      const operation = rawOperation as Record<string, unknown>;
      const operationId = operation.operationId;
      assert(
        typeof operationId === "string" && operationId.length > 0,
        `operationId ausente em ${method.toUpperCase()} ${path}`,
      );
      assert(
        !operationIds.has(operationId as string),
        `operationId duplicado: ${operationId as string}`,
      );
      operationIds.add(operationId as string);

      const responses = operation.responses as Record<string, unknown> | undefined;
      assert(responses && Object.keys(responses).length > 0, `responses ausente em ${method.toUpperCase()} ${path}`);
      assert(
        Object.keys(responses ?? {}).some((status) => /^2\d\d$/.test(status)),
        `resposta de sucesso 2xx ausente em ${method.toUpperCase()} ${path}`,
      );

      for (const [status, rawResponse] of Object.entries(responses ?? {})) {
        const response = rawResponse as Record<string, unknown>;
        if ("$ref" in response || status === "204") continue;

        const content = response.content as Record<string, unknown> | undefined;
        assert(
          content && Object.keys(content).length > 0,
          `content ausente na resposta ${status} de ${method.toUpperCase()} ${path}`,
        );

        for (const [mediaType, rawMedia] of Object.entries(content ?? {})) {
          const media = rawMedia as Record<string, unknown>;
          assert(
            media.schema,
            `schema ausente em ${status} ${method.toUpperCase()} ${path} (${mediaType})`,
          );
        }
      }

      const pathParameters = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      const parameters = [
        ...(((pathItem.parameters as unknown[]) ?? [])),
        ...(((operation.parameters as unknown[]) ?? [])),
      ];
      for (const pathParameter of pathParameters) {
        const isDeclared = parameters.some((rawParameter) => {
          const parameter = resolveLocalRef(rawParameter);
          return parameter.in === "path" && parameter.name === pathParameter && parameter.required === true;
        });
        assert(
          isDeclared,
          `parametro de path {${pathParameter}} ausente ou opcional em ${method.toUpperCase()} ${path}`,
        );
      }
    }
  }

  JSON.stringify(openApiDocument);

  console.log(
    `OpenAPI validado com ${Object.keys(paths).length} paths, ${operationCount} operacoes e ${tags.length} tags.`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? `Falha na validacao OpenAPI: ${error.message}` : error,
  );
  process.exit(1);
}
