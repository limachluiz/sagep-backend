import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("imagem Docker com Prisma offline", () => {
  it("usa o schema engine empacotado sem depender de download no startup", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");
    expect(dockerfile).toContain("PRISMA_SCHEMA_ENGINE_BINARY=/app/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x");
    expect(dockerfile).toContain("test -x /app/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x");
    expect(dockerfile).toContain("./node_modules/.bin/prisma migrate deploy && node dist/server.js");
    expect(dockerfile).not.toContain("CMD [\"sh\", \"-c\", \"npx prisma");
  });
});
