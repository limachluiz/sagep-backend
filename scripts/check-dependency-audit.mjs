import { spawnSync } from "node:child_process";

const allowedFindings = new Map([
  ["deepmerge-ts", { severity: "high", sources: new Set([1145093]) }],
  ["esbuild", { severity: "low", sources: new Set([1120680]) }],
  ["@prisma/config", { severity: "high", dependencies: new Set(["deepmerge-ts"]) }],
  ["prisma", { severity: "high", dependencies: new Set(["@prisma/config"]) }],
]);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});

if (result.error || !result.stdout.trim()) {
  console.error("Não foi possível executar o npm audit.");
  console.error(result.error?.message ?? result.stderr);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("O npm audit não retornou um relatório JSON válido.");
  process.exit(1);
}

const unexpected = [];
const accepted = [];

for (const [name, finding] of Object.entries(report.vulnerabilities ?? {})) {
  const rule = allowedFindings.get(name);
  const references = Array.isArray(finding.via) ? finding.via : [];
  const sources = references
    .filter((reference) => typeof reference === "object" && reference !== null)
    .map((reference) => reference.source);
  const dependencies = references.filter((reference) => typeof reference === "string");

  const sourcesAllowed = sources.every((source) => rule?.sources?.has(source));
  const dependenciesAllowed = dependencies.every((dependency) =>
    rule?.dependencies?.has(dependency),
  );
  const hasExpectedReference = sources.length + dependencies.length > 0;

  if (
    !rule ||
    finding.severity !== rule.severity ||
    !hasExpectedReference ||
    !sourcesAllowed ||
    !dependenciesAllowed
  ) {
    unexpected.push(`${name} (${finding.severity})`);
  } else {
    accepted.push(`${name} (${finding.severity})`);
  }
}

if (unexpected.length > 0) {
  console.error(`Vulnerabilidades não autorizadas: ${unexpected.join(", ")}`);
  process.exit(1);
}

if (accepted.length > 0) {
  console.warn(`Exceções documentadas: ${accepted.join(", ")}`);
}

console.log("Auditoria de dependências concluída sem novos alertas.");
