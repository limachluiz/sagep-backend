import { spawnSync } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnvironmentFile } from "./env-file.mjs";

function item(id, status, message, remediation) {
  return { id, status, message, ...(remediation ? { remediation } : {}) };
}

export function isPrivateIpv4(value) {
  const rawParts = value.split(".");
  if (rawParts.length !== 4 || rawParts.some((part) => !/^\d{1,3}$/.test(part) || String(Number(part)) !== part)) return false;
  const parts = rawParts.map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

export function isCanonicalPrivateIpv4Cidr(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/.exec(value);
  if (!match || !isPrivateIpv4(match[1])) return false;
  const octets = match[1].split(".").map(Number);
  const address = (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
  const prefix = Number(match[2]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  if (network !== address) return false;
  const privateRanges = [
    [0x0a000000, 0x0affffff],
    [0xac100000, 0xac1fffff],
    [0xc0a80000, 0xc0a8ffff],
  ];
  return privateRanges.some(([start, end]) => network >= start && broadcast <= end);
}

function isPlaceholder(value) {
  return !value || /(?:troque|change-?me|example|exemplo|<.*>|x{3,})/i.test(value);
}

export function evaluateEnvironment(values) {
  const checks = [];
  const accessSecret = values.JWT_ACCESS_SECRET || values.JWT_SECRET || "";
  const refreshSecret = values.JWT_REFRESH_SECRET || "";
  const hostName = values.SAGEP_HOSTNAME || "";
  const bindIp = values.SAGEP_BIND_IP || "";
  const origins = (values.CORS_ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  const expectedOrigin = hostName ? `https://${hostName}` : "";
  const allowedNetworks = (values.SAGEP_ALLOWED_NETWORKS || "").split(",").map((network) => network.trim()).filter(Boolean);

  checks.push(item("env.production", values.NODE_ENV === "production" ? "PASS" : "FAIL", values.NODE_ENV === "production" ? "NODE_ENV está em produção." : "NODE_ENV não está definido como production.", "Defina NODE_ENV=production."));
  checks.push(item("env.database", isPlaceholder(values.DATABASE_URL) ? "FAIL" : "PASS", isPlaceholder(values.DATABASE_URL) ? "DATABASE_URL está ausente ou usa valor de exemplo." : "DATABASE_URL foi informada sem exibir seu conteúdo.", "Defina a conexão PostgreSQL de produção."));
  checks.push(item("env.postgres-password", isPlaceholder(values.POSTGRES_PASSWORD) ? "FAIL" : "PASS", isPlaceholder(values.POSTGRES_PASSWORD) ? "POSTGRES_PASSWORD está ausente ou usa valor de exemplo." : "A senha do PostgreSQL foi informada sem exibir seu conteúdo.", "Gere uma senha exclusiva para o banco."));
  const jwtReady = accessSecret.length >= 32 && refreshSecret.length >= 32 && accessSecret !== refreshSecret && !isPlaceholder(accessSecret) && !isPlaceholder(refreshSecret);
  checks.push(item("env.jwt", jwtReady ? "PASS" : "FAIL", jwtReady ? "Os segredos JWT são distintos e possuem comprimento adequado." : "Os segredos JWT estão ausentes, fracos, repetidos ou usam exemplos.", "Gere dois valores distintos com openssl rand -hex 32."));
  checks.push(item("env.cookie", values.AUTH_COOKIE_SECURE === "true" ? "PASS" : "FAIL", values.AUTH_COOKIE_SECURE === "true" ? "Cookie seguro ativado." : "AUTH_COOKIE_SECURE não está ativado.", "Defina AUTH_COOKIE_SECURE=true."));
  checks.push(item("env.proxy", values.TRUST_PROXY_HOPS === "1" ? "PASS" : "FAIL", values.TRUST_PROXY_HOPS === "1" ? "A API confia em um salto de proxy." : "TRUST_PROXY_HOPS não está definido como 1.", "Defina TRUST_PROXY_HOPS=1 para o Caddy."));
  const fqdnReady = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostName);
  checks.push(item("env.hostname", fqdnReady ? "PASS" : "FAIL", fqdnReady ? "O nome DNS completo foi informado." : "SAGEP_HOSTNAME não contém um FQDN válido.", "Informe o nome interno, por exemplo sagep.4cta.eb.mil.br."));
  checks.push(item("env.bind-ip", isPrivateIpv4(bindIp) ? "PASS" : "FAIL", isPrivateIpv4(bindIp) ? "O proxy será vinculado a um IPv4 privado." : "SAGEP_BIND_IP não é um IPv4 privado válido.", "Use o endereço reservado da interface interna; não publique em 0.0.0.0."));
  const networksReady = allowedNetworks.length > 0 && allowedNetworks.length <= 12 && allowedNetworks.every(isCanonicalPrivateIpv4Cidr);
  checks.push(item("env.allowed-networks", networksReady ? "PASS" : "FAIL", networksReady ? `${new Set(allowedNetworks).size} rede(s) IPv4 privada(s) preparada(s) para o firewall.` : "SAGEP_ALLOWED_NETWORKS está vazia ou contém CIDR inválido, público ou não canônico.", "Informe CIDRs privados separados por vírgula, por exemplo 10.78.0.0/16."));
  checks.push(item("env.cors", expectedOrigin && origins.includes(expectedOrigin) && origins.every((origin) => origin.startsWith("https://")) ? "PASS" : "FAIL", expectedOrigin && origins.includes(expectedOrigin) ? "A origem HTTPS exata foi autorizada." : "O CORS não contém a origem HTTPS exata da instalação.", expectedOrigin ? `Defina CORS_ALLOWED_ORIGINS=${expectedOrigin}.` : "Configure primeiro SAGEP_HOSTNAME."));
  checks.push(item("env.registration", values.ALLOW_PUBLIC_REGISTRATION === "false" ? "PASS" : "FAIL", values.ALLOW_PUBLIC_REGISTRATION === "false" ? "Cadastro público bloqueado." : "O cadastro público não está explicitamente bloqueado.", "Defina ALLOW_PUBLIC_REGISTRATION=false."));
  return checks;
}

function commandCheck(command, args, id, label, remediation) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "ignore" });
  return item(id, result.status === 0 ? "PASS" : "FAIL", result.status === 0 ? `${label} disponível.` : `${label} indisponível.`, remediation);
}

async function main() {
  const envPath = path.resolve(process.argv[2] || ".env");
  const checks = [];
  if (!fs.existsSync(envPath)) {
    checks.push(item("file.env", "FAIL", `Arquivo não encontrado: ${envPath}.`, "Copie .env.example para .env e preencha os valores de produção."));
  } else {
    const stats = fs.statSync(envPath);
    checks.push(item("file.env", (stats.mode & 0o077) === 0 ? "PASS" : "FAIL", (stats.mode & 0o077) === 0 ? "O .env não permite leitura por grupo ou outros usuários." : "O .env possui permissões mais amplas que 0600.", "Execute chmod 600 .env no servidor Linux."));
    const values = parseEnvironmentFile(fs.readFileSync(envPath, "utf8"));
    checks.push(...evaluateEnvironment(values));

    if (values.SAGEP_HOSTNAME) {
      try {
        const addresses = await dns.resolve4(values.SAGEP_HOSTNAME);
        checks.push(item("dns.internal", addresses.includes(values.SAGEP_BIND_IP) ? "PASS" : "FAIL", addresses.includes(values.SAGEP_BIND_IP) ? "O DNS resolve para o IP privado configurado." : "O DNS não resolve para o IP configurado.", "Ajuste o registro A no DNS interno."));
      } catch {
        checks.push(item("dns.internal", "FAIL", "O nome interno não pôde ser resolvido.", "Crie ou corrija o registro A no DNS interno."));
      }
    }
  }

  checks.push(commandCheck("docker", ["--version"], "host.docker", "Docker", "Instale uma versão suportada do Docker Engine."));
  checks.push(commandCheck("docker", ["compose", "version"], "host.compose", "Docker Compose", "Instale o plugin Docker Compose v2."));
  checks.push(commandCheck("openssl", ["version"], "host.openssl", "OpenSSL", "Instale o pacote openssl no host."));

  try {
    const disk = fs.statfsSync(process.cwd());
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    const minimum = 5 * 1024 ** 3;
    checks.push(item("host.disk", freeBytes >= minimum ? "PASS" : "WARN", `${(freeBytes / 1024 ** 3).toFixed(1)} GiB livres no volume atual.`, freeBytes >= minimum ? undefined : "Libere ao menos 5 GiB antes de criar imagens e backups."));
  } catch {
    checks.push(item("host.disk", "WARN", "Não foi possível consultar o espaço livre.", "Confirme manualmente o espaço destinado a imagens, banco e backups."));
  }

  const symbols = { PASS: "[OK]", WARN: "[ATENÇÃO]", FAIL: "[BLOQUEIO]" };
  for (const check of checks) {
    console.log(`${symbols[check.status]} ${check.message}`);
    if (check.status !== "PASS" && check.remediation) console.log(`  Correção: ${check.remediation}`);
  }
  const failures = checks.filter((check) => check.status === "FAIL").length;
  const warnings = checks.filter((check) => check.status === "WARN").length;
  console.log(`\nResultado: ${failures} bloqueio(s), ${warnings} alerta(s), ${checks.length - failures - warnings} aprovado(s).`);
  process.exitCode = failures > 0 ? 1 : 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await main();
