import { execFile } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import dns from "node:dns";
import { promises as fs } from "node:fs";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { AuditService } from "../audit/audit.service.js";
import type { InitializeInternalCertificateInput, UpdateDeploymentInput } from "./deployment.schemas.js";
import { evaluateDeploymentPreflight } from "./deployment-preflight.js";
import { getCertificateRenewalAlert } from "./certificate-lifecycle.js";

const runFile = promisify(execFile);
const auditService = new AuditService();
const CONFIGURATION_ID = "default";
const ROOT_CERT = "sagep-om-root-ca.crt";
const ROOT_KEY = "sagep-om-root-ca.key";
const SERVER_CERT = "server.crt";
const SERVER_KEY = "server.key";
let certificateOperationInProgress = false;
let opensslAvailabilityCache: { checkedAt: number; available: boolean } | null = null;

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

async function directoryStatus(id: string, label: string, directoryPath: string) {
  try {
    const stats = await fs.stat(directoryPath);
    if (!stats.isDirectory()) return { id, label, path: directoryPath, exists: true, writable: false };
    try {
      await fs.access(directoryPath, fsConstants.W_OK);
      return { id, label, path: directoryPath, exists: true, writable: true };
    } catch {
      return { id, label, path: directoryPath, exists: true, writable: false };
    }
  } catch {
    return { id, label, path: directoryPath, exists: false, writable: false };
  }
}

function certificateFingerprint(certificate: X509Certificate) {
  return certificate.fingerprint256.replaceAll(":", "").toUpperCase();
}

function formatFingerprint(fingerprint: string) {
  return fingerprint.match(/.{1,2}/g)?.join(":") ?? fingerprint;
}

async function opensslAvailable() {
  if (opensslAvailabilityCache && Date.now() - opensslAvailabilityCache.checkedAt < 300_000) {
    return opensslAvailabilityCache.available;
  }
  let available = true;
  try {
    await runFile("openssl", ["version"], { timeout: 5_000 });
  } catch {
    available = false;
  }
  opensslAvailabilityCache = { checkedAt: Date.now(), available };
  return available;
}

async function withCertificateOperationLock<T>(operation: () => Promise<T>) {
  if (certificateOperationInProgress) {
    throw new AppError("Já existe uma operação de certificado em andamento", 409, "CERTIFICATE_OPERATION_IN_PROGRESS");
  }
  certificateOperationInProgress = true;
  try {
    return await operation();
  } finally {
    certificateOperationInProgress = false;
  }
}

export async function getDeploymentCertificateStatus() {
  const certificatePath = path.join(env.DEPLOYMENT_TLS_DIRECTORY, SERVER_CERT);
  const rootPath = path.join(env.DEPLOYMENT_PKI_DIRECTORY, ROOT_CERT);
  const toolAvailable = await opensslAvailable();

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
    const status = daysRemaining < 0 ? "EXPIRED" as const : daysRemaining <= 30 ? "EXPIRING" as const : "VALID" as const;
    return {
      configured: true,
      toolAvailable,
      status,
      subject: server.subject,
      issuer: server.issuer,
      validFrom: new Date(server.validFrom).toISOString(),
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
      fingerprintSha256: formatFingerprint(certificateFingerprint(server)),
      rootFingerprintSha256: formatFingerprint(certificateFingerprint(root)),
      renewalAlert: getCertificateRenewalAlert(status, daysRemaining),
    };
  } catch {
    return { configured: false, toolAvailable, status: "INVALID" as const };
  }
}

async function installGeneratedFile(source: string, destination: string, mode: number) {
  const pending = `${destination}.next-${process.pid}-${Date.now()}`;
  try {
    await fs.copyFile(source, pending);
    await fs.chmod(pending, mode);
    await fs.rename(pending, destination);
  } finally {
    await fs.rm(pending, { force: true });
  }
}

async function issueServerCertificate(hostName: string, rootCert: string, rootKey: string, temporaryDirectory: string) {
  const serverCert = path.join(temporaryDirectory, SERVER_CERT);
  const serverKey = path.join(temporaryDirectory, SERVER_KEY);
  const request = path.join(temporaryDirectory, "server.csr");
  const extensions = path.join(temporaryDirectory, "server.ext");

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

  return { serverCert, serverKey };
}

async function generateInternalCertificate(hostName: string) {
  await fs.mkdir(env.DEPLOYMENT_PKI_DIRECTORY, { recursive: true, mode: 0o700 });
  await fs.mkdir(env.DEPLOYMENT_TLS_DIRECTORY, { recursive: true, mode: 0o700 });
  const temporaryDirectory = await fs.mkdtemp(path.join(env.DEPLOYMENT_PKI_DIRECTORY, ".generate-"));
  const rootCert = path.join(temporaryDirectory, ROOT_CERT);
  const rootKey = path.join(temporaryDirectory, ROOT_KEY);

  try {
    await runFile("openssl", [
      "req", "-x509", "-newkey", "rsa:4096", "-sha256", "-days", "3650", "-nodes",
      "-keyout", rootKey, "-out", rootCert,
      "-subj", "/CN=SAGEP OM Internal Root CA/O=SAGEP",
      "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
      "-addext", "keyUsage=critical,keyCertSign,cRLSign",
    ], { timeout: 120_000 });
    const server = await issueServerCertificate(hostName, rootCert, rootKey, temporaryDirectory);
    await installGeneratedFile(rootKey, path.join(env.DEPLOYMENT_PKI_DIRECTORY, ROOT_KEY), 0o600);
    await installGeneratedFile(rootCert, path.join(env.DEPLOYMENT_PKI_DIRECTORY, ROOT_CERT), 0o644);
    await installGeneratedFile(server.serverKey, path.join(env.DEPLOYMENT_TLS_DIRECTORY, SERVER_KEY), 0o600);
    await installGeneratedFile(server.serverCert, path.join(env.DEPLOYMENT_TLS_DIRECTORY, SERVER_CERT), 0o644);
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
    return { ...serializable(configuration), certificate: await getDeploymentCertificateStatus() };
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
    return { ...serializable(updated), certificate: await getDeploymentCertificateStatus() };
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
      environmentHostName: env.SAGEP_HOSTNAME ?? null, bindIp: env.SAGEP_BIND_IP ?? null,
      systemDnsServers: dns.getServers(), configuredHostName: configuration.deploymentHostName,
      resolvedAddresses, dnsError,
      expectedIpMatches: !configuration.deploymentExpectedIp || env.SAGEP_BIND_IP === configuration.deploymentExpectedIp || addresses.some((item) => item.address === configuration.deploymentExpectedIp),
      dnsMatchesExpectedIp: !configuration.deploymentExpectedIp || resolvedAddresses.includes(configuration.deploymentExpectedIp),
    };
  }

  async preflight() {
    const [configuration, userCount, certificate, directories] = await Promise.all([
      getConfiguration(),
      prisma.user.count(),
      getDeploymentCertificateStatus(),
      Promise.all([
        directoryStatus("backups", "Volume de backups", env.BACKUP_DIRECTORY),
        directoryStatus("pki", "Volume protegido da autoridade", env.DEPLOYMENT_PKI_DIRECTORY),
        directoryStatus("tls", "Volume TLS do proxy", env.DEPLOYMENT_TLS_DIRECTORY),
      ]),
    ]);
    const diagnostics = await this.diagnostics();

    return evaluateDeploymentPreflight({
      nodeMajorVersion: Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10),
      nodeEnvironment: env.NODE_ENV,
      cookieSecure: env.AUTH_COOKIE_SECURE,
      trustProxyHops: env.TRUST_PROXY_HOPS,
      corsOrigins: env.CORS_ALLOWED_ORIGINS,
      publicRegistrationAllowed: env.ALLOW_PUBLIC_REGISTRATION,
      setupTokenConfigured: Boolean(env.SAGEP_SETUP_TOKEN),
      userCount,
      hostName: configuration.deploymentHostName,
      environmentHostName: env.SAGEP_HOSTNAME ?? null,
      bindIp: env.SAGEP_BIND_IP ?? null,
      expectedIp: configuration.deploymentExpectedIp,
      expectedIpMatches: diagnostics.expectedIpMatches,
      dnsMatchesExpectedIp: diagnostics.dnsMatchesExpectedIp,
      dnsError: diagnostics.dnsError,
      allowedNetworks: configuration.deploymentAllowedNetworks,
      opensslAvailable: certificate.toolAvailable,
      certificateStatus: certificate.status,
      directories,
    });
  }

  async initializeInternalCertificate(input: InitializeInternalCertificateInput, actor: Actor) {
    const current = await getDeploymentCertificateStatus();
    if (current.configured && !input.rotate) {
      throw new AppError("Já existe um certificado interno. Confirme a rotação para substituí-lo", 409, "CERTIFICATE_ALREADY_CONFIGURED");
    }
    await withCertificateOperationLock(() => generateInternalCertificate(input.hostName));
    await prisma.systemConfiguration.update({
      where: { id: CONFIGURATION_ID },
      data: { deploymentHostName: input.hostName, deploymentCertificateMode: "INTERNAL_CA", updatedById: actor.id },
    });
    await auditService.log({
      entityType: "SYSTEM_SETTINGS", entityId: CONFIGURATION_ID, action: "UPDATE", actor,
      summary: current.configured ? "Certificado HTTPS interno rotacionado" : "Certificado HTTPS interno inicializado",
      metadata: { hostName: input.hostName, rootRotated: current.configured },
    });
    return getDeploymentCertificateStatus();
  }

  async renewServerCertificate(actor: Actor) {
    const configuration = await getConfiguration();
    if (!configuration.deploymentHostName) {
      throw new AppError("Configure o nome DNS antes de renovar o certificado", 409, "DEPLOYMENT_HOSTNAME_NOT_CONFIGURED");
    }

    const rootCert = path.join(env.DEPLOYMENT_PKI_DIRECTORY, ROOT_CERT);
    const rootKey = path.join(env.DEPLOYMENT_PKI_DIRECTORY, ROOT_KEY);
    if (!(await fileExists(rootCert)) || !(await fileExists(rootKey))) {
      throw new AppError("A autoridade interna da OM não está disponível", 409, "CERTIFICATE_AUTHORITY_NOT_CONFIGURED");
    }

    const before = await getDeploymentCertificateStatus();
    try {
      const root = new X509Certificate(await fs.readFile(rootCert, "utf8"));
      const rootDaysRemaining = Math.floor((new Date(root.validTo).getTime() - Date.now()) / 86_400_000);
      if (rootDaysRemaining <= 430) {
        throw new AppError("A autoridade raiz está próxima do vencimento e precisa ser rotacionada", 409, "CERTIFICATE_AUTHORITY_EXPIRING", { rootDaysRemaining });
      }

      await withCertificateOperationLock(async () => {
        await fs.mkdir(env.DEPLOYMENT_TLS_DIRECTORY, { recursive: true, mode: 0o700 });
        const temporaryDirectory = await fs.mkdtemp(path.join(env.DEPLOYMENT_PKI_DIRECTORY, ".renew-"));
        try {
          const server = await issueServerCertificate(configuration.deploymentHostName!, rootCert, rootKey, temporaryDirectory);
          await installGeneratedFile(server.serverKey, path.join(env.DEPLOYMENT_TLS_DIRECTORY, SERVER_KEY), 0o600);
          await installGeneratedFile(server.serverCert, path.join(env.DEPLOYMENT_TLS_DIRECTORY, SERVER_CERT), 0o644);
        } finally {
          await fs.rm(temporaryDirectory, { recursive: true, force: true });
        }
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Não foi possível renovar o certificado do servidor", 503, "CERTIFICATE_RENEWAL_FAILED", {
        reason: error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT" ? "OPENSSL_OR_AUTHORITY_NOT_FOUND" : "RENEWAL_FAILED",
      });
    }

    const renewed = await getDeploymentCertificateStatus();
    await auditService.log({
      entityType: "SYSTEM_SETTINGS", entityId: CONFIGURATION_ID, action: "UPDATE", actor,
      summary: "Certificado HTTPS do servidor renovado sem rotação da autoridade",
      metadata: {
        hostName: configuration.deploymentHostName,
        rootRotated: false,
        previousFingerprintSha256: before.fingerprintSha256 ?? null,
        renewedFingerprintSha256: renewed.fingerprintSha256 ?? null,
        rootFingerprintSha256: renewed.rootFingerprintSha256 ?? null,
      },
    });
    return { ...renewed, proxyRestartRequired: true };
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
