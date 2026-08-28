export type InferredCoverage = {
  code: string;
  name: string;
  region: string | null;
  localities: Array<{ cityName: string; stateUf: "AM" | "RO" | "RR" | "AC" }>;
};

const KNOWN_CODES: Record<string, string> = {
  "MANAUS:AM": "MNS",
  "BOA VISTA:RR": "BVB",
  "PORTO VELHO:RO": "PVH",
  "RIO BRANCO:AC": "RBC",
};

function titleCase(value: string) {
  return value.toLocaleLowerCase("pt-BR").replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function fallbackCode(city: string, uf: string) {
  const letters = normalizeKey(city).replace(/[^A-Z]/g, "");
  return KNOWN_CODES[`${normalizeKey(city)}:${uf}`] ?? `${letters.slice(0, 3) || "REG"}-${uf}`;
}

function extractLocalities(value: string) {
  const localities: InferredCoverage["localities"] = [];
  const expression = /([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý\s'-]{2,}?)\s*[-/]\s*(AM|RO|RR|AC)\b/giu;
  for (const match of value.matchAll(expression)) {
    const cityName = titleCase(match[1]
      .replace(/^.*?REGI(?:Ã|A)O\s*\d*\s*[-–:]\s*/i, "")
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
  const regionMatch = normalized.match(/REGI(?:Ã|A)O\s*(\d+)/i);
  const localities = extractLocalities(normalized);
  if (!localities.length) return null;

  const regionNumber = regionMatch?.[1] ?? null;
  const region = regionNumber ? `Região ${Number(regionNumber)}` : null;
  const first = localities[0];

  return {
    code: regionNumber ? `REG-${regionNumber.padStart(2, "0")}` : fallbackCode(first.cityName, first.stateUf),
    name: region ?? `${first.cityName}/${first.stateUf}`,
    region,
    localities,
  };
}
