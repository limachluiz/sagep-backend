import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import {
  findUnresolvedMojibakeTokens,
  normalizeMojibakeText,
  REPLACEMENT_CHARACTER_DICTIONARY,
} from "../../shared/text-normalization.js";

type RuleInput = { damagedText: string; correctedText: string; isActive?: boolean };
type PreviewRule = { damagedText: string; correctedText: string };
type Actor = { id: string; name?: string | null; email?: string | null };
// O client local pode estar uma geração atrás da migration durante o build.
// Em runtime, o entrypoint executa `prisma generate` antes de iniciar a API.
const textCorrectionRule = (prisma as unknown as { textCorrectionRule: any }).textCorrectionRule;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildLiteralCorrectionPattern(value: string) {
  let pattern = "";
  for (let index = 0; index < value.length;) {
    const character = value[index];
    if (character === "�") {
      while (value[index] === "�" || /[\s\u00a0]/u.test(value[index] ?? "")) index += 1;
      pattern += "[\\s\\u00a0]*�+[\\s\\u00a0]*";
      continue;
    }
    if (/[\s\u00a0]/u.test(character)) {
      while (/[\s\u00a0]/u.test(value[index] ?? "")) index += 1;
      if (value[index] !== "�") pattern += "[\\s\\u00a0]+";
      continue;
    }
    pattern += escapeRegExp(character);
    index += 1;
  }
  return new RegExp(pattern, "giu");
}

function applyRule(text: string, rule: PreviewRule) {
  return text.replace(buildLiteralCorrectionPattern(rule.damagedText), () => rule.correctedText);
}

export function applyTextCorrectionRules(value: string, rules: PreviewRule[], previewRule?: PreviewRule) {
  let corrected = normalizeMojibakeText(value);
  for (const rule of rules) corrected = applyRule(corrected, rule);
  if (previewRule) corrected = applyRule(corrected, previewRule);
  return corrected;
}

export class TextCorrectionsService {
  async activeRules() {
    return textCorrectionRule.findMany({
      where: { isActive: true },
      orderBy: [{ damagedText: "asc" }],
    });
  }

  async correctText(value: string, previewRule?: PreviewRule) {
    return applyTextCorrectionRules(value, await this.activeRules(), previewRule);
  }

  async list() {
    const [rules, descriptions] = await Promise.all([
      textCorrectionRule.findMany({ orderBy: [{ damagedText: "asc" }] }),
      prisma.ataItem.findMany({ where: { deletedAt: null }, select: { description: true } }),
    ]);
    const occurrenceMap = new Map<string, number>();
    const activeRules = rules.filter((rule: { isActive: boolean }) => rule.isActive);
    for (const item of descriptions) {
      const corrected = applyTextCorrectionRules(item.description, activeRules);
      for (const token of findUnresolvedMojibakeTokens(corrected)) {
        occurrenceMap.set(token, (occurrenceMap.get(token) ?? 0) + 1);
      }
    }
    return {
      rules,
      builtInRuleCount: REPLACEMENT_CHARACTER_DICTIONARY.length,
      unresolvedTokens: [...occurrenceMap.entries()]
        .map(([token, occurrences]) => ({ token, occurrences }))
        .sort((left, right) => right.occurrences - left.occurrences || left.token.localeCompare(right.token, "pt-BR")),
    };
  }

  async create(input: RuleInput, actor?: Actor) {
    const duplicated = await textCorrectionRule.findFirst({
      where: { damagedText: { equals: input.damagedText.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicated) throw new AppError("Já existe uma correção para esse texto", 409);
    try {
      const created = await textCorrectionRule.create({
        data: {
          damagedText: input.damagedText.trim(),
          correctedText: input.correctedText.trim(),
          isActive: input.isActive ?? true,
        },
      });
      if (actor) await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: created.id, action: "CREATE", actor: { id: actor.id, name: actor.name ?? actor.email }, summary: `Regra de correção cadastrada: ${created.damagedText}`, after: created });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("Já existe uma correção para esse texto", 409);
      }
      throw error;
    }
  }

  async update(id: string, input: RuleInput, actor?: Actor) {
    const existing = await textCorrectionRule.findUnique({ where: { id } });
    if (!existing) throw new AppError("Regra de correção não encontrada", 404);
    const duplicated = await textCorrectionRule.findFirst({
      where: { id: { not: id }, damagedText: { equals: input.damagedText.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicated) throw new AppError("Já existe uma correção para esse texto", 409);
    try {
      const updated = await textCorrectionRule.update({
        where: { id },
        data: {
          damagedText: input.damagedText.trim(),
          correctedText: input.correctedText.trim(),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      });
      if (actor) await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: id, action: "UPDATE", actor: { id: actor.id, name: actor.name ?? actor.email }, summary: `Regra de correção atualizada: ${updated.damagedText}`, before: existing, after: updated });
      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("Já existe uma correção para esse texto", 409);
      }
      throw error;
    }
  }

  async remove(id: string, actor?: Actor) {
    const existing = await textCorrectionRule.findUnique({ where: { id } });
    if (!existing) throw new AppError("Regra de correção não encontrada", 404);
    await textCorrectionRule.delete({ where: { id } });
    if (actor) await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: id, action: "DELETE", actor: { id: actor.id, name: actor.name ?? actor.email }, summary: `Regra de correção excluída: ${existing.damagedText}`, before: existing });
    return { message: "Regra de correção excluída" };
  }

  async test(text: string, previewRule?: PreviewRule) {
    const correctedText = await this.correctText(text, previewRule);
    return {
      originalText: text,
      correctedText,
      changed: correctedText !== text,
      unresolvedTokens: findUnresolvedMojibakeTokens(correctedText),
    };
  }

  async apply(scope: { scope: "ATA"; ataId: string } | { scope: "CATALOG" }, actor?: Actor) {
    if (scope.scope === "ATA") {
      const ata = await prisma.ata.findUnique({ where: { id: scope.ataId }, select: { id: true } });
      if (!ata) throw new AppError("Ata não encontrada", 404);
    }
    const items = await prisma.ataItem.findMany({
      where: { deletedAt: null, ...(scope.scope === "ATA" && { ataId: scope.ataId }) },
      select: { id: true, description: true },
    });
    const activeRules = await this.activeRules();
    const correctedItems = items.map((item) => ({
      ...item,
      correctedDescription: applyTextCorrectionRules(item.description, activeRules),
    }));
    const changed = correctedItems.filter((item) => item.correctedDescription !== item.description);
    if (changed.length) {
      const editedAt = new Date();
      await prisma.$transaction(changed.map((item) => prisma.ataItem.update({
        where: { id: item.id },
        data: { description: item.correctedDescription, descriptionEditedAt: editedAt } as any,
      })));
    }
    const unresolvedTokens = [...new Set(correctedItems.flatMap((item) =>
      findUnresolvedMojibakeTokens(item.correctedDescription),
    ))];
    if (actor) await auditService.log({ entityType: "SYSTEM_SETTINGS", entityId: scope.scope === "ATA" ? scope.ataId : "text-corrections-catalog", action: "UPDATE", actor: { id: actor.id, name: actor.name ?? actor.email }, summary: `Dicionário aplicado em ${scope.scope === "ATA" ? "uma ATA" : "todo o catálogo"}`, metadata: { scope: scope.scope, total: items.length, corrected: changed.length, unresolvedTokens } });
    return { scope: scope.scope, total: items.length, corrected: changed.length, unresolvedTokens };
  }
}

export const textCorrectionsService = new TextCorrectionsService();
