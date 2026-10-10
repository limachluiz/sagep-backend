import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import tar from "tar-stream";
import { afterEach, describe, expect, it } from "vitest";

import { safeEvidencePath, scanEvidenceArchive } from "../src/modules/backups/evidence-restore.service.js";

const temporaryDirectories: string[] = [];

async function maliciousArchive(header: tar.Headers, body?: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "sagep-evidence-test-"));
  temporaryDirectories.push(directory);
  const archive = path.join(directory, "evidence.tar.gz");
  const pack = tar.pack();
  const writing = pipeline(pack, createGzip(), createWriteStream(archive));
  pack.entry(header, body, (error) => error ? pack.destroy(error) : pack.finalize());
  await writing;
  return archive;
}

describe("restauração física de evidências", () => {
  afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
  it.each(["../segredo", "projeto/../../segredo", "/etc/passwd", "C:\\Windows\\system.ini", "pasta\\..\\segredo", "arquivo\0.txt"])("bloqueia caminho inseguro %s", (value) => {
    expect(safeEvidencePath(value)).toBeNull();
  });

  it("normaliza somente caminhos relativos seguros", () => {
    expect(safeEvidencePath("./projeto/evidencia.pdf")).toBe("projeto/evidencia.pdf");
  });

  it("rejeita links simbólicos no conteúdo do tar", async () => {
    const archive = await maliciousArchive({ name: "atalho", type: "symlink", linkname: "../../etc/passwd" });
    await expect(scanEvidenceArchive(archive)).rejects.toMatchObject({ code: "EVIDENCE_UNSAFE_ENTRY" });
  });

  it("rejeita path traversal mesmo dentro de arquivo compactado", async () => {
    const archive = await maliciousArchive({ name: "../../fora.txt", type: "file" }, "segredo");
    await expect(scanEvidenceArchive(archive)).rejects.toMatchObject({ code: "EVIDENCE_PATH_TRAVERSAL" });
  });
});
