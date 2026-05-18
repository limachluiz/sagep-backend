const MOJIBAKE_MARKERS = /Ã|Â|â|ð|�/;
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

function repairReplacementCharacters(value: string) {
  return value
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

  for (let attempts = 0; attempts < 3 && MOJIBAKE_MARKERS.test(text); attempts += 1) {
    const decoded = decodeWindows1252AsUtf8(text);
    if (!decoded || decoded === text) break;
    text = decoded;
  }

  return repairReplacementCharacters(text);
}
