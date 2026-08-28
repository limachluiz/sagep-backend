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

function fallbackCode(city: string, uf: string) {
  const letters = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return KNOWN_CODES[`${letters.replace(/ /g, "")}:${uf}`] ?? `${letters.slice(0, 3) || "REG"}-${uf}`;
}

export function inferCoverageFromDescription(description: string): InferredCoverage | null {
  const normalized = description.replace(/\s+/g, " ");
  const match = normalized.match(/REGI(?:Ã|A)O\s*(\d+)?\s*[-–:]\s*([^();:]+?)\s*[-/]\s*(AM|RO|RR|AC)\b/i);
  if (!match) return null;

  const cityName = titleCase(match[2].trim().replace(/[.,]+$/, ""));
  const stateUf = match[3].toUpperCase() as "AM" | "RO" | "RR" | "AC";
  const normalizedCity = cityName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const code = KNOWN_CODES[`${normalizedCity}:${stateUf}`] ?? fallbackCode(cityName, stateUf);
  const region = match[1] ? `Região ${match[1]}` : null;

  return {
    code,
    name: region ? `${region} · ${cityName}/${stateUf}` : `${cityName}/${stateUf}`,
    region,
    localities: [{ cityName, stateUf }],
  };
}
