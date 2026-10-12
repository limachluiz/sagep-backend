import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/app-error.js";

const signatureSchema = z.object({
  fieldName: z.string(), signerName: z.string(), issuerName: z.string(), certificateSha256: z.string().regex(/^[a-f0-9]{64}$/),
  certificateNotBefore: z.string(), certificateNotAfter: z.string(), claimedSigningTime: z.string().nullable(),
  status: z.enum(["VALID", "INVALID", "INDETERMINATE"]), intact: z.boolean().nullable(), cryptographicallyValid: z.boolean().nullable(),
  trusted: z.boolean(), revoked: z.boolean().nullable(), coversCurrentDocument: z.boolean(), modificationsAllowed: z.boolean().nullable(),
  coverage: z.string().optional(), diagnostic: z.string().optional(),
});
const resultSchema = z.object({ validator: z.string(), validatedAt: z.string(), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(["VALID", "INVALID", "INDETERMINATE", "NOT_SIGNED"]), scope: z.literal("LOCAL_CRYPTOGRAPHIC_CHECK"), networkFetching: z.literal(false), signatures: z.array(signatureSchema).max(20), warnings: z.array(z.string()) });
export type PdfValidationResult = z.infer<typeof resultSchema>;
let activeValidations = 0;

export function validatePdfSignatures(buffer: Buffer): Promise<PdfValidationResult> {
  if (activeValidations >= 2) return Promise.reject(new AppError("Outra validação documental está em andamento. Tente novamente em instantes", 429, "PDF_VALIDATION_BUSY"));
  activeValidations++;
  return new Promise<PdfValidationResult>((resolve, reject) => {
    const child = spawn(env.PDF_VALIDATION_PYTHON, [path.resolve("scripts/signature-validation/validate_pdf.py"), env.PDF_VALIDATION_TRUST_DIRECTORY], { shell: false, stdio: ["pipe", "pipe", "ignore"] });
    const chunks: Buffer[] = []; let size = 0;
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new AppError("A validação criptográfica excedeu o tempo permitido", 503, "PDF_VALIDATION_TIMEOUT")); }, env.PDF_VALIDATION_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 256 * 1024) child.kill("SIGKILL"); else chunks.push(chunk); });
    child.stdin.on("error", () => {});
    child.on("error", () => reject(new AppError("Validador local de assinatura indisponível no servidor", 503, "PDF_VALIDATOR_UNAVAILABLE")));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new AppError("Não foi possível analisar o PDF ou a configuração de confiança", 422, "PDF_VALIDATION_FAILED"));
      try { resolve(resultSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")))); }
      catch { reject(new AppError("O validador retornou um resultado incompatível", 502, "PDF_VALIDATION_FAILED")); }
    });
    child.stdin.end(buffer);
  }).finally(() => { activeValidations--; });
}
