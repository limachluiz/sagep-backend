export type DeliveryReportSection = { key: string; title: string; content: string; included: boolean; reviewed: boolean };
export type DeliveryReportItemDetail = { itemId: string; unit: string; quantity: string; technicalDescription: string };
export type DeliveryReportFormalization = { requiresOmAcknowledgement: boolean; recipientName: string; recipientRank: string; recipientRole: string; recipientOrganization: string; acknowledgementNotes: string };
export type DeliveryReportDraft = { version: 2; sections: DeliveryReportSection[]; itemDetails: DeliveryReportItemDetail[]; formalization: DeliveryReportFormalization };
export type DeliverySourceItem = { itemId: string; itemCode: string; description: string; sourceUnit: string; sourceQuantity: string; totalPrice: string };
export type DeliveryReportContext = { projectCode: number | string; title: string; description?: string | null; projectType?: string | null; omName?: string | null; omAcronym?: string | null; estimateCode?: number | string | null; ataNumber?: string | null; diexNumber?: string | null; serviceOrderNumber?: string | null };

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

export const sanitizeDeliveryNarrative = (value: string) => value
  .trim()
  .replace(/\s+/g, " ")
  .replace(/\s*Demais\s+características\s+conforme\s+Term\s*o?\s+de\s+Referência\.?/giu, "")
  .replace(/\s*Demais\s+caracteristicas\s+conforme\s+Term\s*o?\s+de\s+Referencia\.?/giu, "")
  .replace(/\s*O projetista deve substituir esta orientação pelos resultados efetivamente obtidos e indicar as evidências ou certificados correspondentes antes de marcar o bloco como revisado\.?/giu, "")
  .replace(/\s*Este texto deve ser alterado caso existam pendências, serviços a complementar, limitações de infraestrutura ou responsabilidades atribuídas à OM ou à contratada\.?/giu, "")
  .replace(/\s*A conclusão definitiva deste bloco depende da revisão do projetista quanto à correspondência entre o planejamento, o executado, os testes registrados e o As-Built\.?/giu, "")
  .replace(/\s+([,.;:])/g, "$1")
  .replace(/\.\s*\./g, ".");

const cleanDescription = (value: string) => sanitizeDeliveryNarrative(value).replace(/[.;]+$/, "");
const quantityLabel = (item: DeliverySourceItem) => `${item.sourceQuantity} ${item.sourceUnit}`.trim();

export function classifyDeliveryItem(description: string) {
  const normalized = description.toLocaleLowerCase("pt-BR");
  if (/\bnvr\b|\bdvr\b|gravador.*(canal|vídeo|video)/.test(normalized)) return "NVR";
  if (/câmera|camera/.test(normalized)) return "CAMERA";
  if (/switch/.test(normalized) && /poe/.test(normalized)) return "SWITCH_POE";
  if (/ponto lógico|ponto logico|cabeamento estruturado|cat\s?[568]|cabo (de rede|utp|ftp)|\brj-?45\b/.test(normalized)) return "LOGICAL_POINT";
  if (/\bdio\b|distribuidor interno óptico|distribuidor interno optico|caixa de emenda [oó]ptica|\bceo\b/.test(normalized)) return "DIO";
  if (/fibra óptica|fibra optica|cabo óptico|cabo optico|\bfo\b|cabo drop/.test(normalized)) return "FIBER";
  if (/rack/.test(normalized)) return "RACK";
  if (/conversor de mídia|conversor de midia|transceiver|sfp|gbic/.test(normalized)) return "MEDIA_CONVERTER";
  if (/nobreak|ups/.test(normalized)) return "POWER";
  if (/patch\s?panel|painel de conex/.test(normalized)) return "PATCH_PANEL";
  if (/eletroduto|canaleta|perfilado|tubula|condu[ií]te|caixa de passagem/.test(normalized)) return "PATHWAY";
  if (/conector|pigtail|cord[aã]o [oó]ptico|patch cord|acoplador|adaptador/.test(normalized)) return "CONNECTOR";
  if (/fus[aã]o|emenda [oó]ptica|certifica|otdr/.test(normalized)) return "OPTICAL_SERVICE";
  if (/hd\b|disco r[ií]gido|armazenamento/.test(normalized)) return "STORAGE";
  if (/monitor|televisor|display/.test(normalized)) return "DISPLAY";
  if (/poste|mastro|suporte.*c[aâ]mera|caixa herm[eé]tica/.test(normalized)) return "SUPPORT";
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
    case "PATCH_PANEL": return `Foi instalado ${description}, na quantidade de ${amount}, para concentração, organização, identificação e distribuição das terminações do cabeamento estruturado.`;
    case "PATHWAY": return `Foi implantado o item de infraestrutura ${description}, na quantidade de ${amount}, para encaminhamento e proteção física do cabeamento da solução.`;
    case "CONNECTOR": return `Foram aplicados ${amount} referentes a ${description}, compondo as terminações e interconexões necessárias à continuidade do enlace e à organização da solução.`;
    case "OPTICAL_SERVICE": return `Foi executado o serviço ${description}, na quantidade de ${amount}, como parte da preparação, terminação e validação dos enlaces ópticos previstos no projeto.`;
    case "STORAGE": return `Foi instalado ${description}, na quantidade de ${amount}, como recurso de armazenamento vinculado à solução e dimensionado conforme a capacidade registrada no item.`;
    case "DISPLAY": return `Foi instalado ${description}, na quantidade de ${amount}, para visualização e acompanhamento operacional da solução.`;
    case "SUPPORT": return `Foi implantado ${description}, na quantidade de ${amount}, como elemento de fixação, proteção ou suporte físico dos equipamentos instalados.`;
    default: return `Foi executado o item ${description}, na quantidade de ${amount}, conforme a Ordem de Serviço e as evidências vinculadas ao projeto.`;
  }
}

const itemReference = (item: DeliverySourceItem) => `${quantityLabel(item)} de ${cleanDescription(item.description)}`;
const joinReferences = (items: DeliverySourceItem[]) => items.map(itemReference).join("; ");
const categoryItems = (items: DeliverySourceItem[], categories: string[]) => items.filter((item) => categories.includes(classifyDeliveryItem(item.description)));

export function buildContextualDeliverySections(items: DeliverySourceItem[], context: DeliveryReportContext) {
  const categories = new Set(items.map((item) => classifyDeliveryItem(item.description)));
  const isCftv = context.projectType === "CFTV" || categories.has("CAMERA") || categories.has("NVR");
  const isOptical = categories.has("FIBER") || categories.has("DIO") || categories.has("OPTICAL_SERVICE") || categories.has("MEDIA_CONVERTER");
  const isLogical = categories.has("LOGICAL_POINT") || categories.has("PATCH_PANEL");
  const solutionNames = [isCftv && "videomonitoramento", isOptical && "infraestrutura óptica", isLogical && "cabeamento estruturado"].filter(Boolean);
  const solution = solutionNames.length ? solutionNames.join(", ").replace(/, ([^,]*)$/, " e $1") : "infraestrutura de tecnologia da informação";
  const om = context.omAcronym || context.omName || "Organização Militar atendida";
  const references = [context.estimateCode && `Estimativa EST-${context.estimateCode}`, context.ataNumber && `Ata nº ${context.ataNumber}`, context.diexNumber && `DIEx ${context.diexNumber}`, context.serviceOrderNumber && `Ordem de Serviço ${context.serviceOrderNumber}`].filter(Boolean).join(", ");
  const infrastructure = categoryItems(items, ["FIBER", "LOGICAL_POINT", "DIO", "PATCH_PANEL", "PATHWAY", "CONNECTOR", "OPTICAL_SERVICE", "RACK", "SUPPORT"]);
  const equipment = categoryItems(items, ["CAMERA", "NVR", "SWITCH_POE", "MEDIA_CONVERTER", "POWER", "STORAGE", "DISPLAY"]);
  const topology: string[] = [];
  if (isCftv && categories.has("CAMERA") && categories.has("NVR")) topology.push("As câmeras integram-se ao subsistema de gravação e gerenciamento representado pelo NVR descrito nos itens executados.");
  if (categories.has("SWITCH_POE") && categories.has("CAMERA")) topology.push("Os switches PoE realizam a conectividade de rede e a alimentação dos dispositivos compatíveis, reduzindo a necessidade de alimentação elétrica individual nos pontos atendidos.");
  if (isOptical && categories.has("MEDIA_CONVERTER")) topology.push("Os enlaces ópticos são integrados aos segmentos metálicos pelos conversores de mídia ou transceptores relacionados no projeto.");
  if (categories.has("FIBER") && categories.has("DIO")) topology.push("Os cabos ópticos são terminados e organizados nos DIO, preservando identificação, proteção e disponibilidade das fibras.");
  if (isLogical && categories.has("RACK")) topology.push("O cabeamento estruturado converge para os elementos de organização e acondicionamento instalados nos racks da solução.");
  if (!topology.length) topology.push("A topologia utiliza os componentes relacionados nos itens executados, cuja interligação final deve corresponder ao projeto e ao As-Built anexado.");
  const tests: string[] = [];
  if (isOptical) tests.push("Para os enlaces ópticos, devem ser confirmados e registrados continuidade, identificação das fibras, integridade das terminações e resultados de medição ou certificação disponíveis.");
  if (isLogical) tests.push("Para os pontos lógicos, devem ser confirmados identificação, conectividade e correspondência entre as terminações instaladas.");
  if (isCftv) tests.push("Para o CFTV, devem ser confirmados visualização das câmeras, comunicação com o gravador, gravação, reprodução, data e hora e disponibilidade do armazenamento configurado.");
  if (categories.has("POWER")) tests.push("Os equipamentos de proteção elétrica devem ter alimentação, autonomia e sinalizações operacionais verificadas conforme suas características.");
  const maintenance: string[] = ["Recomenda-se manter atualizados o As-Built, a identificação dos componentes e o registro de intervenções que alterem a topologia entregue."];
  if (isCftv) maintenance.push("Devem ser acompanhados periodicamente disponibilidade das câmeras, capacidade de armazenamento, retenção das imagens, sincronismo de horário e condições de limpeza e fixação.");
  if (isOptical) maintenance.push("Intervenções nos enlaces ópticos devem preservar o raio mínimo de curvatura, a limpeza dos conectores, a identificação das fibras e os resultados de referência das medições.");
  if (categories.has("RACK") || categories.has("POWER")) maintenance.push("Os racks e equipamentos ativos devem permanecer ventilados, organizados, protegidos e alimentados em condições compatíveis com o fabricante.");
  return {
    "executive-summary": `O presente relatório registra a entrega da solução de ${solution} do projeto PRJ-${context.projectCode} — ${context.title}, destinada à ${om}. A memória foi estruturada a partir de ${items.length} ${items.length === 1 ? "item efetivamente vinculado" : "itens efetivamente vinculados"} ao projeto, dos documentos de referência e das evidências selecionadas.`,
    "legal-contractual-basis": `A entrega foi documentada com base nos registros mantidos no SAGEP${references ? ` e nos seguintes documentos vinculados: ${references}` : " e na documentação vinculada ao projeto"}. Foram consideradas as exigências técnicas e contratuais aplicáveis e os procedimentos de acompanhamento e fiscalização previstos na Lei nº 14.133/2021.`,
    "purpose-scope": context.description?.trim() || `O escopo executado teve por finalidade disponibilizar solução de ${solution} para atendimento da necessidade registrada pela ${om}, conforme os itens autorizados e as condições documentadas durante a execução.`,
    "executive-project": `A solução adotada foi organizada como sistema de ${solution}, combinando somente os subsistemas identificados nos itens do projeto. ${topology.join(" ")}`,
    "infrastructure": infrastructure.length ? `A infraestrutura implantada compreende: ${joinReferences(infrastructure)}. Esses elementos realizam o encaminhamento, a terminação, a organização, a proteção e/ou o suporte físico necessários à solução, conforme a função técnica de cada item.` : "Não foram identificados itens específicos de infraestrutura física no escopo vinculado. Confirmar se a infraestrutura foi preexistente ou executada por outro instrumento.",
    "equipment-solution": equipment.length ? `Os equipamentos ativos e componentes funcionais identificados no projeto compreendem: ${joinReferences(equipment)}. As capacidades, tecnologias e características citadas correspondem às descrições efetivamente cadastradas nos itens.` : `Não foram identificados equipamentos ativos específicos entre os ${items.length} item(ns) vinculados.`,
    "topology-operation": topology.join(" "),
    "tests-results": tests.length ? `${tests.join(" ")} Os resultados efetivamente obtidos e as evidências ou os certificados correspondentes integram a memória técnica revisada deste projeto.` : "As verificações funcionais aplicáveis aos itens executados e as respectivas evidências integram a memória técnica revisada do projeto.",
    "pendencies": "Não foram registradas ressalvas, pendências ou condicionantes técnicos adicionais na versão revisada deste relatório.",
    "operation-maintenance": maintenance.join(" "),
    "technical-conclusion": `Com base nos itens vinculados, nos documentos de referência e nas evidências selecionadas, a entrega abrange solução de ${solution} destinada à ${om}. A memória técnica consolida a correspondência revisada entre o planejamento, os serviços executados, os testes registrados e o As-Built disponível no projeto.`,
  } as Record<string, string>;
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
