import { Router } from "express";
import { buildOpenApiDocsHtml, openApiDocument } from "../../docs/openapi.js";

export const openApiRoutes = Router();

openApiRoutes.get("/", (_req, res) => {
  res.type("html").send(buildOpenApiDocsHtml("/api/docs/openapi.json"));
});

openApiRoutes.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});
