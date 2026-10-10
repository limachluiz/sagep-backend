import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { TextDecoder } from "node:util";

const sourceExtensions = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|sql|md|sh|html|css)$/i;
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter((file) => sourceExtensions.test(file));
const decoder = new TextDecoder("utf-8", { fatal: true });
const invalid = [];
for (const file of files) {
  const content = readFileSync(file);
  try {
    decoder.decode(content);
    if (content.includes(0)) invalid.push(file);
  } catch { invalid.push(file); }
}
if (invalid.length) {
  console.error(`Fontes com UTF-8 inválido ou conteúdo binário:\n${invalid.join("\n")}`);
  process.exit(1);
}
console.log(`${files.length} arquivos de código/documentação com UTF-8 válido.`);
