export const MILITARY_RANKS = [
  "Sd",
  "Cb",
  "3º Sgt",
  "2º Sgt",
  "1º Sgt",
  "St",
  "Asp",
  "2º Ten",
  "1º Ten",
  "Cap",
  "Maj",
  "TC",
  "Cel",
] as const;

export type MilitaryRank = (typeof MILITARY_RANKS)[number];
