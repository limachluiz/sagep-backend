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
  { pattern: /s�{1,2}o/gi, replacement: "são" },
  { pattern: /regi�{1,2}o/gi, replacement: "região" },
  { pattern: /alvar�es/gi, replacement: "alvarães" },
  { pattern: /air�o/gi, replacement: "airão" },
  { pattern: /anam�/gi, replacement: "anamã" },
  { pattern: /codaj�s/gi, replacement: "codajás" },
  { pattern: /v�rzea/gi, replacement: "várzea" },
  { pattern: /guajar�(?:-| |\s)*mirim/gi, replacement: "guajará-mirim" },
  { pattern: /guajar�/gi, replacement: "guajará" },
  { pattern: /humait�/gi, replacement: "humaitá" },
  { pattern: /tabating�/gi, replacement: "tabatinga" },
  { pattern: /l�brea/gi, replacement: "lábrea" },
  { pattern: /tef�/gi, replacement: "tefé" },
  { pattern: /micr�metros/gi, replacement: "micrômetros" },
  { pattern: /l�gico/gi, replacement: "lógico" },
  { pattern: /fus�o/gi, replacement: "fusão" },
  { pattern: /conex�o/gi, replacement: "conexão" },
  { pattern: /necess�ria/gi, replacement: "necessária" },
  { pattern: /c�mera/gi, replacement: "câmera" },
  { pattern: /caracter�sticas/gi, replacement: "características" },
  { pattern: /refer�ncia/gi, replacement: "referência" },
  { pattern: /a�reo/gi, replacement: "aéreo" },
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
    .replace(/lan�amento/gi, (match) => match[0] === "L" ? "Lançamento" : "lançamento")
    .replace(/�ptica/gi, (match) => match.slice(1) === "PTICA" ? "ÓPTICA" : "óptica")
    .replace(/acess�rios/gi, (match) => match[0] === "A" ? "Acessórios" : "acessórios")
    .replace(/m�todo/gi, (match) => match[0] === "M" ? "Método" : "método")
    .replace(/subterr�neo/gi, (match) => {
      if (match === match.toUpperCase()) return "SUBTERRÂNEO";
      return match[0] === "S" ? "Subterrâneo" : "subterrâneo";
    })
    .replace(/destrut�vel/gi, (match) => {
      if (match === match.toUpperCase()) return "DESTRUTÍVEL";
      return match[0] === "D" ? "Destrutível" : "destrutível";
    })
    .replace(/\bn\s+�o\b/gi, (match) => match[0] === "N" ? "Não" : "não")
    .replace(/\bn�o\b/gi, (match) => match[0] === "N" ? "Não" : "não")
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
    .replace(/\bSERVI�O\b/g, "SERVIÇO")
    .replace(/\bServi�o\b/g, "Serviço")
    .replace(/\bservi�o\b/g, "serviço")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])��o\b/g, "$1ção")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])��es\b/g, "$1ções")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])�o\b/g, "$1ço")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])�es\b/g, "$1ções");
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
