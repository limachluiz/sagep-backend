import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnvironmentFile, quoteEnvironmentValue } from "./env-file.mjs";
import { buildProductionEnvironment, generateInstallerSecrets } from "./install-sagep.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const defaultEnvironmentPath = path.join(projectRoot, ".env.homolog");

export const homologationDefaults = Object.freeze({
  hostName: "sagep.homolog.test",
  bindIp: "192.168.250.10",
  allowedNetworks: "192.168.250.0/24",
  pgAdminEmail: "admin@sagep.example.com",
  apiPort: "53000",
  postgresPort: "55432",
  pgAdminPort: "55051",
  httpPort: "58080",
  httpsPort: "58443",
  composeProject: "sagep-homolog",
  resourcePrefix: "sagep_homolog",
});

export function buildHomologationEnvironment(secrets = generateInstallerSecrets()) {
  const base = parseEnvironmentFile(buildProductionEnvironment(homologationDefaults, secrets));
  const values = {
    ...base,
    DATABASE_URL: base.DATABASE_URL.replace("localhost:5432", `localhost:${homologationDefaults.postgresPort}`),
    CORS_ALLOWED_ORIGINS: `https://${homologationDefaults.hostName}:${homologationDefaults.httpsPort}`,
    API_PORT: homologationDefaults.apiPort,
    POSTGRES_PORT: homologationDefaults.postgresPort,
    PGADMIN_PORT: homologationDefaults.pgAdminPort,
    SAGEP_HTTP_PORT: homologationDefaults.httpPort,
    SAGEP_HTTPS_PORT: homologationDefaults.httpsPort,
    SAGEP_FIREWALL_NAMESPACE: "SAGEP-HML",
    SAGEP_COMPOSE_PROJECT: homologationDefaults.composeProject,
    SAGEP_CONTAINER_PREFIX: homologationDefaults.resourcePrefix,
    SAGEP_VOLUME_PREFIX: homologationDefaults.resourcePrefix,
  };
  return `${Object.entries(values).map(([key, value]) => `${key}=${quoteEnvironmentValue(value)}`).join("\n")}\n`;
}

export function validateHomologationEnvironment(values) {
  const expected = {
    NODE_ENV: "production",
    SAGEP_HOSTNAME: homologationDefaults.hostName,
    SAGEP_BIND_IP: homologationDefaults.bindIp,
    SAGEP_ALLOWED_NETWORKS: homologationDefaults.allowedNetworks,
    PGADMIN_DEFAULT_EMAIL: homologationDefaults.pgAdminEmail,
    API_PORT: homologationDefaults.apiPort,
    POSTGRES_PORT: homologationDefaults.postgresPort,
    PGADMIN_PORT: homologationDefaults.pgAdminPort,
    SAGEP_HTTP_PORT: homologationDefaults.httpPort,
    SAGEP_HTTPS_PORT: homologationDefaults.httpsPort,
    SAGEP_FIREWALL_NAMESPACE: "SAGEP-HML",
    SAGEP_COMPOSE_PROJECT: homologationDefaults.composeProject,
    SAGEP_CONTAINER_PREFIX: homologationDefaults.resourcePrefix,
    SAGEP_VOLUME_PREFIX: homologationDefaults.resourcePrefix,
  };
  const mismatches = Object.entries(expected)
    .filter(([key, value]) => values[key] !== value)
    .map(([key]) => key);
  if (values.CORS_ALLOWED_ORIGINS !== `https://${homologationDefaults.hostName}:${homologationDefaults.httpsPort}`) {
    mismatches.push("CORS_ALLOWED_ORIGINS");
  }
  if (mismatches.length) throw new Error(`Configuração de homologação divergente: ${Array.from(new Set(mismatches)).join(", ")}`);
  return values;
}

async function atomicCreate(filePath, content) {
  const temporary = `${filePath}.prepare-${process.pid}`;
  let handle;
  try {
    handle = await fsp.open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fsp.link(temporary, filePath);
    await fsp.rm(temporary);
    await fsp.chmod(filePath, 0o600);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await fsp.rm(temporary, { force: true });
    throw error;
  }
}

function assertProtectedFile(filePath) {
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("O arquivo de homologação deve ser regular");
  if ((stats.mode & 0o077) !== 0) throw new Error("O arquivo de homologação deve possuir permissão 0600");
}

function runComposeValidation(environmentPath) {
  const result = spawnSync("docker", [
    "compose", "--env-file", environmentPath, "--profile", "https", "config", "--quiet",
  ], { cwd: projectRoot, encoding: "utf8", stdio: "pipe" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Docker Compose rejeitou a configuração: ${String(result.stderr || result.stdout).trim()}`);
}

export function runDeploymentPreflight(environmentPath, runner = spawnSync) {
  const result = runner(process.execPath, [
    path.join(scriptDirectory, "check-deployment-preflight.mjs"), environmentPath,
  ], { cwd: projectRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("A pré-validação da implantação encontrou bloqueios");
}

function parseArguments(argv) {
  const envIndex = argv.indexOf("--env");
  return {
    environmentPath: path.resolve(envIndex >= 0 ? argv[envIndex + 1] : defaultEnvironmentPath),
    checkOnly: argv.includes("--check"),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!fs.existsSync(options.environmentPath)) {
    if (options.checkOnly) throw new Error(`Arquivo ausente: ${options.environmentPath}`);
    await atomicCreate(options.environmentPath, buildHomologationEnvironment());
    console.log(`Configuração isolada criada em ${options.environmentPath} com permissão 0600.`);
    console.log("Senhas e chaves foram geradas localmente e não foram exibidas.");
  } else if (!options.checkOnly) {
    throw new Error(`O arquivo ${options.environmentPath} já existe e não será sobrescrito`);
  }

  assertProtectedFile(options.environmentPath);
  validateHomologationEnvironment(parseEnvironmentFile(await fsp.readFile(options.environmentPath, "utf8")));
  runComposeValidation(options.environmentPath);
  console.log("Configuração de homologação válida e isolada do projeto sagep-backend existente.");
  console.log(`Acesso HTTPS previsto: https://${homologationDefaults.hostName}:${homologationDefaults.httpsPort}`);
  if (options.checkOnly) runDeploymentPreflight(options.environmentPath);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[BLOQUEIO] ${error instanceof Error ? error.message : "Falha ao preparar homologação"}`);
    process.exitCode = 1;
  });
}
