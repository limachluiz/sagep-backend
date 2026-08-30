import { env } from "../config/env.js";
import { provisionInitialInternalCertificate } from "../modules/deployment/pki-provisioning.js";

if (!env.SAGEP_HOSTNAME) {
  console.error("[BLOQUEIO] SAGEP_HOSTNAME não foi configurado.");
  process.exitCode = 1;
} else {
  const result = await provisionInitialInternalCertificate(
    env.SAGEP_HOSTNAME,
    env.DEPLOYMENT_PKI_DIRECTORY,
    env.DEPLOYMENT_TLS_DIRECTORY,
  );
  console.log(result.created ? "Autoridade interna exclusiva da OM criada." : "Autoridade interna existente validada.");
  console.log(`Nome HTTPS: ${result.hostName}`);
  console.log(`Impressão digital da raiz: ${result.rootFingerprintSha256}`);
  console.log(`Certificado do servidor válido até: ${result.serverExpiresAt}`);
}
