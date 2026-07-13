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
