import portugueseWords from "an-array-of-portuguese-words" with { type: "json" };

import { findUnresolvedMojibakeTokens, normalizeMojibakeText } from "./text-normalization.js";

export type DescriptionCorrectionConfidence = "HIGH" | "MEDIUM" | "LOW";
export type DescriptionCorrectionStatus = "OK" | "AUTO_CORRECTED" | "NEEDS_REVIEW" | "MANUALLY_REVIEWED";

export type DescriptionCorrectionDecision = {
  damagedText: string;
  correctedText: string | null;
  alternatives: string[];
  confidence: DescriptionCorrectionConfidence;
  source: "STRUCTURAL" | "LEXICON" | "TECHNICAL";
  applied: boolean;
};

export type DescriptionCorrectionResult = {
  originalText: string;
  automaticText: string;
  status: DescriptionCorrectionStatus;
  confidence: number;
  decisions: DescriptionCorrectionDecision[];
  unresolvedTokens: string[];
};

const TECHNICAL_WORDS = [
  "acopladores", "acessórios", "aéreo", "câmera", "cabeamento", "características",
  "certificação", "conectores", "conexão", "destrutível", "distribuição", "eletroduto",
  "fibra", "fibras", "fixação", "fusão", "identificação", "infraestrutura", "instalação",
  "distância", "elétrica", "elétrico", "eletrônica", "eletrônico", "lançamento", "lógico",
  "máxima", "máximo", "metálica", "método", "micrômetro", "micrômetros", "monomodo",
  "necessária", "óptica", "ópticas", "referência", "região", "serviço", "subterrâneo",
  "terminação", "tubulação",
];

const portugueseLexicon = new Set<string>(
  (portugueseWords as string[]).map((word) => word.normalize("NFC").toLocaleLowerCase("pt-BR")),
);
const technicalLexicon = new Set(TECHNICAL_WORDS);
for (const word of TECHNICAL_WORDS) portugueseLexicon.add(word);

const SINGLE_REPLACEMENTS = [
  "á", "à", "â", "ã", "é", "ê", "í", "ó", "ô", "õ", "ú", "ü", "ç",
  "a", "e", "i", "o", "u", "c", "n", "",
];
const MULTI_REPLACEMENTS = ["çã", "çõ", ...SINGLE_REPLACEMENTS];

function preserveCase(source: string, replacement: string) {
  const letters = source.replace(/[^\p{L}]/gu, "");
  if (letters && letters === letters.toLocaleUpperCase("pt-BR")) return replacement.toLocaleUpperCase("pt-BR");
  if (letters[0] && letters[0] === letters[0].toLocaleUpperCase("pt-BR")) {
    return replacement[0]?.toLocaleUpperCase("pt-BR") + replacement.slice(1);
  }
  return replacement;
}

function candidateWords(damaged: string) {
  const runs = [...damaged.matchAll(/�+/g)];
  if (!runs.length || runs.length > 3) return [];

  let candidates = [damaged];
  for (const run of runs) {
    const replacements = run[0].length > 1 ? MULTI_REPLACEMENTS : SINGLE_REPLACEMENTS;
    const next: string[] = [];
    for (const candidate of candidates) {
      const position = candidate.indexOf("�");
      const length = candidate.slice(position).match(/^�+/)?.[0].length ?? 1;
      for (const replacement of replacements) {
        next.push(candidate.slice(0, position) + replacement + candidate.slice(position + length));
      }
    }
    candidates = next.slice(0, 2000);
  }

  return [...new Set(candidates
    .map((candidate) => candidate.normalize("NFC").toLocaleLowerCase("pt-BR"))
    .filter((candidate) => candidate.length >= 2 && portugueseLexicon.has(candidate)))];
}

function chooseCandidate(damaged: string) {
  const candidates = candidateWords(damaged);
  if (!candidates.length) return null;
  const technical = candidates.filter((candidate) => technicalLexicon.has(candidate));
  const accented = candidates.filter((candidate) => candidate.normalize("NFD").replace(/[\u0300-\u036f]/g, "") !== candidate || candidate.includes("ç"));
  const ranked = technical.length ? technical : accented.length ? accented : candidates;
  const selected = ranked[0];
  const highConfidence = technical.length === 1 || ranked.length === 1;
  return {
    selected,
    alternatives: ranked.slice(0, 5),
    confidence: highConfidence ? "HIGH" as const : "LOW" as const,
    source: technical.length ? "TECHNICAL" as const : "LEXICON" as const,
  };
}

type WordToken = { text: string; start: number; end: number };

function wordTokens(text: string): WordToken[] {
  return [...text.matchAll(/[\p{L}\d�-]+/gu)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function lexicalRepair(value: string) {
  const tokens = wordTokens(value);
  const decisions: DescriptionCorrectionDecision[] = [];
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  tokens.forEach((token, index) => {
    if (!token.text.includes("�")) return;
    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    const variants = [{ damaged: token.text, start: token.start, end: token.end, structural: false }];

    if (previous && previous.text.length <= 3 && /^\s+$/u.test(value.slice(previous.end, token.start))) {
      variants.push({ damaged: previous.text + token.text, start: previous.start, end: token.end, structural: true });
    }
    if (next && next.text.length <= 3 && /^\s+$/u.test(value.slice(token.end, next.start))) {
      variants.push({ damaged: token.text + next.text, start: token.start, end: next.end, structural: true });
    }
    if (previous && next && previous.text.length <= 3 && next.text.length <= 3 &&
      /^\s+$/u.test(value.slice(previous.end, token.start)) && /^\s+$/u.test(value.slice(token.end, next.start))) {
      variants.push({ damaged: previous.text + token.text + next.text, start: previous.start, end: next.end, structural: true });
    }

    const evaluated = variants
      .map((variant) => ({ variant, result: chooseCandidate(variant.damaged) }))
      .filter((entry): entry is typeof entry & { result: NonNullable<typeof entry.result> } => Boolean(entry.result))
      .sort((left, right) => {
        const confidence = (entry: typeof left) => entry.result.confidence === "HIGH" ? 10 : 0;
        const technical = (entry: typeof left) => entry.result.source === "TECHNICAL" ? 5 : 0;
        return confidence(right) + technical(right) - confidence(left) - technical(left);
      });
    const best = evaluated[0];
    if (!best) {
      decisions.push({ damagedText: token.text, correctedText: null, alternatives: [], confidence: "LOW", source: "LEXICON", applied: false });
      return;
    }

    const corrected = preserveCase(value.slice(best.variant.start, best.variant.end), best.result.selected);
    const applied = best.result.confidence === "HIGH";
    decisions.push({
      damagedText: value.slice(best.variant.start, best.variant.end),
      correctedText: corrected,
      alternatives: best.result.alternatives.map((candidate) => preserveCase(best.variant.damaged, candidate)),
      confidence: best.result.confidence,
      source: best.variant.structural ? "STRUCTURAL" : best.result.source,
      applied,
    });
    if (applied) replacements.push({ start: best.variant.start, end: best.variant.end, text: corrected });
  });

  let text = value;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    text = text.slice(0, replacement.start) + replacement.text + text.slice(replacement.end);
  }
  return { text, decisions };
}

export function correctImportedDescription(originalText: string, ruleCorrectedText?: string): DescriptionCorrectionResult {
  const structurallyNormalized = normalizeMojibakeText(ruleCorrectedText ?? originalText)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
  const lexical = lexicalRepair(structurallyNormalized);
  const unresolvedTokens = findUnresolvedMojibakeTokens(lexical.text);
  const needsReview = unresolvedTokens.length > 0 || lexical.decisions.some((decision) => !decision.applied);
  const changed = lexical.text !== originalText;
  const highDecisions = lexical.decisions.filter((decision) => decision.applied).length;
  const confidence = needsReview ? 50 : highDecisions ? 100 : 100;

  return {
    originalText,
    automaticText: lexical.text,
    status: needsReview ? "NEEDS_REVIEW" : changed ? "AUTO_CORRECTED" : "OK",
    confidence,
    decisions: lexical.decisions,
    unresolvedTokens,
  };
}
