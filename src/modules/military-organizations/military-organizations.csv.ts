export type MilitaryOrganizationCsvRow = {
  line: number;
  sigla: string;
  name: string;
  cityName: string;
  stateUf: string;
  isActive: boolean;
  issues: string[];
};

const headerAliases: Record<string, keyof Omit<MilitaryOrganizationCsvRow, "line" | "issues">> = {
  sigla: "sigla",
  om: "sigla",
  nome: "name",
  nomecompleto: "name",
  name: "name",
  cidade: "cityName",
  municipio: "cityName",
  city: "cityName",
  cityname: "cityName",
  uf: "stateUf",
  estado: "stateUf",
  stateuf: "stateUf",
  ativo: "isActive",
  ativa: "isActive",
  active: "isActive",
  isactive: "isActive",
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function parseLine(line: string, delimiter: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function parseActive(value: string) {
  const normalized = normalizeHeader(value);
  if (!normalized || ["sim", "true", "1", "ativo", "ativa"].includes(normalized)) return true;
  if (["nao", "false", "0", "inativo", "inativa"].includes(normalized)) return false;
  return null;
}

export function parseMilitaryOrganizationsCsv(content: string, maxRows = 1000) {
  const normalizedContent = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rawLines = normalizedContent.split("\n");
  if (rawLines[0]?.trim().toLowerCase().startsWith("sep=")) rawLines.shift();
  const lines = rawLines.map((value, index) => ({ value, line: index + 1 })).filter(({ value }) => value.trim());
  if (lines.length < 2) throw new Error("O CSV deve conter cabeçalho e pelo menos uma OM");

  const headerText = lines[0].value;
  const delimiter = (headerText.match(/;/g)?.length ?? 0) >= (headerText.match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = parseLine(headerText, delimiter).map((header) => headerAliases[normalizeHeader(header)] ?? null);
  const required = ["sigla", "name", "cityName", "stateUf"] as const;
  const missingHeaders = required.filter((field) => !headers.includes(field));
  if (missingHeaders.length) throw new Error("Cabeçalhos obrigatórios: sigla, nome, cidade e uf");
  if (lines.length - 1 > maxRows) throw new Error(`O arquivo pode conter no máximo ${maxRows} OMs`);

  const seen = new Map<string, number>();
  return lines.slice(1).map(({ value, line }) => {
    const cells = parseLine(value, delimiter);
    const data: Record<string, string> = {};
    headers.forEach((header, index) => { if (header) data[header] = cells[index] ?? ""; });
    const sigla = (data.sigla ?? "").trim().toUpperCase();
    const name = (data.name ?? "").trim();
    const cityName = (data.cityName ?? "").trim();
    const stateUf = (data.stateUf ?? "").trim().toUpperCase();
    const active = parseActive(data.isActive ?? "");
    const issues: string[] = [];
    if (sigla.length < 2) issues.push("Sigla inválida");
    if (name.length < 3) issues.push("Nome inválido");
    if (cityName.length < 2) issues.push("Cidade inválida");
    if (!["AM", "RO", "RR", "AC"].includes(stateUf)) issues.push("UF deve ser AM, RO, RR ou AC");
    if (active === null) issues.push("Ativo deve ser SIM ou NÃO");
    if (sigla && seen.has(sigla)) issues.push(`Sigla repetida no arquivo (primeira ocorrência na linha ${seen.get(sigla)})`);
    else if (sigla) seen.set(sigla, line);
    return { line, sigla, name, cityName, stateUf, isActive: active ?? true, issues };
  });
}

export function militaryOrganizationsCsvTemplate() {
  return "\uFEFFsigla;nome;cidade;uf;ativo\r\n4º CTA;4º Centro de Telemática de Área;Manaus;AM;SIM\r\n17º B LOG;17º Batalhão Logístico de Selva;Porto Velho;RO;SIM\r\n";
}
