import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnvironmentFile } from "./env-file.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const frontendRoot = path.resolve(projectRoot, "../sagep-web");
const defaultEnvPath = path.join(projectRoot, ".env");
const stateDirectory = path.join(projectRoot, ".deployment-updates");
const branchName = "upgrade-security";
const manifestFormat = "SAGEP_DEPLOYMENT_UPDATE_V1";
const commitPattern = /^[0-9a-f]{40}$/i;
const expectedRepositories = {
  backend: "https://github.com/limachluiz/sagep-backend",
  frontend: "https://github.com/limachluiz/sagep-web",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: "utf8",
    input: options.input,
    stdio: options.inherit ? "inherit" : "pipe",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = String(result.stderr || result.stdout || "").trim().slice(-2000);
    throw new Error(`${command} ${args.join(" ")} falhou${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function git(args, cwd) {
  return String(run("git", args, { cwd }).stdout).trim();
}

export function validatePinnedCommit(value, label = "commit") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!commitPattern.test(normalized)) {
    throw new Error(`${label} deve ser informado como SHA Git completo de 40 caracteres`);
  }
  return normalized;
}

export function createUpdateId(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("Data inválida para a atualização");
  return now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

export function parseUpdateArguments(argv) {
  const valueAfter = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const rollbackId = valueAfter("--rollback");
  return {
    mode: rollbackId ? "rollback" : argv.includes("--apply") ? "apply" : "check",
    backendRef: valueAfter("--backend-ref"),
    frontendRef: valueAfter("--frontend-ref"),
    envPath: path.resolve(valueAfter("--env") || defaultEnvPath),
    rollbackId,
    confirmUpdate: valueAfter("--confirm-update") === "ATUALIZAR",
    confirmRollback: valueAfter("--confirm-rollback") === "REVERTER",
    restoreDatabase: argv.includes("--restore-database"),
    confirmDatabase: valueAfter("--confirm-database") === "RESTAURAR-BANCO",
  };
}

export function validateUpdateManifest(manifest) {
  if (!manifest || manifest.format !== manifestFormat) throw new Error("Manifesto de atualização inválido");
  if (!/^\d{14}$/.test(String(manifest.id || ""))) throw new Error("Identificador de atualização inválido");
  const repositories = [
    [manifest.backend, projectRoot, "backend"],
    [manifest.frontend, frontendRoot, "frontend"],
  ];
  for (const [repository, expectedDirectory, label] of repositories) {
    validatePinnedCommit(repository?.before, "commit anterior");
    validatePinnedCommit(repository?.target, "commit de destino");
    if (path.resolve(String(repository?.directory || "")) !== expectedDirectory) {
      throw new Error(`Diretório de ${label} inválido no manifesto`);
    }
  }
  if (!Array.isArray(manifest.images) || manifest.images.length !== 2) throw new Error("Manifesto sem imagens de rollback");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(manifest.databaseBackup?.id || ""))) {
    throw new Error("Backup de banco inválido no manifesto");
  }
  const expectedImages = new Map([["api", "sagep_api"], ["frontend", "sagep_frontend"]]);
  if (new Set(manifest.images.map((image) => image?.service)).size !== 2) throw new Error("Imagens duplicadas no manifesto");
  for (const image of manifest.images) {
    if (expectedImages.get(image?.service) !== image?.container) throw new Error("Serviço de imagem inválido no manifesto");
    if (!/^sha256:[0-9a-f]{64}$/i.test(String(image?.imageId || ""))) throw new Error("ID de imagem inválido no manifesto");
    if (!/^[a-z0-9][a-z0-9._/-]*:[a-z0-9][a-z0-9._-]*$/i.test(String(image?.rollbackTag || ""))) {
      throw new Error("Tag de imagem inválida no manifesto");
    }
    if (image.rollbackTag !== `sagep-rollback-${image.service}:${manifest.id}`) throw new Error("Tag de rollback divergente do manifesto");
    if (!/^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9][a-z0-9._-]*)?$/i.test(String(image?.imageName || ""))) {
      throw new Error("Nome de imagem inválido no manifesto");
    }
  }
  return manifest;
}

function assertRoot() {
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    throw new Error("A atualização deve ser executada com sudo");
  }
}

function assertProtectedEnvironment(envPath) {
  const stats = fs.lstatSync(envPath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("O .env deve ser um arquivo regular");
  if ((stats.mode & 0o077) !== 0) throw new Error("O .env deve permanecer com permissão 0600");
}

function normalizeRepositoryUrl(value) {
  return String(value || "").trim().replace(/\.git\/?$/i, "").replace(/\/$/, "").toLowerCase();
}

function repositoryState(directory, label, expectedUrl) {
  if (!fs.existsSync(path.join(directory, ".git"))) throw new Error(`${label} não encontrado em ${directory}`);
  const origin = normalizeRepositoryUrl(git(["remote", "get-url", "origin"], directory));
  if (origin !== normalizeRepositoryUrl(expectedUrl)) throw new Error(`${label} possui origem Git não autorizada`);
  const branch = git(["branch", "--show-current"], directory);
  if (branch !== branchName) throw new Error(`${label} deve estar na branch ${branchName}`);
  const changes = git(["status", "--porcelain", "--untracked-files=normal"], directory);
  if (changes) throw new Error(`${label} possui alterações locais; preserve ou reverta antes de atualizar`);
  return { directory, before: git(["rev-parse", "HEAD"], directory) };
}

function fetchCandidate(directory) {
  git(["fetch", "--quiet", "origin", branchName], directory);
  return git(["rev-parse", `origin/${branchName}`], directory);
}

function assertFastForward(repository, target, label) {
  const pinned = validatePinnedCommit(target, `${label}: commit de destino`);
  const remote = git(["rev-parse", `origin/${branchName}`], repository.directory).toLowerCase();
  if (pinned !== remote) throw new Error(`${label}: o SHA informado não corresponde ao topo remoto de ${branchName}`);
  const ancestry = run("git", ["merge-base", "--is-ancestor", repository.before, pinned], {
    cwd: repository.directory,
    allowFailure: true,
  });
  if (ancestry.status !== 0) throw new Error(`${label}: atualização não é fast-forward; operação bloqueada`);
  return { ...repository, target: pinned };
}

function candidateStatus(repository, candidate) {
  if (repository.before === candidate) return "CURRENT";
  const candidateAhead = run("git", ["merge-base", "--is-ancestor", repository.before, candidate], {
    cwd: repository.directory,
    allowFailure: true,
  }).status === 0;
  if (candidateAhead) return "UPDATE_AVAILABLE";
  const localAhead = run("git", ["merge-base", "--is-ancestor", candidate, repository.before], {
    cwd: repository.directory,
    allowFailure: true,
  }).status === 0;
  return localAhead ? "LOCAL_AHEAD" : "DIVERGED";
}

async function ensureStateDirectory() {
  await fsp.mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await fsp.chmod(stateDirectory, 0o700);
}

function manifestPath(id) {
  if (!/^\d{14}$/.test(String(id || ""))) throw new Error("Identificador de rollback inválido");
  return path.join(stateDirectory, `${id}.json`);
}

async function writeManifest(manifest) {
  await ensureStateDirectory();
  const finalPath = manifestPath(manifest.id);
  const temporary = `${finalPath}.next-${process.pid}`;
  await fsp.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await fsp.rename(temporary, finalPath);
  await fsp.chmod(finalPath, 0o600);
}

async function readManifest(id) {
  const content = await fsp.readFile(manifestPath(id), "utf8");
  return validateUpdateManifest(JSON.parse(content));
}

function composeArgs(envPath, args) {
  return ["compose", "--env-file", envPath, "--profile", "https", ...args];
}

function dockerCompose(envPath, args, options = {}) {
  return run("docker", composeArgs(envPath, args), options);
}

function parseMarkedJson(output, marker) {
  const line = String(output).split(/\r?\n/).find((item) => item.startsWith(marker));
  if (!line) throw new Error("O container não devolveu o comprovante esperado");
  return JSON.parse(line.slice(marker.length));
}

function createDatabaseBackup(envPath) {
  const marker = "SAGEP_UPDATE_BACKUP=";
  const code = [
    'const [{ backupsService }, { prisma }] = await Promise.all([import("./dist/modules/backups/backups.service.js"), import("./dist/config/prisma.js")]);',
    'try { const backup = await backupsService.create("SAFETY", { name: "Atualizador seguro do SAGEP" }); console.log("SAGEP_UPDATE_BACKUP=" + JSON.stringify(backup)); }',
    "finally { await prisma.$disconnect(); }",
  ].join(" ");
  const result = dockerCompose(envPath, ["exec", "-T", "api", "node", "--input-type=module", "-e", code]);
  const backup = parseMarkedJson(result.stdout, marker);
  if (!backup.id || backup.verified !== true || !backup.checksumSha256) throw new Error("O backup pré-atualização não foi validado");
  return backup;
}

function restoreDatabaseBackup(envPath, backupId) {
  const marker = "SAGEP_UPDATE_RESTORE=";
  const code = [
    'const [{ backupsService }, { prisma }] = await Promise.all([import("./dist/modules/backups/backups.service.js"), import("./dist/config/prisma.js")]);',
    `try { const restored = await backupsService.restore(${JSON.stringify(backupId)}, { name: "Rollback seguro do SAGEP" }); console.log("SAGEP_UPDATE_RESTORE=" + JSON.stringify(restored)); }`,
    "finally { await prisma.$disconnect(); }",
  ].join(" ");
  const result = dockerCompose(envPath, ["run", "--rm", "--no-deps", "api", "node", "--input-type=module", "-e", code]);
  return parseMarkedJson(result.stdout, marker);
}

function captureImage(container, service, updateId) {
  const output = String(run("docker", ["inspect", "--format={{.Image}}|{{.Config.Image}}", container]).stdout).trim();
  const [imageId, imageName] = output.split("|");
  if (!imageId || !imageName) throw new Error(`Não foi possível preservar a imagem de ${service}`);
  const rollbackTag = `sagep-rollback-${service}:${updateId}`;
  run("docker", ["image", "tag", imageId, rollbackTag]);
  return { service, container, imageId, imageName, rollbackTag };
}

function restoreImages(images) {
  for (const image of images) run("docker", ["image", "tag", image.rollbackTag || image.imageId, image.imageName]);
}

function moveRepository(repository, commit, mode) {
  if (mode === "update") git(["merge", "--ff-only", commit], repository.directory);
  else git(["reset", "--hard", commit], repository.directory);
}

function applyFirewall(envPath) {
  run(process.execPath, [path.join(scriptDirectory, "manage-firewall.mjs"), "--apply", "--env", envPath], { inherit: true });
}

async function waitForHealth(environment, attempts = 30, delayMs = 2000) {
  const port = Number(environment.API_PORT || environment.PORT || 3000);
  const url = `http://127.0.0.1:${port}/api/health/status`;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return { url, attempt };
    } catch {
      // O container pode estar reiniciando enquanto migrations são aplicadas.
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`A API não ficou saudável em ${url}`);
}

function assertContainersRunning() {
  for (const container of ["sagep_postgres", "sagep_api", "sagep_frontend", "sagep_proxy"]) {
    const running = String(run("docker", ["inspect", "--format={{.State.Running}}", container]).stdout).trim();
    if (running !== "true") throw new Error(`Container obrigatório indisponível: ${container}`);
  }
}

async function rollbackRuntime(manifest, envPath, restoreDatabase) {
  repositoryState(projectRoot, "Backend", expectedRepositories.backend);
  repositoryState(frontendRoot, "Frontend", expectedRepositories.frontend);
  moveRepository(manifest.backend, manifest.backend.before, "rollback");
  moveRepository(manifest.frontend, manifest.frontend.before, "rollback");
  restoreImages(manifest.images);
  let databaseRestore = null;
  if (restoreDatabase) {
    dockerCompose(envPath, ["stop", "caddy", "api"], { inherit: true });
    databaseRestore = restoreDatabaseBackup(envPath, manifest.databaseBackup.id);
  }
  dockerCompose(envPath, ["up", "-d", "--no-build"], { inherit: true });
  const environment = parseEnvironmentFile(await fsp.readFile(envPath, "utf8"));
  await waitForHealth(environment);
  assertContainersRunning();
  applyFirewall(envPath);
  return databaseRestore;
}

async function check() {
  const backend = repositoryState(projectRoot, "Backend", expectedRepositories.backend);
  const frontend = repositoryState(frontendRoot, "Frontend", expectedRepositories.frontend);
  const backendTarget = fetchCandidate(projectRoot);
  const frontendTarget = fetchCandidate(frontendRoot);
  const backendStatus = candidateStatus(backend, backendTarget);
  const frontendStatus = candidateStatus(frontend, frontendTarget);
  console.log(JSON.stringify({
    branch: branchName,
    backend: { current: backend.before, candidate: backendTarget, status: backendStatus, updateAvailable: backendStatus === "UPDATE_AVAILABLE" },
    frontend: { current: frontend.before, candidate: frontendTarget, status: frontendStatus, updateAvailable: frontendStatus === "UPDATE_AVAILABLE" },
  }, null, 2));
}

async function applyUpdate(options) {
  assertRoot();
  if (!options.confirmUpdate) throw new Error("A atualização exige --confirm-update ATUALIZAR");
  assertProtectedEnvironment(options.envPath);
  const backendState = repositoryState(projectRoot, "Backend", expectedRepositories.backend);
  const frontendState = repositoryState(frontendRoot, "Frontend", expectedRepositories.frontend);
  fetchCandidate(projectRoot);
  fetchCandidate(frontendRoot);
  const backend = assertFastForward(backendState, options.backendRef, "Backend");
  const frontend = assertFastForward(frontendState, options.frontendRef, "Frontend");
  if (backend.before === backend.target && frontend.before === frontend.target) throw new Error("Os dois repositórios já estão nos commits informados");

  run(process.execPath, [path.join(scriptDirectory, "check-deployment-preflight.mjs"), options.envPath], { inherit: true });
  dockerCompose(options.envPath, ["config", "--quiet"]);
  assertContainersRunning();

  const id = createUpdateId();
  if (fs.existsSync(manifestPath(id))) throw new Error("Já existe uma atualização iniciada neste segundo; tente novamente");
  const manifest = {
    format: manifestFormat,
    id,
    status: "PREPARING",
    startedAt: new Date().toISOString(),
    completedAt: null,
    backend,
    frontend,
    databaseBackup: createDatabaseBackup(options.envPath),
    images: [captureImage("sagep_api", "api", id), captureImage("sagep_frontend", "frontend", id)],
    error: null,
  };
  await writeManifest(manifest);

  try {
    manifest.status = "APPLYING";
    await writeManifest(manifest);
    moveRepository(backend, backend.target, "update");
    moveRepository(frontend, frontend.target, "update");
    dockerCompose(options.envPath, ["build", "api", "frontend"], { inherit: true });
    dockerCompose(options.envPath, ["up", "-d", "--no-build"], { inherit: true });
    const environment = parseEnvironmentFile(await fsp.readFile(options.envPath, "utf8"));
    const health = await waitForHealth(environment);
    assertContainersRunning();
    applyFirewall(options.envPath);
    manifest.status = "SUCCEEDED";
    manifest.completedAt = new Date().toISOString();
    manifest.health = health;
    await writeManifest(manifest);
    console.log(`Atualização ${id} concluída e validada.`);
  } catch (error) {
    manifest.error = error instanceof Error ? error.message : String(error);
    try {
      await rollbackRuntime(manifest, options.envPath, false);
      manifest.status = "ROLLED_BACK_AUTOMATIC";
    } catch (rollbackError) {
      manifest.status = "ROLLBACK_FAILED";
      manifest.rollbackError = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
    }
    manifest.completedAt = new Date().toISOString();
    await writeManifest(manifest);
    throw new Error(`A atualização falhou. Estado: ${manifest.status}. Manifesto: ${manifestPath(id)}`);
  }
}

async function rollback(options) {
  assertRoot();
  if (!options.confirmRollback) throw new Error("O rollback exige --confirm-rollback REVERTER");
  if (options.restoreDatabase && !options.confirmDatabase) {
    throw new Error("A restauração do banco exige --confirm-database RESTAURAR-BANCO");
  }
  assertProtectedEnvironment(options.envPath);
  const manifest = await readManifest(options.rollbackId);
  const databaseRestore = await rollbackRuntime(manifest, options.envPath, options.restoreDatabase);
  manifest.status = options.restoreDatabase ? "ROLLED_BACK_WITH_DATABASE" : "ROLLED_BACK_MANUAL";
  manifest.completedAt = new Date().toISOString();
  manifest.databaseRestore = databaseRestore;
  await writeManifest(manifest);
  console.log(`Rollback ${manifest.id} concluído e validado.`);
}

async function main() {
  const options = parseUpdateArguments(process.argv.slice(2));
  if (options.mode === "check") return check();
  if (options.mode === "apply") return applyUpdate(options);
  return rollback(options);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[BLOQUEIO] ${error instanceof Error ? error.message : "Falha na atualização"}`);
    process.exitCode = 1;
  });
}
