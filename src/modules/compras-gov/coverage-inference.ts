import { ATA_REGION_LOCALITIES } from "./ata-regions.js";

export type InferredCoverage = {
  code: string;
  name: string;
  region: string | null;
  localities: Array<{ cityName: string; stateUf: "AM" | "RO" | "RR" | "AC" }>;
};

function titleCase(value: string) {
  return value.toLocaleLowerCase("pt-BR").replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function extractLocalities(value: string) {
  const localities: InferredCoverage["localities"] = [];
  const expression = /([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý\s'-]{2,}?)\s*[-/]\s*(AM|RO|RR|AC)\b/giu;
  for (const match of value.matchAll(expression)) {
    const cityName = titleCase(match[1]
      .replace(/^.*?REGI(?:Ã|A|�{1,2})O\s*\d*\s*[-–:]\s*/i, "")
      .replace(/^\s*(?:E|,|;)\s*/i, "")
      .trim());
    const stateUf = match[2].toUpperCase() as "AM" | "RO" | "RR" | "AC";
    if (!cityName || localities.some((item) => normalizeKey(item.cityName) === normalizeKey(cityName) && item.stateUf === stateUf)) continue;
    localities.push({ cityName, stateUf });
  }
  return localities;
}

export function inferCoverageFromDescription(description: string): InferredCoverage | null {
  const normalized = description.replace(/\s+/g, " ");
  const regionMatch = normalized.match(/REGI(?:Ã|A|�{1,2})O\s*(\d+)/i);
  const extractedLocalities = extractLocalities(normalized);

  const regionNumber = regionMatch?.[1] ?? null;
  const region = regionNumber ? `Região ${Number(regionNumber)}` : null;
  if (!regionNumber) return null;
  const localities = ATA_REGION_LOCALITIES[Number(regionNumber)] ?? extractedLocalities;
  if (!localities.length) return null;

  return {
    code: `REG-${regionNumber.padStart(2, "0")}`,
    name: region!,
    region,
    localities,
  };
}
