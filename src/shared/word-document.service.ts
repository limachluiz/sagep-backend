import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { load } from "cheerio";
import { wordFromHtml } from "./word-html.js";
import { AppError } from "./app-error.js";

const execute = promisify(execFile);

/** Produces a native Word 97–2003 document, including rasterized PDF annexes. */
export async function renderWordDocument(html: string, annexes: Array<{ label: string; buffer: Buffer }> = []) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sagep-word-"));
  try {
    const $ = load(html);
    // Word's HTML importer supports tables rather than CSS grid for these fields.
    const header = $(".institutional-header");
    const parts = header.children().toArray().map((element) => $(element).html() ?? "");
    header.replaceWith(`<table class="word-header"><tr><td width="15%">${parts[0] ?? ""}</td><td width="70%">${parts[1] ?? ""}</td><td width="15%">${parts[2] ?? ""}</td></tr></table>`);
    $(".grid").each((_, grid) => {
      const fields = $(grid).children().toArray();
      const rows: string[] = [];
      for (let index = 0; index < fields.length; index += 2) {
        rows.push(`<tr><td width="50%">${$(fields[index]).html()}</td><td width="50%">${fields[index + 1] ? $(fields[index + 1]).html() : ""}</td></tr>`);
      }
      $(grid).replaceWith(`<table class="word-fields">${rows.join("")}</table>`);
    });
    $("head").append('<style>.word-header{border:0;width:100%;text-align:center}.word-header td{border:0;text-align:center}.word-header img{width:48px;height:auto}.word-fields{width:100%}.word-fields span{display:block;font-size:9pt;color:#66705f}.evidence img{width:600px;height:auto}.word-annex{page-break-before:always}.word-annex img{width:600px;height:auto}.signature{margin-top:32px;text-align:center}</style>');
    let imageIndex = 0;
    for (const element of $("img").toArray()) {
      const img = $(element);
      const match = img.attr("src")?.match(/^data:image\/(png|jpeg|jpg|webp);base64,([\s\S]+)$/);
      if (!match) continue;
      const imagePath = path.join(directory, `image-${imageIndex++}.${match[1] === "jpeg" ? "jpg" : match[1]}`);
      await writeFile(imagePath, Buffer.from(match[2], "base64"));
      img.attr("src", pathToFileURL(imagePath).href);
      img.attr("width", img.closest(".word-header").length ? "48" : "600");
    }
    for (let index = 0; index < annexes.length; index++) {
      const annex = annexes[index];
      const input = path.join(directory, `annex-${index}.pdf`);
      const prefix = path.join(directory, `annex-${index}-page`);
      await writeFile(input, annex.buffer);
      try {
        await execute("pdftoppm", ["-png", "-r", "110", input, prefix], { timeout: 120_000, maxBuffer: 1024 * 1024 });
      } catch {
        throw new AppError(`Não foi possível incorporar o anexo “${annex.label}” ao Word. Verifique o arquivo PDF.`, 422, "DELIVERY_WORD_ANNEX_INVALID");
      }
      const pages = (await readdir(directory)).filter((name) => name.startsWith(`annex-${index}-page-`) && name.endsWith(".png")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (!pages.length) throw new AppError(`O anexo “${annex.label}” não contém páginas legíveis.`, 422);
      for (let page = 0; page < pages.length; page++) {
        const section = $('<section class="word-annex"></section>');
        if (page === 0) section.append($("<h2></h2>").text(`Anexo ${index + 1} — ${annex.label}`));
        section.append($("<img>").attr({ src: pathToFileURL(path.join(directory, pages[page])).href, width: "600", alt: annex.label }));
        $("body").append(section);
      }
    }
    const input = path.join(directory, "delivery.docx");
    await writeFile(input, await wordFromHtml($.html()));
    try {
      await execute("soffice", [`-env:UserInstallation=${pathToFileURL(path.join(directory, "profile")).href}`, "--headless", "--convert-to", "doc:MS Word 97", "--outdir", directory, input], { timeout: 120_000, maxBuffer: 1024 * 1024 });
      const document = await readFile(path.join(directory, "delivery.doc"));
      if (document.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") throw new Error("Invalid Word document");
      return document;
    } catch {
      throw new AppError("Não foi possível gerar o Word. Verifique se o conversor de documentos está disponível no servidor.", 503, "DELIVERY_WORD_CONVERSION_UNAVAILABLE");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
