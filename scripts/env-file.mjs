export function parseEnvironmentFile(content) {
  const values = {};
  const lines = String(content).replace(/^\uFEFF/, "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) throw new Error(`Linha ${index + 1} inválida no arquivo de ambiente`);
    const [, key, sourceValue] = match;
    let value = sourceValue;

    if (value.startsWith('"')) {
      if (!value.endsWith('"') || value.length === 1) throw new Error(`Aspas não encerradas na linha ${index + 1}`);
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else if (value.startsWith("'")) {
      if (!value.endsWith("'") || value.length === 1) throw new Error(`Aspas não encerradas na linha ${index + 1}`);
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[key] = value;
  }
  return values;
}

export function quoteEnvironmentValue(value) {
  const normalized = String(value);
  if (/^[A-Za-z0-9_./:@?=-]*$/.test(normalized)) return normalized;
  return `"${normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
}
