import { execFile } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import dns from "node:dns";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { AuditService } from "../audit/audit.service.js";
import type { InitializeInternalCertificateInput, UpdateDeploymentInput } from "./deployment.schemas.js";

const runFile = promisify(execFile);
const auditService = new AuditService();
const CONFIGURATION_ID = "default";
const ROOT_CERT = "sagep-om-root-ca.crt";
const ROOT_KEY = "sagep-om-root-ca.key";
const SERVER_CERT = "server.crt";
const SERVER_KEY = "server.key";

type Actor = NonNullable<Express.Request["user"]>;

function normalizeNullable(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

async function getConfiguration() {
  return prisma.systemConfiguration.upsert({
    where: { id: CONFIGURATION_ID },
    update: {},
    create: { id: CONFIGURATION_ID },
  });
}

function serializable(configuration: Awaited<ReturnType<typeof getConfiguration>>) {
  return {
    id: configuration.id,
    hostName: configuration.deploymentHostName,
    expectedIp: configuration.deploymentExpectedIp,
    gateway: configuration.deploymentGateway,
    dnsServers: configuration.deploymentDnsServers,
    ntpServers: configuration.deploymentNtpServers,
    allowedNetworks: configuration.deploymentAllowedNetworks,
    proxyUrl: configuration.deploymentProxyUrl,
    certificateMode: configuration.deploymentCertificateMode,
    updatedAt: configuration.updatedAt,
  };
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function certificateFingerprint(certificate: X509Certificate) {
  return certificate.fingerprint256.replaceAll(":", "").toUpperCase();
}

function formatFingerprint(fingerprint: string) {
  return fingerprint.match(/.{1,2}/g)?.join(":") ?? fingerprint;
}

async function certificateStatus() {
  const certificatePath = path.join(env.DEPLOYMENT_TLS_DIRECTORY, SERVER_CERT);
  const rootPath = path.join(env.DEPLOYMENT_PKI_DIRECTORY, ROOT_CERT);
  let toolAvailable = true;
  try {
    await runFile("openssl", ["version"], { timeout: 5_000 });
  } catch {
    toolAvailable = false;
  }

  if (!(await fileExists(certificatePath)) || !(await fileExists(rootPath))) {
    return { configured: false, toolAvailable, status: "NOT_CONFIGURED" as const };
  }

  try {
    const [serverPem, rootPem] = await Promise.all([
      fs.readFile(certificatePath, "utf8"),
      fs.readFile(rootPath, "utf8"),
    ]);
    const server = new X509Certificate(serverPem);
    const root = new X509Certificate(rootPem);
    const expiresAt = new Date(server.validTo);
    const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
    return {
      configured: true,
      toolAvailable,
      status: daysRemaining < 0 ? "EXPIRED" as const : daysRemaining <= 30 ? "EXPIRING" as const : "VALID" as const,
      subject: server.subject,
      issuer: server.issuer,
      validFrom: new Date(server.validFrom).toISOString(),
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
      fingerprintSha256: formatFingerprint(certificateFingerprint(server)),
      rootFingerprintSha256: formatFingerprint(certificateFingerprint(root)),
    };
  } catch {
    return { configured: false, toolAvailable, status: "INVALID" as const };
  }
}

async function generateInternalCertificate(hostName: string) {
  await fs.mkdir(env.DEPLOYMENT_PKI_DIRECTORY, { recursive: true, mode: 0o700 });
  await fs.mkdir(env.DEPLOYMENT_TLS_DIRECTORY, { recursive: true, mode: 0o700 });
  const temporaryDirectory = await fs.mkdtemp(path.join(env.DEPLOYMENT_PKI_DIRECTORY, ".generate-"));
  const rootCert = path.join(temporaryDirectory, ROOT_CERT);
  const rootKey = path.join(temporaryDirectory, ROOT_KEY);
  const serverCert = path.join(temporaryDirectory, SERVER_CERT);
  const serverKey = path.join(temporaryDirectory, SERVER_KEY);
  const request = path.join(temporaryDirectory, "server.csr");
  const extensions = path.join(temporaryDirectory, "server.ext");

  try {
    await runFile("openssl", [
      "req", "-x509", "-newkey", "rsa:4096", "-sha256", "-days", "3650", "-nodes",
      "-keyout", rootKey, "-out", rootCert,
      "-subj", "/CN=SAGEP OM Internal Root CA/O=SAGEP",
      "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
      "-addext", "keyUsage=critical,keyCertSign,cRLSign",
    ], { timeout: 120_000 });
    await runFile("openssl", [
      "req", "-new", "-newkey", "rsa:3072", "-sha256", "-nodes",
      "-keyout", serverKey, "-out", request, "-subj", `/CN=${hostName}/O=SAGEP`,
    ], { timeout: 120_000 });
    await fs.writeFile(extensions, [
      "basicConstraints=critical,CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      `subjectAltName=DNS:${hostName}`,
    ].join("\n"), { mode: 0o600 });
    await runFile("openssl", [
      "x509", "-req", "-in", request, "-CA", rootCert, "-CAkey", rootKey,
      "-CAcreateserial", "-out", serverCert, "-days", "397", "-sha256", "-extfile", extensions,
    ], { timeout: 120_000 });

    for (const filename of [ROOT_CERT, ROOT_KEY, SERVER_CERT, SERVER_KEY]) {
      const destinationDirectory = filename.startsWith("server.") ? env.DEPLOYMENT_TLS_DIRECTORY : env.DEPLOYMENT_PKI_DIRECTORY;
      const destination = path.join(destinationDirectory, filename);
      await fs.copyFile(path.join(temporaryDirectory, filename), destination);
      await fs.chmod(destination, filename.endsWith(".key") ? 0o600 : 0o644);
    }
  } catch (error) {
    throw new AppError("Não foi possível emitir o certificado interno", 503, "CERTIFICATE_TOOL_UNAVAILABLE", {
      reason: error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT" ? "OPENSSL_NOT_FOUND" : "GENERATION_FAILED",
    });
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function windowsScripts(fingerprint: string) {
  return {
    install: `# Kit de confiança SAGEP - Windows 11\n$ErrorActionPreference = "Stop"\n$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())\nif (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Execute o PowerShell como Administrador." }\n$certPath = Join-Path $PSScriptRoot "${ROOT_CERT}"\n$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)\n$expected = "${fingerprint}"\n$actual = $cert.Thumbprint.ToUpperInvariant()\nif ($actual -ne $expected) { throw "Impressao digital divergente. Esperada: $expected; obtida: $actual" }\nImport-Certificate -FilePath $certPath -CertStoreLocation "Cert:\\LocalMachine\\Root" | Out-Null\nWrite-Host "Confianca SAGEP instalada. Thumbprint: $actual" -ForegroundColor Green\n`,
    verify: `$expected = "${fingerprint}"\n$cert = Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object Thumbprint -eq $expected\nif ($cert) { Write-Host "Certificado SAGEP confiavel e instalado." -ForegroundColor Green; exit 0 }\nWrite-Error "Certificado SAGEP nao encontrado."\n`,
    remove: `$ErrorActionPreference = "Stop"\n$expected = "${fingerprint}"\n$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())\nif (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Execute o PowerShell como Administrador." }\nGet-ChildItem Cert:\\LocalMachine\\Root | Where-Object Thumbprint -eq $expected | Remove-Item\nWrite-Host "Confianca SAGEP removida." -ForegroundColor Yellow\n`,
  };
}

function linuxScripts(fingerprint: string) {
  const verifyCertificate = `EXPECTED="${fingerprint}"\nCERT="$(cd "$(dirname "$0")" && pwd)/${ROOT_CERT}"\nACTUAL="$(openssl x509 -in "$CERT" -outform DER | sha256sum | awk '{print toupper($1)}')"\n[ "$ACTUAL" = "$EXPECTED" ] || { echo "Impressao digital divergente: $ACTUAL" >&2; exit 1; }\n`;
  return {
    install: `#!/usr/bin/env bash\nset -euo pipefail\n[ "$(id -u)" -eq 0 ] || { echo "Execute com sudo." >&2; exit 1; }\n${verifyCertificate}install -m 0644 "$CERT" /usr/local/share/ca-certificates/sagep-om-root-ca.crt\nupdate-ca-certificates\necho "Confianca SAGEP instalada."\n`,
    verify: `#!/usr/bin/env bash\nset -euo pipefail\n${verifyCertificate}[ -f /usr/local/share/ca-certificates/sagep-om-root-ca.crt ] && echo "Certificado SAGEP instalado."\n`,
    remove: `#!/usr/bin/env bash\nset -euo pipefail\n[ "$(id -u)" -eq 0 ] || { echo "Execute com sudo." >&2; exit 1; }\nrm -f /usr/local/share/ca-certificates/sagep-om-root-ca.crt\nupdate-ca-certificates --fresh\necho "Confianca SAGEP removida."\n`,
  };
}

export class DeploymentService {
  async get() {
    const configuration = await getConfiguration();
    return { ...serializable(configuration), certificate: await certificateStatus() };
  }

  async update(input: UpdateDeploymentInput, actor: Actor) {
    const before = await getConfiguration();
    const updated = await prisma.systemConfiguration.update({
      where: { id: CONFIGURATION_ID },
      data: {
        deploymentHostName: input.hostName,
        deploymentExpectedIp: normalizeNullable(input.expectedIp),
        deploymentGateway: normalizeNullable(input.gateway),
        deploymentDnsServers: input.dnsServers,
        deploymentNtpServers: input.ntpServers,
        deploymentAllowedNetworks: input.allowedNetworks,
        deploymentProxyUrl: normalizeNullable(input.proxyUrl),
        deploymentCertificateMode: input.certificateMode,
        updatedById: actor.id,
      },
    });
    await auditService.log({
      entityType: "SYSTEM_SETTINGS", entityId: CONFIGURATION_ID, action: "UPDATE", actor,
      summary: "Configuração de rede e HTTPS atualizada", before: serializable(before), after: serializable(updated),
    });
    return { ...serializable(updated), certificate: await certificateStatus() };
  }

  async diagnostics() {
    const configuration = await getConfiguration();
    const addresses = Object.entries(os.networkInterfaces()).flatMap(([interfaceName, entries]) =>
      (entries ?? []).filter((entry) => entry.family === "IPv4" && !entry.internal).map((entry) => ({
        interface: interfaceName, address: entry.address, netmask: entry.netmask, mac: entry.mac,
      })),
    );
    let resolvedAddresses: string[] = [];
    let dnsError: string | null = null;
    if (configuration.deploymentHostName) {
      try {
        resolvedAddresses = await dns.promises.resolve4(configuration.deploymentHostName);
      } catch (error) {
        dnsError = error instanceof Error ? error.message : "Falha de resolução DNS";
      }
    }
    return {
      checkedAt: new Date().toISOString(), hostName: os.hostname(), interfaces: addresses,
      systemDnsServers: dns.getServers(), configuredHostName: configuration.deploymentHostName,
      resolvedAddresses, dnsError,
      expectedIpMatches: !configuration.deploymentExpectedIp || addresses.some((item) => item.address === configuration.deploymentExpectedIp),
      dnsMatchesExpectedIp: !configuration.deploymentExpectedIp || resolvedAddresses.includes(configuration.deploymentExpectedIp),
    };
  }

  async initializeInternalCertificate(input: InitializeInternalCertificateInput, actor: Actor) {
    const current = await certificateStatus();
    if (current.configured && !input.rotate) {
      throw new AppError("Já existe um certificado interno. Confirme a rotação para substituí-lo", 409, "CERTIFICATE_ALREADY_CONFIGURED");
    }
    await generateInternalCertificate(input.hostName);
    await prisma.systemConfiguration.update({
      where: { id: CONFIGURATION_ID },
      data: { deploymentHostName: input.hostName, deploymentCertificateMode: "INTERNAL_CA", updatedById: actor.id },
    });
    await auditService.log({
      entityType: "SYSTEM_SETTINGS", entityId: CONFIGURATION_ID, action: "UPDATE", actor,
      summary: current.configured ? "Certificado HTTPS interno rotacionado" : "Certificado HTTPS interno inicializado",
      metadata: { hostName: input.hostName, rootRotated: current.configured },
    });
    return certificateStatus();
  }

  async trustKit(platform: "windows" | "linux", actor: Actor) {
    const rootPath = path.join(env.DEPLOYMENT_PKI_DIRECTORY, ROOT_CERT);
    if (!(await fileExists(rootPath))) {
      throw new AppError("Inicialize o certificado interno antes de gerar o kit de confiança", 409, "CERTIFICATE_NOT_CONFIGURED");
    }
    const rootPem = await fs.readFile(rootPath);
    const certificate = new X509Certificate(rootPem);
    const fingerprint = certificateFingerprint(certificate);
    const displayedFingerprint = formatFingerprint(fingerprint);
    const scripts = platform === "windows" ? windowsScripts(fingerprint) : linuxScripts(fingerprint);
    const zip = new JSZip();
    zip.file(ROOT_CERT, rootPem);
    zip.file("IMPRESSAO-DIGITAL-SHA256.txt", `${displayedFingerprint}\n`);
    zip.file("LEIA-ME.txt", `KIT DE CONFIANÇA SAGEP - ${platform === "windows" ? "WINDOWS 11" : "LINUX MINT / UBUNTU"}\n\nAntes de executar, confirme esta impressão digital por um canal confiável com o administrador da OM:\n${displayedFingerprint}\n\nA instalação exige privilégios administrativos. Nunca instale o certificado se a impressão digital for diferente.\n`);
    const extension = platform === "windows" ? "ps1" : "sh";
    zip.file(`instalar-confianca.${extension}`, scripts.install, { unixPermissions: platform === "linux" ? "755" : undefined });
    zip.file(`verificar-confianca.${extension}`, scripts.verify, { unixPermissions: platform === "linux" ? "755" : undefined });
    zip.file(`remover-confianca.${extension}`, scripts.remove, { unixPermissions: platform === "linux" ? "755" : undefined });
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: platform === "windows" ? "DOS" : "UNIX" });
    const digest = createHash("sha256").update(buffer).digest("hex");
    await auditService.log({
      entityType: "SYSTEM_SETTINGS", entityId: CONFIGURATION_ID, action: "EXPORT", actor,
      summary: `Kit de confiança ${platform} exportado`, metadata: { platform, archiveSha256: digest },
    });
    return { buffer, filename: `sagep-kit-confianca-${platform}.zip` };
  }
}

export const deploymentService = new DeploymentService();
