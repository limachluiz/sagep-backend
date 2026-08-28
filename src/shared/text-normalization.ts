const REVERSIBLE_MOJIBAKE_MARKERS = /Ã|Â|â|ð/;
const WINDOWS_1252_REVERSE: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f,
};

function encodeWindows1252(value: string) {
  return Uint8Array.from(
    Array.from(value, (char) => WINDOWS_1252_REVERSE[char] ?? (char.charCodeAt(0) & 0xff)),
  );
}

function decodeWindows1252AsUtf8(value: string) {
  return Buffer.from(encodeWindows1252(value)).toString("utf8");
}

function preserveWordCase(match: string, replacement: string) {
  const compactMatch = match.replace(/\s+/g, "");

  if (compactMatch === compactMatch.toUpperCase()) {
    return replacement.toUpperCase();
  }

  if (compactMatch[0] === compactMatch[0]?.toUpperCase()) {
    return replacement[0]?.toUpperCase() + replacement.slice(1);
  }

  return replacement;
}

export const REPLACEMENT_CHARACTER_DICTIONARY: ReadonlyArray<{
  pattern: RegExp;
  replacement: string;
}> = [
  { pattern: /s[\s\u00a0]*�{1,2}[\s\u00a0]*o/gi, replacement: "são" },
  { pattern: /regi[\s\u00a0]*�{1,2}[\s\u00a0]*o/gi, replacement: "região" },
  { pattern: /alvar[\s\u00a0]*�+[\s\u00a0]*es/gi, replacement: "alvarães" },
  { pattern: /air[\s\u00a0]*�+[\s\u00a0]*o/gi, replacement: "airão" },
  { pattern: /anam[\s\u00a0]*�+/gi, replacement: "anamã" },
  { pattern: /codaj[\s\u00a0]*�+[\s\u00a0]*s/gi, replacement: "codajás" },
  { pattern: /v[\s\u00a0]*�+[\s\u00a0]*rzea/gi, replacement: "várzea" },
  { pattern: /guajar[\s\u00a0]*�+[\s\u00a0]*(?:-| |\s)*mirim/gi, replacement: "guajará-mirim" },
  { pattern: /guajar[\s\u00a0]*�+/gi, replacement: "guajará" },
  { pattern: /humait[\s\u00a0]*�+/gi, replacement: "humaitá" },
  { pattern: /tabating[\s\u00a0]*�+/gi, replacement: "tabatinga" },
  { pattern: /l[\s\u00a0]*�+[\s\u00a0]*brea/gi, replacement: "lábrea" },
  { pattern: /tef[\s\u00a0]*�+/gi, replacement: "tefé" },
  { pattern: /micr[\s\u00a0]*�+[\s\u00a0]*metros/gi, replacement: "micrômetros" },
  { pattern: /l[\s\u00a0]*�+[\s\u00a0]*gico/gi, replacement: "lógico" },
  { pattern: /fus[\s\u00a0]*�+[\s\u00a0]*o/gi, replacement: "fusão" },
  { pattern: /conex[\s\u00a0]*�+[\s\u00a0]*o/gi, replacement: "conexão" },
  { pattern: /necess[\s\u00a0]*�+[\s\u00a0]*ria/gi, replacement: "necessária" },
  { pattern: /c[\s\u00a0]*�+[\s\u00a0]*mera/gi, replacement: "câmera" },
  { pattern: /caracter[\s\u00a0]*�+[\s\u00a0]*sticas/gi, replacement: "características" },
  { pattern: /refer[\s\u00a0]*�+[\s\u00a0]*ncia/gi, replacement: "referência" },
  { pattern: /a[\s\u00a0]*�+[\s\u00a0]*reo/gi, replacement: "aéreo" },
];

function applyReplacementCharacterDictionary(value: string) {
  return REPLACEMENT_CHARACTER_DICTIONARY.reduce(
    (text, entry) => text.replace(entry.pattern, (match) => preserveWordCase(match, entry.replacement)),
    value,
  );
}

export function findUnresolvedMojibakeTokens(value: string) {
  return [...new Set(value.match(/[\p{L}\d/-]*�+[\p{L}\d/-]*/gu) ?? [])];
}

function repairReplacementCharacters(value: string) {
  return applyReplacementCharacterDictionary(value)
    .replace(/lan[\s\u00a0]*�+[\s\u00a0]*amento/gi, (match) => match.trimStart()[0] === "L" ? "Lançamento" : "lançamento")
    .replace(/�+[\s\u00a0]*ptica/gi, (match) => match.trim().slice(-5) === "PTICA" ? "ÓPTICA" : "óptica")
    .replace(/acess[\s\u00a0]*�+[\s\u00a0]*rios/gi, (match) => match.trimStart()[0] === "A" ? "Acessórios" : "acessórios")
    .replace(/m[\s\u00a0]*�+[\s\u00a0]*todo/gi, (match) => match.trimStart()[0] === "M" ? "Método" : "método")
    .replace(/subterr[\s\u00a0]*�+[\s\u00a0]*neo/gi, (match) => {
      if (match === match.toUpperCase()) return "SUBTERRÂNEO";
      return match[0] === "S" ? "Subterrâneo" : "subterrâneo";
    })
    .replace(/destrut[\s\u00a0]*�+[\s\u00a0]*vel/gi, (match) => {
      if (match === match.toUpperCase()) return "DESTRUTÍVEL";
      return match[0] === "D" ? "Destrutível" : "destrutível";
    })
    .replace(/\bn[\s\u00a0]*�+[\s\u00a0]*o\b/gi, (match) => match.trimStart()[0] === "N" ? "Não" : "não")
    .replace(/\bCab\s+o\b/g, "Cabo")
    .replace(/\bident\s+ificação\b/gi, "identificação")
    .replace(/\bmo\s+nitoramento\b/gi, (match) => preserveWordCase(match, "monitoramento"))
    .replace(/\bmoni\s+toramento\b/gi, (match) => preserveWordCase(match, "monitoramento"))
    .replace(/\blong\s+o\b/gi, (match) => preserveWordCase(match, "longo"))
    .replace(/\bcaracterística\s+s\b/gi, (match) => preserveWordCase(match, "características"))
    .replace(/\bincluin\s+do\b/gi, (match) => preserveWordCase(match, "incluindo"))
    .replace(/\bpa\s+ra\b/gi, (match) => preserveWordCase(match, "para"))
    .replace(/\bdem\s+ais\b/gi, (match) => preserveWordCase(match, "demais"))
    .replace(/\bc\s+onectores\b/gi, (match) => preserveWordCase(match, "conectores"))
    .replace(/\bide\s+ntificação\b/gi, (match) => preserveWordCase(match, "identificação"))
    .replace(/\bre\s+ferência\b/gi, (match) => preserveWordCase(match, "referência"))
    .replace(/\bSERVI[\s\u00a0]*�+[\s\u00a0]*O\b/g, "SERVIÇO")
    .replace(/\bServi[\s\u00a0]*�+[\s\u00a0]*o\b/g, "Serviço")
    .replace(/\bservi[\s\u00a0]*�+[\s\u00a0]*o\b/g, "serviço")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])[\s\u00a0]*�[\s\u00a0]*�[\s\u00a0]*o\b/g, "$1ção")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])[\s\u00a0]*�[\s\u00a0]*�[\s\u00a0]*es\b/g, "$1ções")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])[\s\u00a0]*�+[\s\u00a0]*o\b/g, "$1ço")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])[\s\u00a0]*�+[\s\u00a0]*es\b/g, "$1ções");
}

export function normalizeMojibakeText(value: string): string;
export function normalizeMojibakeText(value: null | undefined): "";
export function normalizeMojibakeText(value: unknown): string;
export function normalizeMojibakeText(value: unknown): string {
  let text = String(value ?? "");

  // U+FFFD means bytes were already lost. Re-decoding the whole string in that
  // situation corrupts valid accents that coexist with the damaged character.
  for (let attempts = 0; attempts < 3 && REVERSIBLE_MOJIBAKE_MARKERS.test(text); attempts += 1) {
    const decoded = decodeWindows1252AsUtf8(text);
    if (!decoded || decoded === text) break;
    text = decoded;
  }

  return repairReplacementCharacters(text);
}
