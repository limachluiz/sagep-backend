import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("recarga automática do proxy HTTPS", () => {
  it("mantém a administração do Caddy local e observa o material TLS", async () => {
    const [caddyfile, compose, watcher] = await Promise.all([
      readFile("Caddyfile", "utf8"),
      readFile("docker-compose.yml", "utf8"),
      readFile("caddy-watch-certificates.sh", "utf8"),
    ]);
    expect(caddyfile).toContain("admin localhost:2019");
    expect(compose).toContain("CERTIFICATE_PROXY_AUTO_RELOAD: \"true\"");
    expect(compose).toContain("/etc/caddy/watch-certificates.sh:ro");
    expect(compose).not.toMatch(/ports:[\s\S]{0,160}2019:2019/);
    expect(watcher).toContain("sha256sum");
    expect(watcher).toContain("caddy reload");
  });
});
