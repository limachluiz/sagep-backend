import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";

const MANAGED_CHAINS = ["SAGEP-INGRESS-A", "SAGEP-INGRESS-B"];
const HTTPS_PORTS = [80, 443];
const IPTABLES_CANDIDATES = ["/usr/sbin/iptables", "/usr/bin/iptables", "/sbin/iptables"];

function ipv4ToNumber(value) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || String(Number(part)) !== part)) return -1;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return -1;
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

export function isPrivateIpv4(value) {
  const address = ipv4ToNumber(value);
  return address >= ipv4ToNumber("10.0.0.0") && address <= ipv4ToNumber("10.255.255.255")
    || address >= ipv4ToNumber("172.16.0.0") && address <= ipv4ToNumber("172.31.255.255")
    || address >= ipv4ToNumber("192.168.0.0") && address <= ipv4ToNumber("192.168.255.255");
}

export function isCanonicalPrivateIpv4Cidr(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/.exec(value);
  if (!match) return false;
  const address = ipv4ToNumber(match[1]);
  const prefix = Number(match[2]);
  if (address < 0) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  if (network !== address) return false;
  return [
    [ipv4ToNumber("10.0.0.0"), ipv4ToNumber("10.255.255.255")],
    [ipv4ToNumber("172.16.0.0"), ipv4ToNumber("172.31.255.255")],
    [ipv4ToNumber("192.168.0.0"), ipv4ToNumber("192.168.255.255")],
  ].some(([start, end]) => network >= start && broadcast <= end);
}

export function parseAllowedNetworks(value) {
  const networks = [...new Set((value || "").split(",").map((item) => item.trim()).filter(Boolean))].sort();
  if (networks.length === 0) throw new Error("SAGEP_ALLOWED_NETWORKS não possui nenhuma rede autorizada");
  if (networks.length > 12) throw new Error("SAGEP_ALLOWED_NETWORKS aceita no máximo 12 redes");
  const invalid = networks.find((network) => !isCanonicalPrivateIpv4Cidr(network));
  if (invalid) throw new Error(`CIDR privado inválido ou não canônico: ${invalid}`);
  return networks;
}

export function desiredChainRules(chain, networks) {
  return [
    ...networks.map((network) => ["-A", chain, "-s", network, "-j", "RETURN"]),
    ["-A", chain, "-j", "REJECT", "--reject-with", "tcp-reset"],
  ];
}

export function desiredJumpRules(chain, bindIp) {
  return HTTPS_PORTS.map((port) => [
    "-I", "DOCKER-USER", "1", "-p", "tcp", "-m", "conntrack", "--ctdir", "ORIGINAL",
    "--ctorigdst", bindIp, "--ctorigdstport", String(port), "-j", chain,
  ]);
}

function argumentsFrom(argv) {
  const mode = argv.includes("--apply") ? "apply" : argv.includes("--check") ? "check" : argv.includes("--remove") ? "remove" : "dry-run";
  const envIndex = argv.indexOf("--env");
  return { mode, envPath: path.resolve(envIndex >= 0 ? argv[envIndex + 1] || "" : ".env"), confirmed: argv.includes("--confirm") };
}

function execute(args, { tolerateFailure = false, capture = false } = {}) {
  const executable = IPTABLES_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error("iptables não foi localizado em um caminho administrativo conhecido");
  const result = spawnSync(executable, args, { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0 && !tolerateFailure) throw new Error(`iptables ${args.join(" ")} falhou`);
  return { ok: result.status === 0, stdout: result.stdout || "" };
}

function chainExists(chain) {
  return execute(["-S", chain], { tolerateFailure: true, capture: true }).ok;
}

function dockerUserRules() {
  const result = execute(["-S", "DOCKER-USER"], { capture: true });
  return result.stdout.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("-A DOCKER-USER "));
}

function chainRules(chain) {
  const result = execute(["-S", chain], { capture: true });
  return result.stdout.split("\n").map((line) => line.trim()).filter((line) => line.startsWith(`-A ${chain} `));
}

function managedJumpRules() {
  return dockerUserRules().filter((line) => MANAGED_CHAINS.some((chain) => line.endsWith(`-j ${chain}`)));
}

function deleteRuleLine(line) {
  const args = line.split(/\s+/);
  args[0] = "-D";
  execute(args);
}

function activeChain(lines) {
  return MANAGED_CHAINS.find((chain) => lines.some((line) => line.endsWith(`-j ${chain}`))) || null;
}

function ensureDockerFirewallAvailable() {
  execute(["--version"], { capture: true });
  if (!chainExists("DOCKER-USER")) throw new Error("A cadeia DOCKER-USER não existe; inicie o Docker antes de aplicar o firewall");
}

function assertRoot() {
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    throw new Error("Execute esta operação como root (sudo), pois ela altera o firewall do host");
  }
}

function applyFirewall(bindIp, networks) {
  assertRoot();
  ensureDockerFirewallAvailable();
  const oldJumps = managedJumpRules();
  const current = activeChain(oldJumps);
  const next = current === MANAGED_CHAINS[0] ? MANAGED_CHAINS[1] : MANAGED_CHAINS[0];

  if (!chainExists(next)) execute(["-N", next]);
  execute(["-F", next]);
  for (const rule of desiredChainRules(next, networks)) execute(rule);

  for (const rule of desiredJumpRules(next, bindIp)) execute(rule);
  for (const line of oldJumps) deleteRuleLine(line);
  if (current && chainExists(current)) execute(["-F", current]);
  console.log(`Firewall aplicado: ${networks.length} rede(s) autorizada(s) em ${bindIp}:80/443.`);
}

function checkFirewall(bindIp, networks) {
  assertRoot();
  ensureDockerFirewallAvailable();
  const jumps = managedJumpRules();
  const current = activeChain(jumps);
  if (!current || jumps.length !== HTTPS_PORTS.length) throw new Error("As regras de entrada do SAGEP não estão aplicadas integralmente");

  const expectedRules = desiredChainRules(current, networks).map((rule) => rule.join(" "));
  const appliedRules = chainRules(current);
  if (JSON.stringify(appliedRules) !== JSON.stringify(expectedRules)) {
    throw new Error("As redes aplicadas no firewall são diferentes de SAGEP_ALLOWED_NETWORKS");
  }
  for (const rule of desiredJumpRules(current, bindIp)) {
    const checkRule = ["-C", rule[1], ...rule.slice(3)];
    if (!execute(checkRule, { tolerateFailure: true, capture: true }).ok) throw new Error("O IP ou as portas protegidas não correspondem ao .env");
  }
  console.log(`Firewall conferido: ${networks.length} rede(s) autorizada(s) em ${bindIp}:80/443.`);
}

function removeFirewall(confirmed) {
  assertRoot();
  if (!confirmed) throw new Error("A remoção abre 80/443 para as redes alcançáveis; repita com --remove --confirm");
  ensureDockerFirewallAvailable();
  for (const line of managedJumpRules()) deleteRuleLine(line);
  for (const chain of MANAGED_CHAINS) {
    if (!chainExists(chain)) continue;
    execute(["-F", chain]);
    execute(["-X", chain]);
  }
  console.log("Regras gerenciadas do SAGEP removidas; nenhuma outra regra do host foi alterada.");
}

function printDryRun(bindIp, networks) {
  console.log("Prévia somente leitura; nenhuma regra foi alterada.");
  console.log(`Destino protegido: ${bindIp}:80/443`);
  for (const network of networks) console.log(`Rede autorizada: ${network}`);
  console.log("A aplicação usa uma cadeia alternada para substituir as regras sem janela de liberação.");
  console.log("Execute: sudo /usr/bin/env node scripts/manage-firewall.mjs --apply");
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  if (options.mode === "remove") return removeFirewall(options.confirmed);
  if (!fs.existsSync(options.envPath)) throw new Error(`Arquivo não encontrado: ${options.envPath}`);
  const values = parse(fs.readFileSync(options.envPath));
  const bindIp = (values.SAGEP_BIND_IP || "").trim();
  if (!isPrivateIpv4(bindIp)) throw new Error("SAGEP_BIND_IP deve ser um IPv4 privado e não pode ser 0.0.0.0");
  const networks = parseAllowedNetworks(values.SAGEP_ALLOWED_NETWORKS);
  if (options.mode === "apply") return applyFirewall(bindIp, networks);
  if (options.mode === "check") return checkFirewall(bindIp, networks);
  return printDryRun(bindIp, networks);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[BLOQUEIO] ${error instanceof Error ? error.message : "Falha ao gerenciar o firewall"}`);
    process.exitCode = 1;
  });
}
