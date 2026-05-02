import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openApiDocument } from "../docs/openapi.js";

const outputDir = resolve(process.cwd(), "docs/api/openapi");
const outputFile = resolve(outputDir, "openapi.json");

async function main() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, JSON.stringify(openApiDocument, null, 2) + "\n", "utf8");
  console.log(`OpenAPI exportado para ${outputFile}`);
}

main().catch((error) => {
  console.error("Falha ao exportar OpenAPI:", error);
  process.exit(1);
});
