import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import type { AnyNode } from "domhandler";
import sharp from "sharp";
import { AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

/** Builds an editable Word intermediate with embedded, portable image data. */
export async function wordFromHtml(html: string) {
  const $ = load(html);
  async function inline(node: AnyNode, bold = false): Promise<Array<TextRun | ImageRun>> {
    if (node.type === "text") return [new TextRun({ text: node.data, bold })];
    if (!("tagName" in node)) return [];
    if (node.tagName === "br") return [new TextRun({ break: 1 })];
    if (node.tagName === "img") {
      const src = $(node).attr("src") ?? "";
      if (!src.startsWith("file:")) return [];
      const { data, info } = await sharp(await readFile(fileURLToPath(src))).rotate().png().toBuffer({ resolveWithObject: true });
      const header = $(node).closest(".word-header").length > 0;
      const maxWidth = header ? 48 : 510;
      const maxHeight = header ? 64 : $(node).closest(".word-annex").length ? 650 : 440;
      const ratio = Math.min(maxWidth / info.width, maxHeight / info.height, 1);
      return [new ImageRun({ type: "png", data, transformation: { width: Math.round(info.width * ratio), height: Math.round(info.height * ratio) } })];
    }
    const runs: Array<TextRun | ImageRun> = [];
    for (const child of node.children) runs.push(...await inline(child, bold || ["b", "strong", "th"].includes(node.tagName)));
    return runs;
  }
  async function blocks(node: AnyNode): Promise<Array<Paragraph | Table>> {
    if (node.type === "text") return node.data.trim() ? [new Paragraph({ children: await inline(node) })] : [];
    if (!("tagName" in node) || ["style", "script", "head"].includes(node.tagName)) return [];
    const tag = node.tagName;
    if (tag === "table") {
      const header = $(node).hasClass("word-header");
      const border = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
      const rows: TableRow[] = [];
      for (const tr of $(node).find("tr").toArray()) {
        const cells: TableCell[] = [];
        for (const td of $(tr).children("td,th").toArray()) {
          const children: Array<Paragraph | Table> = [];
          for (const child of td.children) children.push(...await blocks(child));
          cells.push(new TableCell({ children: children.length ? children : [new Paragraph("")], width: { size: Number.parseInt($(td).attr("width") ?? "0") || 100 / $(tr).children().length, type: WidthType.PERCENTAGE }, shading: td.tagName === "th" ? { fill: "EEF2E8" } : undefined }));
        }
        if (cells.length) rows.push(new TableRow({ children: cells, tableHeader: $(tr).find("th").length > 0 }));
      }
      return rows.length ? [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: header ? { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border } : undefined }), new Paragraph("")] : [];
    }
    if ($(node).hasClass("signature")) return [new Paragraph({ children: await inline(node), alignment: AlignmentType.CENTER, spacing: { before: 480, after: 180 } })];
    if (["p", "h1", "h2", "h3", "img", "li", "span", "b", "strong", "small"].includes(tag)) {
      return [new Paragraph({ children: await inline(node), heading: tag === "h1" ? HeadingLevel.HEADING_1 : tag === "h2" ? HeadingLevel.HEADING_2 : tag === "h3" ? HeadingLevel.HEADING_3 : undefined, spacing: { after: tag.startsWith("h") ? 180 : 100 }, keepNext: tag.startsWith("h"), alignment: $(node).closest(".word-header,.signature,.report-heading,.annex-cover").length ? AlignmentType.CENTER : undefined })];
    }
    const output: Array<Paragraph | Table> = [];
    if ($(node).hasClass("word-annex") || $(node).hasClass("annex-cover")) output.push(new Paragraph({ pageBreakBefore: true }));
    for (const child of node.children) output.push(...await blocks(child));
    return output;
  }
  const children: Array<Paragraph | Table> = [];
  for (const node of $("body").contents().toArray()) children.push(...await blocks(node));
  return Packer.toBuffer(new Document({ creator: "SAGEP", title: "Relatório Técnico de Conclusão e Entrega", styles: { default: { document: { run: { font: "Arial", size: 21 } } }, paragraphStyles: [{ id: "Heading1", name: "Heading 1", basedOn: "Normal", run: { font: "Arial", size: 28, bold: true, color: "405522" } }, { id: "Heading2", name: "Heading 2", basedOn: "Normal", run: { font: "Arial", size: 24, bold: true, color: "405522" } }, { id: "Heading3", name: "Heading 3", basedOn: "Normal", run: { font: "Arial", size: 22, bold: true, color: "405522" } }] }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 850, right: 850, bottom: 1000, left: 850 } } }, children }] }));
}
