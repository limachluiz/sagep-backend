import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("imagem Docker com Prisma offline", () => {
  it("usa o schema engine empacotado sem depender de download no startup", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");
    expect(dockerfile).toContain("/app/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x");
    expect(dockerfile).toContain("COPY --from=build --chown=sagep:sagep /opt/prisma/schema-engine /opt/prisma/schema-engine");
    expect(dockerfile).toContain("PRISMA_SCHEMA_ENGINE_BINARY=/opt/prisma/schema-engine");
    expect(dockerfile).toContain("test -x /opt/prisma/schema-engine");
    expect(dockerfile).toContain("./node_modules/.bin/prisma migrate deploy && node dist/server.js");
    expect(dockerfile).not.toContain("CMD [\"sh\", \"-c\", \"npx prisma");
  });
});
