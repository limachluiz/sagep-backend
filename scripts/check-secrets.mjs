import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  {
    name: "chave privada",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  {
    name: "token GitHub",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  },
  {
    name: "chave de acesso AWS",
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
];

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);

const findings = [];
let scanned = 0;

for (const file of trackedFiles) {
  const content = readFileSync(file);
  if (content.length > 2 * 1024 * 1024 || content.includes(0)) {
    continue;
  }

  const text = content.toString("utf8");
  scanned += 1;
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      findings.push(`${file}: possível ${pattern.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(`${scanned} arquivos versionados verificados; nenhum segredo detectado.`);
