import puppeteer, { type Browser, type PDFOptions } from "puppeteer";
import { env } from "../config/env.js";

type PdfRenderOptions = {
  label: string;
  buildHtml: () => Promise<string>;
  pdfOptions: PDFOptions;
};

class PdfService {
  private browserPromise: Promise<Browser> | null = null;

  private now() {
    return performance.now();
  }

  private elapsed(startedAt: number) {
    return Math.round(this.now() - startedAt);
  }

  private log(label: string, step: string, startedAt: number) {
    console.info("pdf generation timing", {
      label,
      step,
      durationMs: this.elapsed(startedAt),
    });
  }

  private shouldMockPdf() {
    return env.NODE_ENV === "test" && process.env.PDF_RENDER_MODE !== "real";
  }

  private buildMockPdf() {
    const body = "SAGEP PDF test placeholder\n".repeat(80);
    return Buffer.from(
      `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${body.length} >>
stream
${body}
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`,
    );
  }

  private async withTimeout<T>(label: string, step: string, operation: Promise<T>) {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Timeout ao executar ${step} para PDF ${label}`));
      }, env.PDF_TIMEOUT_MS);
    });

    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async getBrowser(label: string) {
    if (this.browserPromise) return this.browserPromise;

    const startedAt = this.now();
    this.browserPromise = puppeteer
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        timeout: env.PDF_TIMEOUT_MS,
      })
      .then((browser) => {
        this.log(label, "open-browser", startedAt);
        browser.on("disconnected", () => {
          this.browserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        this.browserPromise = null;
        throw error;
      });

    return this.browserPromise;
  }

  async renderPdf({ label, buildHtml, pdfOptions }: PdfRenderOptions) {
    const totalStartedAt = this.now();

    const htmlStartedAt = this.now();
    const html = await this.withTimeout(label, "montar HTML", buildHtml());
    this.log(label, "build-html", htmlStartedAt);

    if (this.shouldMockPdf()) {
      const mockStartedAt = this.now();
      const pdf = this.buildMockPdf();
      this.log(label, "mock-pdf", mockStartedAt);
      this.log(label, "total", totalStartedAt);
      return pdf;
    }

    const browser = await this.withTimeout(label, "abrir browser", this.getBrowser(label));
    const page = await this.withTimeout(label, "criar pagina", browser.newPage());

    try {
      page.setDefaultTimeout(env.PDF_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(env.PDF_TIMEOUT_MS);

      const setContentStartedAt = this.now();
      await this.withTimeout(
        label,
        "setContent",
        page.setContent(html, {
          waitUntil: "domcontentloaded",
          timeout: env.PDF_TIMEOUT_MS,
        }),
      );
      this.log(label, "set-content", setContentStartedAt);

      const pdfStartedAt = this.now();
      const pdf = await this.withTimeout(label, "gerar PDF", page.pdf(pdfOptions));
      this.log(label, "pdf", pdfStartedAt);
      this.log(label, "total", totalStartedAt);

      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async closeBrowser() {
    const browser = await this.browserPromise?.catch(() => null);
    this.browserPromise = null;
    await browser?.close().catch(() => undefined);
  }
}

export const pdfService = new PdfService();
