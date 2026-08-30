import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";

let activeSetupToken = env.SAGEP_SETUP_TOKEN;
let generatedToken = false;

async function readStoredToken() {
  try {
    const value = (await fs.readFile(env.SAGEP_SETUP_TOKEN_FILE, "utf8")).trim();
    return value.length >= 32 ? value : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function createStoredToken() {
  const token = randomBytes(32).toString("hex");
  await fs.mkdir(path.dirname(env.SAGEP_SETUP_TOKEN_FILE), { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(env.SAGEP_SETUP_TOKEN_FILE, `${token}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return readStoredToken();
    throw error;
  }
}

export async function initializeSetupToken() {
  const requiresSetup = await prisma.user.count() === 0;
  if (!requiresSetup) {
    if (!env.SAGEP_SETUP_TOKEN) await fs.rm(env.SAGEP_SETUP_TOKEN_FILE, { force: true });
    activeSetupToken = env.SAGEP_SETUP_TOKEN;
    return;
  }

  if (!activeSetupToken) {
    activeSetupToken = await readStoredToken() ?? await createStoredToken();
    generatedToken = true;
  }

  if (generatedToken) {
    console.log("\n============================================================");
    console.log("SAGEP - PRIMEIRA INICIALIZAÇÃO");
    console.log(`Chave de instalação: ${activeSetupToken}`);
    console.log("Informe esta chave na tela de configuração inicial.");
    console.log("Ela será removida automaticamente após criar o administrador.");
    console.log("============================================================\n");
  }
}

export function getSetupToken() {
  return activeSetupToken;
}

export function setupTokenWasGenerated() {
  return generatedToken;
}

export async function removeGeneratedSetupToken() {
  if (!generatedToken) return;
  activeSetupToken = undefined;
  generatedToken = false;
  await fs.rm(env.SAGEP_SETUP_TOKEN_FILE, { force: true });
}
