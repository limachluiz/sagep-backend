export type AtaRegionLocality = {
  cityName: string;
  stateUf: "AM" | "RO" | "RR" | "AC";
};

export const ATA_REGION_LOCALITIES: Record<number, AtaRegionLocality[]> = {
  1: [{ cityName: "Manaus", stateUf: "AM" }],
  2: [
    { cityName: "Iranduba", stateUf: "AM" },
    { cityName: "Manacapuru", stateUf: "AM" },
    { cityName: "Rio Preto da Eva", stateUf: "AM" },
    { cityName: "Novo Airão", stateUf: "AM" },
    { cityName: "Anamã", stateUf: "AM" },
    { cityName: "Anori", stateUf: "AM" },
  ],
  3: [
    { cityName: "Coari", stateUf: "AM" },
    { cityName: "Tefé", stateUf: "AM" },
    { cityName: "Alvarães", stateUf: "AM" },
    { cityName: "Codajás", stateUf: "AM" },
    { cityName: "Manaquiri", stateUf: "AM" },
    { cityName: "Careiro", stateUf: "AM" },
    { cityName: "Careiro da Várzea", stateUf: "AM" },
  ],
  4: [
    { cityName: "Tonantins", stateUf: "AM" },
    { cityName: "Tabatinga", stateUf: "AM" },
  ],
  5: [
    { cityName: "Porto Velho", stateUf: "RO" },
    { cityName: "Guajará-Mirim", stateUf: "RO" },
    { cityName: "Humaitá", stateUf: "AM" },
    { cityName: "Rio Branco", stateUf: "AC" },
    { cityName: "Cruzeiro do Sul", stateUf: "AC" },
  ],
  6: [
    { cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
    { cityName: "Barcelos", stateUf: "AM" },
  ],
  7: [
    { cityName: "Boa Vista", stateUf: "RR" },
    { cityName: "Bonfim", stateUf: "RR" },
    { cityName: "Pacaraima", stateUf: "RR" },
    { cityName: "Normandia", stateUf: "RR" },
  ],
};
