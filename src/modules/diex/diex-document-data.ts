type DiexPregaoSource = {
  pregaoNumber?: string | null;
  estimate: {
    ata: {
      externalPregaoNumber?: string | null;
      externalPregaoYear?: string | null;
      pregao?: {
        number: string;
        year: string;
      } | null;
    };
  };
};

export function resolveDiexPregaoNumber(data: DiexPregaoSource) {
  const catalogPregao = data.estimate.ata.pregao;
  if (catalogPregao?.number.trim() && catalogPregao.year.trim()) {
    return `${catalogPregao.number.trim()}/${catalogPregao.year.trim()}`;
  }

  const externalNumber = data.estimate.ata.externalPregaoNumber?.trim();
  const externalYear = data.estimate.ata.externalPregaoYear?.trim();
  if (externalNumber && externalYear) {
    return `${externalNumber}/${externalYear}`;
  }

  return data.pregaoNumber?.trim() || "Não configurado";
}
