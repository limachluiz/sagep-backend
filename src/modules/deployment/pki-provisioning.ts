import { execFile } from "node:child_process";
import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { AppError } from "../../shared/app-error.js";

const runFile = promisify(execFile);

export const ROOT_CERT = "sagep-om-root-ca.crt";
export const ROOT_KEY = "sagep-om-root-ca.key";
export const SERVER_CERT = "server.crt";
export const SERVER_KEY = "server.key";

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function installGeneratedFile(source: string, destination: string, mode: number) {
  const pending = `${destination}.next-${process.pid}-${Date.now()}`;
  try {
    await fs.copyFile(source, pending);
    await fs.chmod(pending, mode);
    await fs.rename(pending, destination);
  } finally {
    await fs.rm(pending, { force: true });
  }
}

export async function issueServerCertificate(hostName: string, rootCert: string, rootKey: string, temporaryDirectory: string) {
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

export async function generateInternalCertificate(hostName: string, pkiDirectory: string, tlsDirectory: string) {
  await fs.mkdir(pkiDirectory, { recursive: true, mode: 0o700 });
  await fs.mkdir(tlsDirectory, { recursive: true, mode: 0o700 });
  const temporaryDirectory = await fs.mkdtemp(path.join(pkiDirectory, ".generate-"));
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
    await installGeneratedFile(rootKey, path.join(pkiDirectory, ROOT_KEY), 0o600);
    await installGeneratedFile(rootCert, path.join(pkiDirectory, ROOT_CERT), 0o644);
    await installGeneratedFile(server.serverKey, path.join(tlsDirectory, SERVER_KEY), 0o600);
    await installGeneratedFile(server.serverCert, path.join(tlsDirectory, SERVER_CERT), 0o644);
  } catch (error) {
    throw new AppError("Não foi possível emitir o certificado interno", 503, "CERTIFICATE_TOOL_UNAVAILABLE", {
      reason: error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT" ? "OPENSSL_NOT_FOUND" : "GENERATION_FAILED",
    });
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function provisionInitialInternalCertificate(hostName: string, pkiDirectory: string, tlsDirectory: string) {
  const files = [
    path.join(pkiDirectory, ROOT_CERT),
    path.join(pkiDirectory, ROOT_KEY),
    path.join(tlsDirectory, SERVER_CERT),
    path.join(tlsDirectory, SERVER_KEY),
  ];
  const presence = await Promise.all(files.map(fileExists));
  if (presence.some(Boolean) && !presence.every(Boolean)) {
    throw new AppError("O volume PKI contém material parcial; restaure a autoridade ou remova o volume incompleto antes da instalação", 409, "CERTIFICATE_MATERIAL_PARTIAL");
  }

  if (!presence.every(Boolean)) {
    await generateInternalCertificate(hostName, pkiDirectory, tlsDirectory);
  }

  try {
    const [rootCertificatePem, rootKeyPem, serverCertificatePem, serverKeyPem] = await Promise.all(files.map((file) => fs.readFile(file, "utf8")));
    const root = new X509Certificate(rootCertificatePem!);
    const server = new X509Certificate(serverCertificatePem!);
    const rootKeyMatches = root.publicKey.export({ type: "spki", format: "der" }).equals(
      createPublicKey(createPrivateKey(rootKeyPem!)).export({ type: "spki", format: "der" }),
    );
    const serverKeyMatches = server.publicKey.export({ type: "spki", format: "der" }).equals(
      createPublicKey(createPrivateKey(serverKeyPem!)).export({ type: "spki", format: "der" }),
    );
    if (!root.ca || !server.checkHost(hostName) || !server.verify(root.publicKey) || !rootKeyMatches || !serverKeyMatches) throw new Error("mismatch");
    return {
      created: !presence.every(Boolean),
      hostName,
      rootFingerprintSha256: root.fingerprint256,
      serverExpiresAt: new Date(server.validTo).toISOString(),
    };
  } catch {
    throw new AppError("O material HTTPS existente não corresponde ao nome interno configurado", 409, "CERTIFICATE_MATERIAL_MISMATCH");
  }
}
