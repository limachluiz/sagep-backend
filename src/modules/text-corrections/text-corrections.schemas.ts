import { z } from "zod";

export const textCorrectionIdSchema = z.object({ id: z.string().cuid() });

export const saveTextCorrectionSchema = z.object({
  damagedText: z.string().trim().min(1).max(120),
  correctedText: z.string().trim().min(1).max(120),
  isActive: z.boolean().optional(),
}).refine((value) => value.damagedText !== value.correctedText, {
  message: "O texto original e a correção precisam ser diferentes",
  path: ["correctedText"],
});

export const testTextCorrectionSchema = z.object({
  text: z.string().min(1).max(10_000),
  damagedText: z.string().trim().min(1).max(120).optional(),
  correctedText: z.string().trim().min(1).max(120).optional(),
}).refine((value) => Boolean(value.damagedText) === Boolean(value.correctedText), {
  message: "Informe o texto corrompido e a correção em conjunto",
  path: ["correctedText"],
});

export const applyTextCorrectionsSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("ATA"), ataId: z.string().cuid() }),
  z.object({ scope: z.literal("CATALOG") }),
]);
