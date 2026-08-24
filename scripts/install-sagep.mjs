import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { parseEnvironmentFile, quoteEnvironmentValue } from "./env-file.mjs";
import { isPrivateIpv4, parseAllowedNetworks } from "./manage-firewall.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const DEFAULT_ENV_PATH = path.join(projectRoot, ".env");
const FRONTEND_REPOSITORY = "https://github.com/limachluiz/sagep-web.git";
const FRONTEND_BRANCH = "upgrade-security";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: projectRoot, encoding: "utf8", stdio: options.capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) throw new Error(`${command} ${args.join(" ")} falhou`);
  return result;
}

function commandAvailable(command, args = ["--version"]) {
  return run(command, args, { capture: true, allowFailure: true }).status === 0;
}

function fqdnReady(value) {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

function emailReady(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateInstallerAnswers(inputAnswers) {
  const answers = {
    hostName: String(inputAnswers.hostName || "").trim().toLowerCase(),
    bindIp: String(inputAnswers.bindIp || "").trim(),
    allowedNetworks: parseAllowedNetworks(String(inputAnswers.allowedNetworks || "")).join(","),
    pgAdminEmail: String(inputAnswers.pgAdminEmail || "").trim().toLowerCase(),
  };
  if (!fqdnReady(answers.hostName)) throw new Error("Informe um nome DNS interno completo");
  if (!isPrivateIpv4(answers.bindIp)) throw new Error("Informe o IPv4 privado reservado do servidor");
  if (!emailReady(answers.pgAdminEmail)) throw new Error("Informe um e-mail válido para o pgAdmin");
  return answers;
}

export function generateInstallerSecrets(random = (bytes) => randomBytes(bytes).toString("hex")) {
  return {
    postgresPassword: random(24),
    pgAdminPassword: random(24),
    jwtAccessSecret: random(32),
    jwtRefreshSecret: random(32),
    setupToken: random(32),
  };
}

export function buildProductionEnvironment(inputAnswers, secrets = generateInstallerSecrets()) {
  const answers = validateInstallerAnswers(inputAnswers);
  if (secrets.jwtAccessSecret === secrets.jwtRefreshSecret) throw new Error("Os segredos JWT precisam ser diferentes");
  const postgresUser = "sagep";
  const postgresDatabase = "sagep";
  const values = {
    PORT: "3000",
    API_PORT: "3000",
    NODE_ENV: "production",
    DOCKER_NODE_ENV: "production",
    DATABASE_URL: `postgresql://${postgresUser}:${secrets.postgresPassword}@localhost:5432/${postgresDatabase}?schema=public`,
    DOCKER_DATABASE_URL: `postgresql://${postgresUser}:${secrets.postgresPassword}@postgres:5432/${postgresDatabase}?schema=public`,
    JWT_SECRET: secrets.jwtAccessSecret,
    JWT_REFRESH_SECRET: secrets.jwtRefreshSecret,
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    AUTH_REFRESH_COOKIE_NAME: "sagep_refresh",
    AUTH_COOKIE_SECURE: "true",
    TRUST_PROXY_HOPS: "1",
    RATE_LIMIT_WINDOW_MS: "900000",
    RATE_LIMIT_MAX: "600",
    AUTH_RATE_LIMIT_MAX: "10",
    LOGIN_MAX_FAILED_ATTEMPTS: "5",
    LOGIN_LOCKOUT_MINUTES: "15",
    SENSITIVE_RATE_LIMIT_MAX: "20",
    STEP_UP_EXPIRES_IN_SECONDS: "300",
    PDF_TIMEOUT_MS: "60000",
    PDF_RENDER_MODE: "real",
    COMPRAS_GOV_DEBUG: "false",
    PORTAL_TRANSPARENCIA_API_TOKEN: "",
    PORTAL_TRANSPARENCIA_BASE_URL: "https://api.portaldatransparencia.gov.br/api-de-dados",
    PORTAL_TRANSPARENCIA_SYNC_INTERVAL_MINUTES: "1440",
    CORS_ALLOWED_ORIGINS: `https://${answers.hostName}`,
    CORS_ALLOW_CREDENTIALS: "true",
    ALLOW_PUBLIC_REGISTRATION: "false",
    HEALTH_PGADMIN_URL: "http://pgadmin/misc/ping",
    HEALTH_PROBE_TIMEOUT_MS: "2000",
    BACKUP_DIRECTORY: "./backups",
    BACKUP_RETENTION_DAYS: "30",
    BACKUP_MAX_FILES: "30",
    BACKUP_SCHEDULE_HOURS: "24",
    BACKUP_RUN_ON_STARTUP: "true",
    BACKUP_MAX_UPLOAD_MB: "512",
    DEPLOYMENT_PKI_DIRECTORY: "./pki",
    DEPLOYMENT_TLS_DIRECTORY: "./tls",
    CERTIFICATE_AUTO_RENEW_ENABLED: "true",
    CERTIFICATE_AUTO_RENEW_DAYS: "30",
    CERTIFICATE_RENEWAL_CHECK_HOURS: "24",
    CERTIFICATE_PROXY_AUTO_RELOAD: "false",
    CERTIFICATE_RELOAD_CHECK_SECONDS: "15",
    SAGEP_SETUP_TOKEN: secrets.setupToken,
    SAGEP_HOSTNAME: answers.hostName,
    SAGEP_BIND_IP: answers.bindIp,
    SAGEP_ALLOWED_NETWORKS: answers.allowedNetworks,
    POSTGRES_USER: postgresUser,
    POSTGRES_PASSWORD: secrets.postgresPassword,
    POSTGRES_DB: postgresDatabase,
    POSTGRES_PORT: "5432",
    PGADMIN_DEFAULT_EMAIL: answers.pgAdminEmail,
    PGADMIN_DEFAULT_PASSWORD: secrets.pgAdminPassword,
    PGADMIN_PORT: "5050",
  };
  return `${Object.entries(values).map(([key, value]) => `${key}=${quoteEnvironmentValue(value)}`).join("\n")}\n`;
}

export function renderFirewallService(rootDirectory, environmentPath = path.join(rootDirectory, ".env")) {
  if (/\s|[\r\n]/.test(rootDirectory) || /\s|[\r\n]/.test(environmentPath)) {
    throw new Error("Os caminhos da instalação e do ambiente não podem conter espaços");
  }
  if (!path.isAbsolute(rootDirectory) || !path.isAbsolute(environmentPath)) throw new Error("Os caminhos da unidade precisam ser absolutos");
  return `[Unit]\nDescription=SAGEP - restrição de acesso HTTPS por CIDR\nRequires=docker.service\nAfter=docker.service network-online.target\nPartOf=docker.service\n\n[Service]\nType=oneshot\nWorkingDirectory=${rootDirectory}\nExecStart=/usr/bin/env node ${rootDirectory}/scripts/manage-firewall.mjs --apply --env ${environmentPath}\nExecReload=/usr/bin/env node ${rootDirectory}/scripts/manage-firewall.mjs --apply --env ${environmentPath}\nRemainAfterExit=yes\n\n[Install]\nWantedBy=docker.service\n`;
}

async function atomicEnvironmentWrite(envPath, content, operation) {
  const temporary = `${envPath}.${operation}-${process.pid}`;
  let handle;
  try {
    handle = await fsp.open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (operation === "install") {
      await fsp.link(temporary, envPath);
      await fsp.rm(temporary);
    } else {
      await fsp.rename(temporary, envPath);
    }
    await fsp.chmod(envPath, 0o600);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await fsp.rm(temporary, { force: true });
    throw error;
  }
}

async function writeNewEnvironment(envPath, content) {
  if (fs.existsSync(envPath)) throw new Error(`O arquivo ${envPath} já existe; o instalador não sobrescreve segredos`);
  await atomicEnvironmentWrite(envPath, content, "install");
}

function parseArguments(argv) {
  const valueAfter = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    answersPath: valueAfter("--answers"),
    envPath: path.resolve(valueAfter("--env") || DEFAULT_ENV_PATH),
    configureOnly: argv.includes("--configure-only"),
    deploy: argv.includes("--deploy"),
    cloneFrontend: argv.includes("--clone-frontend"),
    confirmDeploy: valueAfter("--confirm-deploy") === "IMPLANTAR",
    finalize: argv.includes("--finalize"),
    confirmFinalize: valueAfter("--confirm-finalize") === "REMOVER-CHAVE",
  };
}

async function askAnswers() {
  const terminal = readline.createInterface({ input, output });
  try {
    const hostName = await terminal.question("Nome DNS interno completo [sagep.4cta.eb.mil.br]: ");
    const bindIp = await terminal.question("IPv4 privado reservado do servidor: ");
    const allowedNetworks = await terminal.question("Redes CIDR autorizadas, separadas por vírgula [10.78.0.0/16]: ");
    const pgAdminEmail = await terminal.question("E-mail administrativo do pgAdmin [admin@sagep.local]: ");
    return validateInstallerAnswers({
      hostName: hostName || "sagep.4cta.eb.mil.br",
      bindIp,
      allowedNetworks: allowedNetworks || "10.78.0.0/16",
      pgAdminEmail: pgAdminEmail || "admin@sagep.local",
    });
  } finally {
    terminal.close();
  }
}

function answersFromFile(filePath) {
  const values = parseEnvironmentFile(fs.readFileSync(path.resolve(filePath), "utf8"));
  return validateInstallerAnswers({
    hostName: values.SAGEP_HOSTNAME,
    bindIp: values.SAGEP_BIND_IP,
    allowedNetworks: values.SAGEP_ALLOWED_NETWORKS,
    pgAdminEmail: values.PGADMIN_DEFAULT_EMAIL,
  });
}

function ensureHostReady() {
  const commands = [
    ["git", ["--version"]],
    ["openssl", ["version"]],
    ["docker", ["--version"]],
    ["docker", ["compose", "version"]],
    ["iptables", ["--version"]],
    ["systemctl", ["--version"]],
  ];
  const missing = commands.filter(([command, args]) => !commandAvailable(command, args)).map(([command, args]) => `${command} ${args.join(" ")}`);
  if (missing.length) throw new Error(`Pré-requisitos ausentes: ${missing.join(", ")}. Execute sudo bash scripts/bootstrap-host.sh --install`);
}

function ensureFrontend(cloneAllowed) {
  const frontendDirectory = path.resolve(projectRoot, "../sagep-web");
  if (fs.existsSync(path.join(frontendDirectory, "package.json"))) return frontendDirectory;
  if (!cloneAllowed) throw new Error(`Frontend não encontrado em ${frontendDirectory}; repita com --clone-frontend`);
  if (fs.existsSync(frontendDirectory)) throw new Error(`O caminho ${frontendDirectory} existe, mas não contém um frontend válido`);
  run("git", ["clone", "--branch", FRONTEND_BRANCH, "--single-branch", FRONTEND_REPOSITORY, frontendDirectory]);
  return frontendDirectory;
}

function assertRoot() {
  if (typeof process.getuid === "function" && process.getuid() !== 0) throw new Error("A implantação completa deve ser executada com sudo");
}

function assertProtectedEnvironment(envPath) {
  const stats = fs.lstatSync(envPath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("O .env deve ser um arquivo regular, não um link simbólico");
  if ((stats.mode & 0o077) !== 0) throw new Error("O .env deve possuir permissão 0600 antes da implantação");
}

async function installFirewallService(envPath) {
  const homologation = path.basename(envPath) === ".env.homolog";
  const serviceName = homologation ? "sagep-homolog-firewall" : "sagep-firewall";
  const servicePath = `/etc/systemd/system/${serviceName}.service`;
  await fsp.writeFile(servicePath, renderFirewallService(projectRoot, envPath), { encoding: "utf8", mode: 0o644 });
  await fsp.chmod(servicePath, 0o644);
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["enable", "--now", `${serviceName}.service`]);
}

function deploy(envPath, cloneAllowed) {
  assertRoot();
  ensureHostReady();
  assertProtectedEnvironment(envPath);
  run(process.execPath, [path.join(scriptDirectory, "check-deployment-preflight.mjs"), envPath]);
  ensureFrontend(cloneAllowed);
  run("docker", ["compose", "--env-file", envPath, "--profile", "https", "config", "--quiet"]);
  run("docker", ["compose", "--env-file", envPath, "--profile", "https", "build"]);
  run("docker", ["compose", "--env-file", envPath, "run", "--rm", "--no-deps", "api", "node", "dist/scripts/bootstrap-deployment.js"]);
  run(process.execPath, [path.join(scriptDirectory, "manage-firewall.mjs"), "--apply", "--env", envPath]);
  run("docker", ["compose", "--env-file", envPath, "--profile", "https", "up", "-d"]);
  const outputDirectory = path.join(projectRoot, "deployment-output");
  const rootCertificate = path.join(outputDirectory, "sagep-om-root-ca.crt");
  const temporaryCertificate = `${rootCertificate}.next-${process.pid}`;
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o755 });
  try {
    fs.closeSync(fs.openSync(temporaryCertificate, "wx", 0o600));
    run("docker", ["compose", "--env-file", envPath, "--profile", "https", "cp", "api:/app/pki/sagep-om-root-ca.crt", temporaryCertificate]);
    fs.chmodSync(temporaryCertificate, 0o644);
    fs.renameSync(temporaryCertificate, rootCertificate);
  } finally {
    fs.rmSync(temporaryCertificate, { force: true });
  }
  run("openssl", ["x509", "-in", rootCertificate, "-noout", "-fingerprint", "-sha256"]);
  run("docker", ["compose", "--env-file", envPath, "--profile", "https", "ps"]);
}

async function finalize(envPath, confirmed) {
  assertRoot();
  if (!confirmed) throw new Error("A finalização exige --confirm-finalize REMOVER-CHAVE");
  const content = await fsp.readFile(envPath, "utf8");
  const values = parseEnvironmentFile(content);
  if (!values.SAGEP_SETUP_TOKEN) {
    console.log("A chave de primeira inicialização já está removida.");
    return;
  }
  const updated = content.replace(/^SAGEP_SETUP_TOKEN=.*$/m, "SAGEP_SETUP_TOKEN=");
  await atomicEnvironmentWrite(envPath, updated, "finalize");
  run("docker", ["compose", "--env-file", envPath, "up", "-d", "--no-deps", "--force-recreate", "api"]);
  console.log("Chave de primeira inicialização removida e API recriada.");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.finalize) return finalize(options.envPath, options.confirmFinalize);

  if (!fs.existsSync(options.envPath)) {
    const answers = options.answersPath ? answersFromFile(options.answersPath) : await askAnswers();
    await writeNewEnvironment(options.envPath, buildProductionEnvironment(answers));
    console.log(`Configuração segura criada em ${options.envPath} com permissão 0600.`);
    console.log("As senhas e chaves foram geradas localmente e não foram exibidas.");
  } else {
    console.log(`Configuração existente preservada: ${options.envPath}.`);
  }

  if (options.configureOnly || !options.deploy) {
    console.log("Execute a pré-validação e configure o DNS interno antes da implantação.");
    console.log("Para implantar: sudo /usr/bin/env node scripts/install-sagep.mjs --deploy --clone-frontend --confirm-deploy IMPLANTAR");
    return;
  }
  if (!options.confirmDeploy) throw new Error("A implantação exige --confirm-deploy IMPLANTAR");
  deploy(options.envPath, options.cloneFrontend);
  await installFirewallService(options.envPath);
  const deployedEnvironment = parseEnvironmentFile(fs.readFileSync(options.envPath, "utf8"));
  const httpsPort = deployedEnvironment.SAGEP_HTTPS_PORT || "443";
  const portSuffix = httpsPort === "443" ? "" : `:${httpsPort}`;
  console.log(`Implantação concluída. Acesse https://${deployedEnvironment.SAGEP_HOSTNAME}${portSuffix}/setup`);
  console.log("O certificado raiz público para preparar a estação administrativa está em deployment-output/sagep-om-root-ca.crt.");
  console.log("Após criar o administrador, remova a chave temporária com --finalize --confirm-finalize REMOVER-CHAVE.");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[BLOQUEIO] ${error instanceof Error ? error.message : "Falha no instalador"}`);
    process.exitCode = 1;
  });
}
