export type PreflightStatus = "PASS" | "WARN" | "FAIL";
export type PreflightOverallStatus = "READY" | "ATTENTION" | "BLOCKED";

export type PreflightCheck = {
  id: string;
  category: "RUNTIME" | "SECURITY" | "NETWORK" | "STORAGE" | "CERTIFICATE" | "DATABASE";
  label: string;
  status: PreflightStatus;
  message: string;
  remediation?: string;
};

export type DeploymentPreflightInput = {
  nodeMajorVersion: number;
  nodeEnvironment: "development" | "test" | "production";
  cookieSecure: boolean;
  trustProxyHops: number;
  corsOrigins: string[];
  publicRegistrationAllowed: boolean;
  setupTokenConfigured: boolean;
  userCount: number;
  hostName: string | null;
  environmentHostName: string | null;
  bindIp: string | null;
  expectedIp: string | null;
  expectedIpMatches: boolean;
  dnsMatchesExpectedIp: boolean;
  dnsError: string | null;
  allowedNetworks: string[];
  opensslAvailable: boolean;
  certificateStatus: "NOT_CONFIGURED" | "VALID" | "EXPIRING" | "EXPIRED" | "INVALID";
  directories: Array<{ id: string; label: string; path: string; exists: boolean; writable: boolean }>;
};

function check(
  id: string,
  category: PreflightCheck["category"],
  label: string,
  status: PreflightStatus,
  message: string,
  remediation?: string,
): PreflightCheck {
  return { id, category, label, status, message, ...(remediation ? { remediation } : {}) };
}

export function evaluateDeploymentPreflight(input: DeploymentPreflightInput) {
  const production = input.nodeEnvironment === "production";
  const checks: PreflightCheck[] = [];

  checks.push(check(
    "runtime.node",
    "RUNTIME",
    "Versão do Node.js",
    input.nodeMajorVersion >= 22 ? "PASS" : "FAIL",
    `Node.js ${input.nodeMajorVersion} detectado; o SAGEP requer a versão 22 ou superior.`,
    input.nodeMajorVersion >= 22 ? undefined : "Atualize a imagem ou o runtime do servidor para Node.js 22 LTS ou superior.",
  ));
  checks.push(check(
    "runtime.environment",
    "RUNTIME",
    "Modo de execução",
    production ? "PASS" : "WARN",
    production ? "A API está em modo de produção." : `A API está em modo ${input.nodeEnvironment}.`,
    production ? undefined : "Defina NODE_ENV=production antes da entrada em operação.",
  ));
  checks.push(check("database.connection", "DATABASE", "Banco de dados", "PASS", "A configuração foi consultada com sucesso no PostgreSQL."));

  checks.push(check(
    "security.cookie",
    "SECURITY",
    "Cookie seguro",
    input.cookieSecure ? "PASS" : production ? "FAIL" : "WARN",
    input.cookieSecure ? "O refresh token será enviado somente por HTTPS." : "AUTH_COOKIE_SECURE está desativado.",
    input.cookieSecure ? undefined : "Ative AUTH_COOKIE_SECURE=true ao publicar o proxy HTTPS.",
  ));
  checks.push(check(
    "security.proxy",
    "SECURITY",
    "Proxy reverso confiável",
    input.trustProxyHops === 1 ? "PASS" : production ? "FAIL" : "WARN",
    input.trustProxyHops === 1 ? "A API confia somente no primeiro salto do proxy." : `TRUST_PROXY_HOPS está definido como ${input.trustProxyHops}.`,
    input.trustProxyHops === 1 ? undefined : "Use TRUST_PROXY_HOPS=1 no perfil HTTPS com Caddy.",
  ));

  const originsAreSecure = input.corsOrigins.length > 0 && input.corsOrigins.every((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "https:" && parsed.pathname === "/" && !parsed.search && !parsed.hash;
    } catch {
      return false;
    }
  });
  const expectedOrigin = input.hostName ? `https://${input.hostName}` : null;
  const expectedOriginConfigured = !expectedOrigin || input.corsOrigins.includes(expectedOrigin);
  const corsReady = originsAreSecure && expectedOriginConfigured;
  checks.push(check(
    "security.cors",
    "SECURITY",
    "Origem HTTPS autorizada",
    corsReady ? "PASS" : production ? "FAIL" : "WARN",
    corsReady ? "O CORS contém a origem HTTPS exata da instalação." : "A origem HTTPS da instalação não está configurada de forma exata no CORS.",
    corsReady ? undefined : expectedOrigin ? `Defina CORS_ALLOWED_ORIGINS=${expectedOrigin}.` : "Configure primeiro o nome DNS completo da instalação.",
  ));
  checks.push(check(
    "security.registration",
    "SECURITY",
    "Cadastro público",
    input.publicRegistrationAllowed ? "FAIL" : "PASS",
    input.publicRegistrationAllowed ? "O cadastro público de usuários está habilitado." : "O cadastro público de usuários está bloqueado.",
    input.publicRegistrationAllowed ? "Defina ALLOW_PUBLIC_REGISTRATION=false." : undefined,
  ));
  checks.push(check(
    "security.setup-token",
    "SECURITY",
    "Chave da primeira inicialização",
    input.userCount === 0
      ? input.setupTokenConfigured ? "PASS" : "FAIL"
      : input.setupTokenConfigured ? "WARN" : "PASS",
    input.userCount === 0
      ? input.setupTokenConfigured ? "A chave temporária está disponível para a primeira inicialização." : "A instalação ainda não possui administrador e não há chave temporária configurada."
      : input.setupTokenConfigured ? "A instalação já foi concluída, mas a chave temporária permanece no ambiente." : "A chave temporária foi removida após a inicialização.",
    input.userCount === 0
      ? input.setupTokenConfigured ? undefined : "Gere SAGEP_SETUP_TOKEN com openssl rand -hex 32 antes do primeiro acesso."
      : input.setupTokenConfigured ? "Remova SAGEP_SETUP_TOKEN do .env e recrie somente o container da API." : undefined,
  ));

  checks.push(check(
    "network.hostname",
    "NETWORK",
    "Nome DNS interno",
    input.hostName && input.environmentHostName === input.hostName ? "PASS" : "FAIL",
    !input.hostName ? "Nenhum nome DNS completo foi configurado." : input.environmentHostName === input.hostName ? `Painel e ambiente usam ${input.hostName}.` : "O nome DNS do painel é diferente do SAGEP_HOSTNAME carregado pela API.",
    input.hostName && input.environmentHostName === input.hostName ? undefined : "Use o mesmo FQDN no painel e em SAGEP_HOSTNAME, depois recrie a API.",
  ));
  checks.push(check(
    "network.address",
    "NETWORK",
    "IP reservado",
    input.expectedIp && input.expectedIpMatches ? "PASS" : "FAIL",
    !input.expectedIp ? "O IP esperado não foi informado." : input.expectedIpMatches ? `O IP ${input.expectedIp} coincide com a publicação do proxy.` : `O IP esperado ${input.expectedIp} não coincide com SAGEP_BIND_IP (${input.bindIp ?? "não informado"}).`,
    input.expectedIp && input.expectedIpMatches ? undefined : "Reserve o endereço no DHCP e confirme a interface publicada no host.",
  ));
  checks.push(check(
    "network.dns",
    "NETWORK",
    "Resolução DNS",
    input.hostName && input.expectedIp && input.dnsMatchesExpectedIp ? "PASS" : "FAIL",
    input.dnsError ? `Falha de resolução: ${input.dnsError}` : input.dnsMatchesExpectedIp ? "O DNS interno resolve para o IP esperado." : "O DNS interno não resolve para o IP esperado.",
    input.hostName && input.expectedIp && input.dnsMatchesExpectedIp ? undefined : "Ajuste o registro A no DNS interno e execute o diagnóstico novamente.",
  ));
  checks.push(check(
    "network.allowlist",
    "NETWORK",
    "Redes autorizadas",
    input.allowedNetworks.length > 0 ? "PASS" : "WARN",
    input.allowedNetworks.length > 0 ? `${input.allowedNetworks.length} faixa(s) de rede registrada(s).` : "Nenhuma faixa de rede autorizada foi registrada.",
    input.allowedNetworks.length > 0 ? undefined : "Registre as redes CIDR que poderão alcançar o proxy e aplique-as no firewall do host.",
  ));

  checks.push(check(
    "certificate.openssl",
    "CERTIFICATE",
    "OpenSSL",
    input.opensslAvailable ? "PASS" : "FAIL",
    input.opensslAvailable ? "OpenSSL disponível para emissão e validação." : "OpenSSL não foi localizado no container da API.",
    input.opensslAvailable ? undefined : "Instale OpenSSL na imagem de produção da API.",
  ));
  const certificateLevel: PreflightStatus = input.certificateStatus === "VALID" ? "PASS" : input.certificateStatus === "EXPIRING" ? "WARN" : "FAIL";
  checks.push(check(
    "certificate.status",
    "CERTIFICATE",
    "Certificado HTTPS",
    certificateLevel,
    `Estado atual do certificado: ${input.certificateStatus}.`,
    certificateLevel === "PASS" ? undefined : input.certificateStatus === "EXPIRING" ? "Planeje a renovação antes do vencimento." : "Emita um certificado interno válido antes de ativar o perfil HTTPS.",
  ));

  for (const directory of input.directories) {
    const level: PreflightStatus = directory.exists && directory.writable ? "PASS" : directory.exists ? "FAIL" : production ? "FAIL" : "WARN";
    checks.push(check(
      `storage.${directory.id}`,
      "STORAGE",
      directory.label,
      level,
      directory.exists ? directory.writable ? `Diretório gravável: ${directory.path}.` : `Diretório sem permissão de escrita: ${directory.path}.` : `Diretório ainda não encontrado: ${directory.path}.`,
      level === "PASS" ? undefined : "Confirme a montagem e a propriedade do volume persistente antes da implantação.",
    ));
  }

  const counts = checks.reduce((result, item) => ({ ...result, [item.status.toLowerCase()]: result[item.status.toLowerCase() as "pass" | "warn" | "fail"] + 1 }), { pass: 0, warn: 0, fail: 0 });
  const status: PreflightOverallStatus = counts.fail > 0 ? "BLOCKED" : counts.warn > 0 ? "ATTENTION" : "READY";
  return { checkedAt: new Date().toISOString(), status, counts, checks };
}
