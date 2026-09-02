export type DeliveryReportSection = { key: string; title: string; content: string; included: boolean; reviewed: boolean };
export type DeliveryReportItemDetail = { itemId: string; unit: string; quantity: string; technicalDescription: string };
export type DeliveryReportFormalization = { requiresOmAcknowledgement: boolean; recipientName: string; recipientRank: string; recipientRole: string; recipientOrganization: string; acknowledgementNotes: string };
export type DeliveryReportDraft = { version: 2; sections: DeliveryReportSection[]; itemDetails: DeliveryReportItemDetail[]; formalization: DeliveryReportFormalization };
export type DeliverySourceItem = { itemId: string; itemCode: string; description: string; sourceUnit: string; sourceQuantity: string; totalPrice: string };

export const defaultDeliveryReportFormalization = (): DeliveryReportFormalization => ({ requiresOmAcknowledgement: false, recipientName: "", recipientRank: "", recipientRole: "", recipientOrganization: "", acknowledgementNotes: "" });

export const defaultDeliveryReportSections = (projectType?: string | null): DeliveryReportSection[] => [
  { key: "executive-summary", title: "Síntese da entrega", content: "O presente relatório consolida a execução técnica, os itens aplicados, os testes realizados e as evidências vinculadas ao projeto, com a finalidade de registrar a solução disponibilizada à Organização Militar atendida.", included: true, reviewed: false },
  { key: "legal-contractual-basis", title: "Fundamentação e documentos de referência", content: "A entrega foi documentada com base nos registros de execução mantidos no SAGEP e nos documentos vinculados ao projeto, observando as exigências técnicas e contratuais aplicáveis e os procedimentos de acompanhamento e fiscalização previstos na Lei nº 14.133/2021.", included: true, reviewed: false },
  { key: "purpose-scope", title: "Finalidade e escopo executado", content: "Os serviços foram executados para atender à necessidade registrada no projeto, respeitando o escopo autorizado e as condições verificadas no local de implantação.", included: true, reviewed: false },
  { key: "executive-project", title: "Projeto executivo e solução adotada", content: projectType === "CFTV" ? "A solução de CFTV foi estruturada de forma integrada, contemplando os componentes de captura, transmissão, alimentação, gerenciamento e armazenamento identificados nos itens executados." : "A solução de infraestrutura óptica e lógica foi estruturada para proporcionar conectividade estável entre os pontos atendidos, conforme os componentes identificados nos itens executados.", included: true, reviewed: false },
  { key: "infrastructure", title: "Infraestrutura implantada", content: "A infraestrutura implantada está detalhada nos itens executados e nas evidências selecionadas, incluindo os elementos de encaminhamento, acomodação, identificação e terminação aplicáveis à solução.", included: true, reviewed: false },
  { key: "equipment-solution", title: "Equipamentos e características técnicas", content: "Os equipamentos e componentes aplicados são apresentados de acordo com as descrições dos itens vinculados à Ordem de Serviço, preservando suas capacidades e características efetivamente registradas.", included: true, reviewed: false },
  { key: "topology-operation", title: "Topologia e funcionamento da solução", content: "A topologia adotada utiliza os meios de transmissão e os equipamentos relacionados neste relatório, formando a infraestrutura necessária ao funcionamento da solução entregue.", included: true, reviewed: false },
  { key: "tests-results", title: "Testes, certificações e resultados", content: "Foram realizadas verificações funcionais compatíveis com os componentes instalados. Os resultados específicos e os documentos de certificação disponíveis devem ser conferidos nas evidências e anexos selecionados.", included: true, reviewed: false },
  { key: "pendencies", title: "Ressalvas, pendências e condicionantes", content: "Não foram registradas ressalvas técnicas adicionais.", included: true, reviewed: false },
  { key: "operation-maintenance", title: "Orientações de operação e manutenção", content: "Recomenda-se preservar a identificação dos componentes, manter os equipamentos em condições adequadas de alimentação e ventilação e registrar qualquer intervenção posterior que altere a topologia ou a configuração documentada.", included: true, reviewed: false },
  { key: "technical-conclusion", title: "Conclusão técnica", content: "Os serviços descritos e as evidências apresentadas correspondem aos registros mantidos no SAGEP e à solução disponibilizada para operação pela OM atendida.", included: true, reviewed: false },
];

const cleanDescription = (value: string) => value.trim().replace(/\s+/g, " ").replace(/[.;]+$/, "");
const quantityLabel = (item: DeliverySourceItem) => `${item.sourceQuantity} ${item.sourceUnit}`.trim();

export function classifyDeliveryItem(description: string) {
  const normalized = description.toLocaleLowerCase("pt-BR");
  if (/nvr|gravador.*(canal|vídeo|video)/.test(normalized)) return "NVR";
  if (/câmera|camera/.test(normalized)) return "CAMERA";
  if (/switch/.test(normalized) && /poe/.test(normalized)) return "SWITCH_POE";
  if (/ponto lógico|ponto logico|cabeamento estruturado|cat\s?[568]/.test(normalized)) return "LOGICAL_POINT";
  if (/\bdio\b|distribuidor interno óptico|distribuidor interno optico/.test(normalized)) return "DIO";
  if (/fibra óptica|fibra optica|cabo óptico|cabo optico|\bfo\b|cabo drop/.test(normalized)) return "FIBER";
  if (/rack/.test(normalized)) return "RACK";
  if (/conversor de mídia|conversor de midia|transceiver|sfp/.test(normalized)) return "MEDIA_CONVERTER";
  if (/nobreak|ups/.test(normalized)) return "POWER";
  return "GENERAL";
}

export function suggestDeliveryItemText(item: DeliverySourceItem) {
  const description = cleanDescription(item.description);
  const amount = quantityLabel(item);
  switch (classifyDeliveryItem(description)) {
    case "FIBER": return `Foi executado o fornecimento e/ou lançamento de ${amount}, referente a ${description}. O componente integra o meio de transmissão óptico da solução e realiza a interligação dos pontos atendidos, conforme o traçado e as terminações registrados nas evidências do projeto.`;
    case "DIO": return `Foi instalado o componente ${description}, destinado à terminação, organização, identificação e proteção das fibras ópticas utilizadas na solução. Quantidade registrada: ${amount}.`;
    case "LOGICAL_POINT": return `Foram implantados ${amount} referentes a ${description}. Os pontos compõem a infraestrutura de cabeamento estruturado da solução e foram destinados à conexão dos equipamentos nos locais definidos pelo projeto.`;
    case "NVR": return `Foi fornecido, instalado e configurado ${description}. O equipamento realiza o gerenciamento e o armazenamento das imagens da solução de CFTV, observadas as capacidades efetivamente informadas na especificação do item. Quantidade registrada: ${amount}.`;
    case "CAMERA": return `Foram fornecidas, instaladas e integradas ${amount} referentes a ${description}. As câmeras foram incorporadas à solução de monitoramento e vinculadas ao sistema de gravação, conforme os posicionamentos demonstrados nas evidências.`;
    case "SWITCH_POE": return `Foi instalado e configurado ${description}. O equipamento integra a rede de comunicação da solução e disponibiliza conectividade e alimentação PoE aos dispositivos compatíveis. Quantidade registrada: ${amount}.`;
    case "RACK": return `Foi instalado ${description}, destinado ao acondicionamento, à organização e à proteção dos equipamentos e terminações da solução. Quantidade registrada: ${amount}.`;
    case "MEDIA_CONVERTER": return `Foi instalado ${description}, realizando a conversão e a integração entre os meios de transmissão empregados na solução. Quantidade registrada: ${amount}.`;
    case "POWER": return `Foi instalado ${description}, destinado à proteção elétrica e à continuidade operacional dos equipamentos vinculados. Quantidade registrada: ${amount}.`;
    default: return `Foi executado o item ${description}, na quantidade de ${amount}, conforme a Ordem de Serviço e as evidências vinculadas ao projeto.`;
  }
}

export function buildContextualTechnicalSection(items: DeliverySourceItem[]) {
  const categories = [...new Set(items.map((item) => classifyDeliveryItem(item.description)))];
  const labels: Record<string, string> = {
    FIBER: "A infraestrutura óptica foi composta pelos cabos e componentes de interligação relacionados nos itens executados.",
    LOGICAL_POINT: "A infraestrutura lógica foi implantada para conectar os equipamentos e os pontos definidos no projeto.",
    DIO: "As terminações ópticas foram organizadas e protegidas por distribuidores internos ópticos compatíveis com os itens registrados.",
    NVR: "O subsistema de gravação foi estruturado com os equipamentos e as capacidades descritas nos itens executados.",
    CAMERA: "O subsistema de captura de imagens foi formado pelas câmeras efetivamente relacionadas no projeto.",
    SWITCH_POE: "A conectividade e a alimentação dos dispositivos compatíveis foram apoiadas pelos switches PoE relacionados.",
    RACK: "Os equipamentos e terminações foram acondicionados nos racks previstos na solução.",
    MEDIA_CONVERTER: "A integração entre meios de transmissão foi realizada pelos conversores e transceptores relacionados.",
    POWER: "A proteção e o suporte elétrico foram realizados pelos equipamentos registrados.",
  };
  return categories.filter((key) => labels[key]).map((key) => labels[key]).join("\n\n");
}

export function inferDeliveryUnit(description: string, sourceUnit?: string | null) {
  const normalizedSource = sourceUnit?.trim().toLocaleLowerCase("pt-BR") ?? "";
  if (normalizedSource && !["serviço", "servico", "sv", "svç"].includes(normalizedSource)) return sourceUnit!.trim();
  const normalized = description.toLocaleLowerCase("pt-BR");
  const isLinearCable = /(lançamento|lancamento|fornecimento).*\b(cabo|fibra|drop)\b|\b(cabo|fibra)\s+(drop|ópt)/.test(normalized);
  const isCountablePoint = /ponto lógico|ponto logico|câmera|camera|rack|nvr|gravador|switch|nobreak|dio|conversor|transceiver/.test(normalized);
  return isLinearCable && !isCountablePoint ? "m" : "Und.";
}

export function parseDeliveryReportDraft(value: unknown, projectType?: string | null): DeliveryReportDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { version: 2, sections: defaultDeliveryReportSections(projectType), itemDetails: [], formalization: defaultDeliveryReportFormalization() };
  const candidate = value as Partial<DeliveryReportDraft>;
  return { version: 2, sections: Array.isArray(candidate.sections) ? candidate.sections : defaultDeliveryReportSections(projectType), itemDetails: Array.isArray(candidate.itemDetails) ? candidate.itemDetails : [], formalization: candidate.formalization && typeof candidate.formalization === "object" ? { ...defaultDeliveryReportFormalization(), ...candidate.formalization } : defaultDeliveryReportFormalization() };
}
