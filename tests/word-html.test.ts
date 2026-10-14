import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { wordFromHtml } from "../src/shared/word-html.js";

describe("Word portátil da entrega técnica", () => {
  it("incorpora fotos e páginas de anexos sem dependência dos arquivos temporários", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "sagep-word-test-"));
    try {
      const file = path.join(directory, "evidence.webp");
      await writeFile(file, await sharp({ create: { width: 40, height: 80, channels: 3, background: "green" } }).webp().toBuffer());
      const buffer = await wordFromHtml(`<html><body><h1>Entrega técnica</h1><p>Descrição &amp; revisão</p><section class="word-annex"><h2>Anexo 1</h2><img src="${pathToFileURL(file).href}"></section></body></html>`);
      await rm(directory, { recursive: true, force: true });
      const zip = await JSZip.loadAsync(buffer);
      const xml = await zip.file("word/document.xml")!.async("string");
      expect(xml).toContain("Descrição &amp; revisão");
      expect(xml).toContain("Anexo 1");
      expect(xml).not.toContain("file:");
      expect(xml).toContain("pageBreakBefore");
      const images = Object.keys(zip.files).filter((name) => name.startsWith("word/media/") && name.endsWith(".png"));
      expect(images).toHaveLength(1);
      expect((await zip.file(images[0])!.async("nodebuffer")).subarray(1, 4).toString()).toBe("PNG");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("mantém itens e quantidades em tabelas editáveis", async () => {
    const buffer = await wordFromHtml('<html><body><table><tr><th>Item</th><th>Qtd.</th></tr><tr><td>Câmera IP</td><td>4</td></tr></table></body></html>');
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("Câmera IP");
    expect(xml).toContain(">4</w:t>");
  });
});
