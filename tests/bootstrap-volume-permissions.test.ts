import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("volume da chave de instalação", () => {
  it("é preparado pelo entrypoint antes da API perder privilégios", async () => {
    const entrypoint = await readFile("docker-entrypoint.sh", "utf8");
    expect(entrypoint).toContain('SAGEP_SETUP_TOKEN_FILE:-/app/bootstrap/setup-token');
    expect(entrypoint).toContain('install -d -o sagep -g sagep -m 0700 "$bootstrap_directory"');
    expect(entrypoint).toContain("chown -R sagep:sagep /app/bootstrap");
    expect(entrypoint.indexOf("chown -R sagep:sagep /app/bootstrap")).toBeLessThan(entrypoint.indexOf('exec gosu sagep "$@"'));
  });
});
