export type DeliveryReportSection = {
  key: string;
  title: string;
  content: string;
  included: boolean;
  reviewed: boolean;
};

export type DeliveryReportItemDetail = {
  itemId: string;
  unit: string;
  quantity: string;
  technicalDescription: string;
};

export type DeliveryReportDraft = {
  version: 1;
  sections: DeliveryReportSection[];
  itemDetails: DeliveryReportItemDetail[];
};

export const defaultDeliveryReportSections = (projectType?: string | null): DeliveryReportSection[] => [
  {
    key: "executive-summary",
    title: "Síntese da entrega",
    content: "",
    included: true,
    reviewed: false,
  },
  {
    key: "purpose-scope",
    title: "Finalidade e escopo executado",
    content: "",
    included: true,
    reviewed: false,
  },
  {
    key: "executive-project",
    title: "Projeto executivo e solução adotada",
    content: "",
    included: true,
    reviewed: false,
  },
  {
    key: "infrastructure",
    title: "Infraestrutura implantada",
    content: "",
    included: true,
    reviewed: false,
  },
  {
    key: "equipment-solution",
    title: "Equipamentos e características técnicas",
    content: "",
    included: true,
    reviewed: false,
  },
  {
    key: "topology-operation",
    title: "Topologia e funcionamento da solução",
    content: "",
    included: true,
    reviewed: false,
  },
  {
    key: "tests-results",
    title: "Testes, certificações e resultados",
    content: "",
    included: true,
    reviewed: false,
  },
  {
    key: "pendencies",
    title: "Ressalvas, pendências e condicionantes",
    content: "Não foram registradas ressalvas técnicas adicionais.",
    included: true,
    reviewed: false,
  },
  {
    key: "operation-maintenance",
    title: "Orientações de operação e manutenção",
    content: "",
    included: true,
    reviewed: false,
  },
  {
    key: "technical-conclusion",
    title: "Conclusão técnica",
    content: "Os serviços descritos e as evidências apresentadas correspondem aos registros mantidos no SAGEP e à solução disponibilizada para operação pela OM atendida.",
    included: true,
    reviewed: false,
  },
];

export function inferDeliveryUnit(description: string, sourceUnit?: string | null) {
  const normalizedSource = sourceUnit?.trim().toLocaleLowerCase("pt-BR") ?? "";
  if (normalizedSource && !["serviço", "servico", "sv", "svç"].includes(normalizedSource)) return sourceUnit!.trim();
  const normalized = description.toLocaleLowerCase("pt-BR");
  const isLinearCable = /(lançamento|lancamento|fornecimento).*\b(cabo|fibra|drop)\b|\b(cabo|fibra)\s+(drop|ópt)/.test(normalized);
  const isCountablePoint = /ponto lógico|ponto logico|câmera|camera|rack|nvr|gravador|switch|nobreak|dio|conversor|transceiver/.test(normalized);
  return isLinearCable && !isCountablePoint ? "m" : "Und.";
}

export function parseDeliveryReportDraft(value: unknown, projectType?: string | null): DeliveryReportDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: 1, sections: defaultDeliveryReportSections(projectType), itemDetails: [] };
  }
  const candidate = value as Partial<DeliveryReportDraft>;
  return {
    version: 1,
    sections: Array.isArray(candidate.sections) ? candidate.sections : defaultDeliveryReportSections(projectType),
    itemDetails: Array.isArray(candidate.itemDetails) ? candidate.itemDetails : [],
  };
}
