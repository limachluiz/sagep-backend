# SAGEP Backend

![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Containers-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-ISC-green)

Backend do **SAGEP** — Sistema de Apoio à Gestão de Projetos.

O projeto centraliza o fluxo operacional e documental da Seção de Projetos, cobrindo desde a estimativa de preço até a conclusão do serviço, com rastreabilidade, governança de permissões, dashboards e controle de saldo dos itens da ATA.

## Visão geral

O SAGEP foi estruturado para apoiar a gestão de projetos técnicos com foco em:

- controle do fluxo documental real do processo;
- gestão de projetos, tarefas e membros;
- emissão e acompanhamento de Estimativas, DIEx e Ordens de Serviço;
- governança de acesso via RBAC persistido no banco;
- auditoria de ações críticas;
- dashboards operacionais, executivos e financeiros com filtros temporais e organizacionais;
- gestão de saldo interno dos itens da ATA com reserva, consumo, estorno e rollback de NE;
- importação completa de ATAs e itens pelo Compras.gov.br;
- backup automático e manual, exportação seletiva e restauração segura do PostgreSQL;
- importação em escala de Organizações Militares por CSV, com prévia e validação;
- Kanban interno derivado do workflow dos projetos, filtrável por etapa, UF, OM, tipo e responsável;
- Gantt consolidado a partir das Ordens de Serviço, com recortes por UF, tipo e responsável.

## Stack técnica

- Node.js 24
- TypeScript 6
- Express
- Prisma ORM
- PostgreSQL
- Zod
- JWT de acesso e refresh token em cookie HttpOnly
- Vitest
- Docker / Docker Compose

## Funcionalidades principais

- autenticação com JWT curto e refresh token rotativo em cookie HttpOnly;
- sessões do usuário e revogação administrativa;
- perfil pessoal com edição restrita de dados, avatar, preferências e alteração segura de senha;
- RBAC governado pelo banco com permissões por role e overrides por usuário;
- projetos com workflow documental;
- Kanban de projetos com movimentação protegida pelo workflow;
- tarefas e membros de projeto;
- catálogo de ATAs e itens de ATA;
- estimativas de preço;
- DIEx requisitório;
- Ordens de Serviço;
- Gantt consolidado e individual das Ordens de Serviço;
- aprovação do As-Built condicionada a link de arquivo ou pasta em nuvem;
- importação única de ATA completa pelo Compras.gov.br;
- saldo dos itens da ATA por movimentação;
- importação CSV de OMs em modo de criação ou atualização, com análise prévia por linha;
- backup completo manual e agendado, importação e download de arquivos `.dump`;
- restauração integral com verificação SHA-256 e backup de segurança automático;
- exportação seletiva de projetos, ATAs e outros módulos em SQL;
- dashboards operacional, executivo e visão geral;
- alertas operacionais;
- relatórios e exportações;
- auditoria e timeline;
- contrato OpenAPI com cliente TypeScript gerado;
- códigos de erro estáveis e `requestId` para suporte;
- centro de saúde com sondas da API, PostgreSQL e pgAdmin, histórico de latência e diagnóstico administrativo;
- administração de rede, DNS e HTTPS por OM, com diagnóstico não destrutivo e kits de confiança para Windows 11, Linux Mint e Ubuntu;
- execução financeira com validação de NE no Portal da Transparência, rastreio de liquidação/pagamento, NFe e alertas dispensáveis por usuário.

## Fluxo documental resumido

1. Estimativa de Preço
2. Aguardando Nota de Crédito
3. DIEx Requisitório
4. Aguardando Nota de Empenho
5. OS Liberada
6. Serviço em Execução
7. Analisando As-Built
8. Atestar NF
9. Serviço Concluído

Para avançar de `ANALISANDO_AS_BUILT` para `ATESTAR_NF`, a revisão aprovada
deve informar `asBuiltLink` com uma URL válida para o arquivo ou pasta em nuvem.

Com o módulo de saldo da ATA:

- a estimativa consulta saldo disponível;
- o DIEx reserva saldo;
- a NE consome saldo;
- o cancelamento da NE estorna saldo e faz rollback documental do projeto.

## Compras.gov.br e saldo local

O Compras.gov.br é consultado somente em `preview` e na importação inicial da
ATA completa. O SAGEP persiste cabeçalho, itens, preços e quantidades. Depois da
importação não há sincronização externa ou consulta individual de itens:
reservas, consumos e estornos usam exclusivamente o razão de saldo local.

## Planejamento visual

- `GET /api/projects/kanban`: quadro agregado pelas etapas oficiais.
- `PATCH /api/projects/:id/kanban/move`: movimentação validada pelo workflow.
- `GET /api/service-orders/gantt`: Gantt consolidado das OS.
- `GET /api/service-orders/:id/gantt`: Gantt de uma OS.

## Requisitos para rodar localmente

- Node.js 24
- npm
- PostgreSQL 15+ ou Docker Compose
- acesso local para criar e migrar o banco

## Variáveis de ambiente

Crie o `.env` com base em `.env.example`.

Variáveis usadas atualmente:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `PORT` | sim | Porta HTTP da aplicação |
| `API_PORT` | nao | Porta publicada pelo Docker no host. Padrao `3000`, igual ao proxy do frontend |
| `NODE_ENV` | sim | Ambiente de execução |
| `DATABASE_URL` | sim | String de conexão PostgreSQL |
| `JWT_SECRET` | sim | Segredo do access token |
| `JWT_ACCESS_SECRET` | nao | Alias antigo ainda aceito para o segredo do access token |
| `PDF_TIMEOUT_MS` | nao | Timeout da geracao de PDF com Puppeteer |
| `PDF_RENDER_MODE` | nao | `real` para gerar PDF com Chromium; em testes pode ser `mock` |
| `COMPRAS_GOV_DEBUG` | nao | Flag de diagnostico para integracoes Compras.gov.br |
| `PORTAL_TRANSPARENCIA_API_TOKEN` | nao | Token da API do Portal da Transparencia, se usado |
| `PORTAL_TRANSPARENCIA_BASE_URL` | nao | URL base oficial da API do Portal da Transparencia |
| `PORTAL_TRANSPARENCIA_SYNC_INTERVAL_MINUTES` | nao | Intervalo da sincronizacao automatica das NEs após a consulta executada na inicialização; padrao 1440 minutos |
| `CORS_ALLOWED_ORIGINS` | nao | Lista de origens de navegador autorizadas, separadas por virgula. Vazia bloqueia origens externas |
| `CORS_ALLOW_CREDENTIALS` | nao | Habilita credenciais CORS. Padrao `false` no modelo Bearer atual |
| `JWT_REFRESH_SECRET` | sim | Segredo do refresh token |
| `SAGEP_SECRETS_ENCRYPTION_KEY` | recomendada | Chave hexadecimal de 256 bits para segredos cadastrados pela interface; instalações anteriores usam derivação compatível até sua configuração |
| `JWT_ACCESS_EXPIRES_IN` | sim | Expiração do access token |
| `JWT_REFRESH_EXPIRES_IN` | sim | Expiração do refresh token |
| `AUTH_REFRESH_COOKIE_NAME` | nao | Nome do cookie HttpOnly de renovação. Padrão `sagep_refresh` |
| `AUTH_COOKIE_SECURE` | nao | Envia o cookie somente por HTTPS. Use `true` em produção com TLS |
| `AUTH_REFRESH_COOKIE_PERSISTENT` | nao | `false` encerra a sessão local ao fechar o navegador; `true` mantém o login até a validade do refresh token |
| `TRUST_PROXY_HOPS` | nao | Quantidade de proxies reversos confiáveis. Padrão `0` |
| `RATE_LIMIT_WINDOW_MS` | nao | Janela dos limites de requisição. Padrão `900000` ms |
| `RATE_LIMIT_MAX` | nao | Limite geral por IP e janela. Padrão `600` |
| `AUTH_RATE_LIMIT_MAX` | nao | Limite de tentativas de login por IP/usuário. Padrão `10` |
| `LOGIN_MAX_FAILED_ATTEMPTS` | nao | Falhas consecutivas antes do bloqueio temporário da conta. Padrão `5` |
| `LOGIN_LOCKOUT_MINUTES` | nao | Duração do bloqueio temporário após exceder as falhas. Padrão `15` minutos |
| `SENSITIVE_RATE_LIMIT_MAX` | nao | Limite para backup, restauração e testes de conexão. Padrão `20` |
| `STEP_UP_EXPIRES_IN_SECONDS` | nao | Validade da confirmação de senha exigida em operações críticas. Padrão `300`; intervalo permitido de 60 a 900 segundos |
| `ALLOW_PUBLIC_REGISTRATION` | nao | Habilita `POST /auth/register`. Padrao seguro: `false` |
| `HEALTH_PGADMIN_URL` | nao | Endpoint interno de ping do pgAdmin. No Compose: `http://pgadmin/misc/ping` |
| `HEALTH_PROBE_TIMEOUT_MS` | nao | Timeout das sondas internas. Padrao `2000` ms |
| `BACKUP_DIRECTORY` | nao | Diretório dos backups e manifestos. Padrão `./backups`; no Docker usa volume persistente |
| `BACKUP_RETENTION_DAYS` | nao | Retenção dos backups automáticos em dias. Padrão `30` |
| `BACKUP_MAX_FILES` | nao | Quantidade máxima de backups automáticos mantidos. Padrão `30` |
| `BACKUP_SCHEDULE_HOURS` | nao | Intervalo entre backups automáticos. `0` desativa; padrão `24` |
| `BACKUP_RUN_ON_STARTUP` | nao | Cria backup ao iniciar a API. Padrão `false` |
| `BACKUP_MAX_UPLOAD_MB` | nao | Limite para importação de arquivo `.dump`. Padrão `512` MB |
| `EVIDENCE_DIRECTORY` | nao | Diretório persistente para imagens, KMZ/KML, certificações e demais evidências. Padrão `./evidence-files` |
| `EVIDENCE_MAX_UPLOAD_MB` | nao | Limite por arquivo de evidência. Padrão `100` MB |
| `DEPLOYMENT_PKI_DIRECTORY` | nao | Volume protegido da autoridade e do certificado HTTPS. No Docker use `/app/pki` |
| `DEPLOYMENT_TLS_DIRECTORY` | nao | Volume que entrega somente certificado e chave do servidor ao proxy. No Docker use `/app/tls` |
| `CERTIFICATE_AUTO_RENEW_ENABLED` | nao | Ativa a verificação e renovação automática. Padrão `true` |
| `CERTIFICATE_AUTO_RENEW_DAYS` | nao | Renova quando a validade restante atingir este limite. Padrão `30` dias |
| `CERTIFICATE_RENEWAL_CHECK_HOURS` | nao | Intervalo das verificações automáticas. Padrão `24` horas |
| `CERTIFICATE_PROXY_AUTO_RELOAD` | nao | Informa se o ambiente recarrega o proxy automaticamente. O Compose define `true` |
| `CERTIFICATE_RELOAD_CHECK_SECONDS` | nao | Intervalo do observador TLS do Caddy. Padrão `15` segundos |
| `SAGEP_HOSTNAME` | no perfil HTTPS | Nome DNS interno completo, por exemplo `sagep.4cta.eb.mil.br` |
| `SAGEP_BIND_IP` | no perfil HTTPS | IP privado do host no qual Caddy publicará 80/443. O padrão seguro é `127.0.0.1` |
| `SAGEP_HTTP_PORT` | nao | Porta HTTP publicada no host. Padrão `80` |
| `SAGEP_HTTPS_PORT` | nao | Porta HTTPS publicada no host. Padrão `443` |
| `SAGEP_FIREWALL_NAMESPACE` | nao | Prefixo exclusivo das cadeias gerenciadas na `DOCKER-USER`. Padrão `SAGEP-INGRESS` |
| `SAGEP_COMPOSE_PROJECT` | nao | Nome isolado do projeto Compose. Padrão `sagep-backend` |
| `SAGEP_CONTAINER_PREFIX` | nao | Prefixo dos nomes explícitos dos containers. Padrão `sagep` |
| `SAGEP_VOLUME_PREFIX` | nao | Prefixo dos volumes persistentes. Padrão `sagep` |

Exemplo:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://sagep:<senha-postgres>@localhost:5432/sagep?schema=public"
DOCKER_DATABASE_URL="postgresql://sagep:<senha-postgres>@postgres:5432/sagep?schema=public"
POSTGRES_PASSWORD=<defina-uma-senha-forte>
PGADMIN_DEFAULT_PASSWORD=<defina-outra-senha-forte>
JWT_SECRET="<gere-um-segredo-aleatorio-forte>"
JWT_REFRESH_SECRET="<gere-outro-segredo-aleatorio-forte>"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
AUTH_REFRESH_COOKIE_NAME=sagep_refresh
AUTH_COOKIE_SECURE=false
AUTH_REFRESH_COOKIE_PERSISTENT=false
TRUST_PROXY_HOPS=0
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=600
AUTH_RATE_LIMIT_MAX=10
LOGIN_MAX_FAILED_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
SENSITIVE_RATE_LIMIT_MAX=20
STEP_UP_EXPIRES_IN_SECONDS=300
PDF_TIMEOUT_MS=60000
PDF_RENDER_MODE=real
COMPRAS_GOV_DEBUG=false
PORTAL_TRANSPARENCIA_API_TOKEN=
CORS_ALLOWED_ORIGINS="http://localhost:4200"
CORS_ALLOW_CREDENTIALS=true
ALLOW_PUBLIC_REGISTRATION=false
HEALTH_PGADMIN_URL="http://pgadmin/misc/ping"
HEALTH_PROBE_TIMEOUT_MS=2000
BACKUP_DIRECTORY=./backups
BACKUP_RETENTION_DAYS=30
BACKUP_MAX_FILES=30
BACKUP_SCHEDULE_HOURS=24
BACKUP_RUN_ON_STARTUP=false
BACKUP_MAX_UPLOAD_MB=512
EVIDENCE_DIRECTORY=./evidence-files
EVIDENCE_MAX_UPLOAD_MB=100
DEPLOYMENT_PKI_DIRECTORY=./pki
DEPLOYMENT_TLS_DIRECTORY=./tls
CERTIFICATE_AUTO_RENEW_ENABLED=true
CERTIFICATE_AUTO_RENEW_DAYS=30
CERTIFICATE_RENEWAL_CHECK_HOURS=24
CERTIFICATE_PROXY_AUTO_RELOAD=false
SAGEP_HOSTNAME=sagep.4cta.eb.mil.br
SAGEP_BIND_IP=10.78.xxx.xxx
SAGEP_HTTP_PORT=80
SAGEP_HTTPS_PORT=443
SAGEP_FIREWALL_NAMESPACE=SAGEP-INGRESS
SAGEP_COMPOSE_PROJECT=sagep-backend
SAGEP_CONTAINER_PREFIX=sagep
SAGEP_VOLUME_PREFIX=sagep
```

Requisicoes sem header `Origin`, como scripts, health checks e comunicacao
entre servicos, nao sao bloqueadas pelo CORS. Em producao, informe apenas as
URLs oficiais do frontend.

## Segurança operacional

- O refresh token nunca é entregue no JSON nem armazenado pelo frontend; ele usa cookie `HttpOnly`, `SameSite=Strict` e caminho restrito a `/api/auth`.
- Em produção, os dois segredos JWT precisam ser diferentes e possuir no mínimo 32 caracteres.
- Helmet aplica cabeçalhos defensivos e a API possui CSP restritiva fora da documentação OpenAPI.
- Login, renovação, backups, restaurações e testes de integração têm limites contra abuso. Em implantação com múltiplas réplicas, substitua o armazenamento local do limitador por Redis.
- O login combina limites por IP e por conta, bloqueia temporariamente a conta após falhas consecutivas e usa uma comparação criptográfica de custo equivalente mesmo quando o e-mail não existe.
- O escopo de projetos, tarefas, estimativas, documentos, execução financeira, busca, dashboards e alertas usa as permissões efetivas do usuário; um override `DENY` prevalece sobre a permissão herdada da role e bloqueia também consultas por ID ou código.
- Respostas `5xx` não devolvem causas, endereços internos ou mensagens de ferramentas; o `requestId` permanece disponível para correlação com o log do servidor.
- Backups e exportações SQL são gravados com permissão `0600`. O download integral exige reautenticação recente, verifica novamente o SHA-256 e gera registro de auditoria.
- Na inicialização do container, o entrypoint corrige o proprietário do volume de backups e então executa migrations e API como usuário `sagep`, sem manter o processo da aplicação como `root`.
- No Compose, `BACKUP_DIRECTORY` permanece fixo em `/app/backups`, o ponto do volume nomeado. O valor `./backups` continua válido apenas na execução local via npm.
- O build normaliza scripts shell para `LF`, inclusive quando o repositório é clonado no Windows com conversão automática para `CRLF`.
- Login, renovação e logout validam `Origin`/`Sec-Fetch-Site` contra `CORS_ALLOWED_ORIGINS`, reduzindo o risco de CSRF sobre o cookie de renovação.
- Operações administrativas críticas exigem confirmação recente da senha. O token temporário é vinculado ao usuário, permanece somente em memória no frontend e expira em até 15 minutos (padrão: 5 minutos).
- URLs configuráveis das integrações aceitam apenas HTTPS e os hosts oficiais do Portal da Transparência, Compras.gov.br e PNCP; redirecionamentos externos não são seguidos.
- PostgreSQL e pgAdmin são publicados somente em `127.0.0.1` no Compose. A API executa como usuário sem privilégios e com `no-new-privileges`.
- Com proxy reverso, configure TLS, `AUTH_COOKIE_SECURE=true`, a origem exata em `CORS_ALLOWED_ORIGINS` e `TRUST_PROXY_HOPS` conforme a topologia real.
- A autoridade interna é exclusiva de cada OM. A chave da autoridade permanece no volume `sagep_pki`, que não é montado no proxy; o Caddy recebe somente o certificado e a chave do servidor pelo volume `sagep_tls`. Somente o certificado raiz público e scripts com verificação SHA-256 compõem os kits dos clientes.
- A impressão digital da raiz deve ser conferida por um canal administrativo confiável antes da instalação. Nunca distribua o kit como prova de sua própria autenticidade.
- O painel registra IP, gateway, DNS, NTP, proxy e redes autorizadas, mas não altera a rede do sistema operacional nem acessa o socket do Docker.

## Docker com banco persistente

O ambiente Docker sobe `api`, `postgres` e `pgadmin`. O PostgreSQL usa o volume nomeado `sagep_postgres_data`, montado em `/var/lib/postgresql/data`, para preservar ATAs importadas, usuários, projetos e demais dados entre reinícios.

Dentro do Docker, defina `DOCKER_DATABASE_URL` usando o host `postgres` e a mesma senha informada em `POSTGRES_PASSWORD`. Nao use `localhost` dentro do container da API: nesse contexto, `localhost` e o proprio container, nao o Postgres.

Fora do Docker, para desenvolvimento local, use `DATABASE_URL` com o host `localhost` e a senha definida para o PostgreSQL.

No pgAdmin rodando no Docker, cadastre o servidor PostgreSQL com host `postgres`, porta `5432`, usuario `sagep`, a senha definida em `POSTGRES_PASSWORD` e banco `sagep`.

Subir tudo:

```bash
docker compose up -d --build
```

## HTTPS interno por OM

### Primeira inicialização segura

Em uma instalação nova, use o fluxo assistido documentado em
[`docs/INSTALLATION.md`](docs/INSTALLATION.md). O bootstrap do host instala apenas
os pacotes necessários e não altera SSH ou firewall:

```bash
sudo bash scripts/bootstrap-host.sh --install
npm run deployment:install
```

O instalador gera localmente as senhas, dois segredos JWT distintos e a chave
temporária de primeira inicialização. O `.env` é criado de forma atômica com
permissão `0600` e nunca é sobrescrito. Após configurar o DNS interno, a fase de
implantação valida o ambiente, constrói as imagens, cria a autoridade exclusiva
da OM dentro dos volumes protegidos, aplica o firewall antes de publicar 80/443
e sobe o perfil HTTPS.

Quando o banco ainda não possuir usuários, o frontend direciona para `/setup`,
onde o administrador informa os dados da OM, a primeira conta administrativa e
os parâmetros de rede. A chave nunca é armazenada no banco nem devolvida pela
API. Depois de concluir, finalize a instalação para removê-la e recriar somente
a API:

```bash
sudo /usr/bin/env node scripts/install-sagep.mjs \
  --finalize --confirm-finalize REMOVER-CHAVE
```

Para instalações já configuradas, a pré-validação continua disponível sem
dependências npm e sem imprimir segredos:

```bash
node scripts/check-deployment-preflight.mjs .env
```

Para homologar em notebook Pop!_OS sem tocar em outro ambiente SAGEP já ativo,
use o perfil isolado documentado em
[docs/HOMOLOGATION_POP_OS.md](docs/HOMOLOGATION_POP_OS.md). Ele reserva projeto
Compose, containers, volumes, portas e namespace de firewall exclusivos e gera
`.env.homolog` com segredos locais e permissão `0600`.

Atualizações de produção também possuem fluxo transacional. `npm run
deployment:update` consulta os commits candidatos sem alterar a implantação. A
aplicação exige SHAs completos e confirmação literal, cria backup validado do
banco, preserva as imagens em execução e só conclui após verificar API,
containers e firewall. Falhas restauram automaticamente código e imagens; a
restauração do banco permanece uma ação separada com confirmação adicional.
Consulte [docs/INSTALLATION.md](docs/INSTALLATION.md#atualização-segura-e-rollback).

O perfil HTTPS foi projetado para um servidor acessível somente na rede local da
OM. O registro DNS interno deve apontar o nome escolhido para o IP privado
reservado no DHCP. A publicação externa deve continuar bloqueada no UTM.

### Restrição de acesso por redes CIDR

Defina no `.env` os CIDRs IPv4 privados autorizados, usando exatamente a mesma
lista registrada no painel. Endereços públicos, `0.0.0.0/0` e valores que não
representam o início da rede são rejeitados:

```dotenv
SAGEP_ALLOWED_NETWORKS=10.78.0.0/16,192.168.40.0/24
```

Confira a prévia sem alterar o host e, em seguida, aplique e valide como `root`:

```bash
npm run firewall:dry-run
sudo /usr/bin/env node scripts/manage-firewall.mjs --apply
sudo /usr/bin/env node scripts/manage-firewall.mjs --check
```

O utilitário cria cadeias exclusivas na `DOCKER-USER` e protege somente as
conexões destinadas ao `SAGEP_BIND_IP` nas portas 80/443. Ele não redefine a
política global, não altera SSH e não toca em PostgreSQL ou pgAdmin. A troca de
regras usa duas cadeias alternadas para que uma atualização não abra uma janela
temporária de acesso. A execução falha de forma segura se Docker, `iptables`, o
IP privado ou a lista de redes não estiverem prontos.

Para reaplicar a política em cada inicialização do Docker, instale a unidade
versionada depois de posicionar o projeto em `/opt/sagep/sagep-backend`:

```bash
sudo install -m 0644 deploy/systemd/sagep-firewall.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sagep-firewall.service
sudo systemctl status sagep-firewall.service --no-pager
```

Depois de mudar `SAGEP_ALLOWED_NETWORKS`, atualize também o painel e execute
`sudo systemctl reload sagep-firewall.service`. A remoção deliberada exige
`sudo /usr/bin/env node scripts/manage-firewall.mjs --remove --confirm`; ela não altera
nenhuma regra que não seja gerenciada pelo SAGEP.

1. Suba o ambiente padrão. Se ainda não existir administrador e
   `SAGEP_SETUP_TOKEN` estiver vazio, a API gera automaticamente uma chave
   temporária no volume `sagep_bootstrap`. Consulte-a com
   `docker compose logs api`; ela é removida após a configuração inicial.
   Depois, acesse **Configurações → Rede, servidores e HTTPS**.
2. Salve o nome DNS e os parâmetros esperados, execute o diagnóstico e inicialize
   o certificado interno. A operação exige ADMIN e confirmação recente da senha.
   O quadro **Prontidão para produção** consolida bloqueios e alertas de runtime,
   segurança, DNS, armazenamento e certificado sem alterar o host.
3. Defina no `.env` o mesmo `SAGEP_HOSTNAME`, o IP privado em `SAGEP_BIND_IP`,
   os CIDRs privados em `SAGEP_ALLOWED_NETWORKS`, `AUTH_COOKIE_SECURE=true`,
   `TRUST_PROXY_HOPS=1` e a origem HTTPS exata em `CORS_ALLOWED_ORIGINS`.
4. Ative o proxy e o frontend de produção:

```bash
docker compose --profile https up -d --build
```

O Caddy é o único serviço publicado em 80/443 nesse perfil. A API continua
disponível apenas em `127.0.0.1:3000`, PostgreSQL em `127.0.0.1:5432` e pgAdmin
em `127.0.0.1:5050`. Os kits baixados pelo painel possuem instalação,
verificação e remoção para Windows 11 ou para Linux Mint/Ubuntu.

Rotacionar a raiz invalida a confiança previamente instalada e exige redistribuir
os kits. Faça essa operação apenas em resposta a comprometimento ou mudança
planejada da autoridade da OM. Depois de emitir ou rotacionar um certificado,
reinicie somente o proxy com `docker compose --profile https restart caddy` para
que o novo material TLS seja carregado, sem reiniciar a API ou o banco.

A renovação normal cria uma nova chave e um novo certificado do servidor usando
a autoridade existente. A impressão digital da raiz não muda e os kits instalados
continuam válidos. O SAGEP gera alertas aos 60, 30, 15 e 7 dias e torna o aviso
crítico quando faltam até 7 dias ou quando o certificado já venceu. Após renovar,
reinicie somente o Caddy para carregar o novo par TLS.

Por padrão, a API verifica a validade na inicialização e a cada 24 horas. Quando
restam 30 dias ou menos, renova automaticamente o certificado do servidor sem
rotacionar a raiz. No perfil Docker HTTPS, um observador interno compara o
checksum do par TLS e solicita a recarga ao Caddy pela interface administrativa
restrita a `localhost:2019`; nenhuma porta administrativa é publicada. Falhas
geram alerta crítico e permanecem visíveis no painel de implantação.

Em **Configurações → Backup e restauração**, o administrador pode exportar a
autoridade da OM em um arquivo `.sagep-pki` protegido por AES-256-GCM e senha de
custódia. A senha nunca é armazenada. A restauração exige reautenticação,
confirmação literal, correspondência com a sigla da OM, chave RSA de 4096 bits,
certificado raiz autêntico e validade suficiente. Antes da troca, o SAGEP grava
no volume `sagep_pki` uma cópia criptografada da autoridade corrente e reemite o
certificado do servidor para o DNS configurado. Se a raiz mudar, redistribua os
kits de confiança e reinicie o Caddy.

Somente o modo **Autoridade interna por OM** está habilitado nesta versão. Modos
de certificado importado ou ACME DNS-01 não são oferecidos até que possuam fluxo
completo de validação, rotação e recuperação.

Ou via npm:

```bash
npm run docker:up
```

A API executa automaticamente no startup:

```bash
npx prisma migrate deploy
npm run start
```

Isso aplica migrations pendentes sem resetar o banco. O startup nunca roda `prisma migrate reset`.

Se quiser preservar dados, tambem nao rode `prisma migrate reset` manualmente: ele recria o banco e apaga registros importados.

Servicos padrao:

- API: `http://localhost:3000/api`
- OpenAPI: `http://localhost:3000/api/docs`
- pgAdmin: `http://localhost:5050`
- PostgreSQL: `localhost:5432`

### Centro de saude e observabilidade

- `GET /api/health`: liveness simples da API;
- `GET /api/health/status`: resumo publico e sanitizado, inclusive quando o banco estiver indisponivel;
- `GET /api/health/details`: runtime, memoria e unidades monitoradas, protegido por `system_health.view_details`.

O monitoramento usa sondas de servico e nao monta `/var/run/docker.sock` no
container da API. Isso permite verificar o funcionamento real de API,
PostgreSQL e pgAdmin sem conceder ao processo web acesso administrativo ao host.
O historico de ate 120 amostras fica em memoria e reinicia junto com a API.

Parar sem perder dados:

```bash
docker compose down
```

Ou:

```bash
npm run docker:down
```

Ver logs da API:

```bash
docker compose logs -f api
```

Ou:

```bash
npm run docker:logs
```

Conferir dados no banco persistente:

```bash
docker exec -it sagep_postgres psql -U sagep -d sagep
```

Dentro do `psql`:

```sql
SELECT COUNT(*) FROM "Ata";
```

### Backup e restauração administrados

O módulo protegido por `backups.manage` e pela role `ADMIN` oferece:

- criação imediata e rotina automática configurável;
- armazenamento no volume Docker `sagep_backups`;
- manifesto com metadados e checksum SHA-256;
- download, importação e validação de backups PostgreSQL no formato custom;
- exportação seletiva de módulos em SQL;
- restauração integral mediante confirmação explícita;
- backup de segurança automático imediatamente antes de cada restauração;
- bloqueio de operações simultâneas e modo de manutenção durante o restore.
- exportação e recuperação criptografadas da autoridade certificadora da OM.

As rotas estão documentadas no OpenAPI em `/api/docs` e os arquivos físicos não
são expostos diretamente pelo servidor web.

### Backup manual via terminal

```bash
docker exec -t sagep_postgres pg_dump -U sagep -d sagep > backup_sagep.sql
```

### Restore manual via terminal

Com os containers de pe:

```bash
cat backup_sagep.sql | docker exec -i sagep_postgres psql -U sagep -d sagep
```

No PowerShell:

```powershell
Get-Content backup_sagep.sql | docker exec -i sagep_postgres psql -U sagep -d sagep
```

### Apagar tudo conscientemente

Para preservar dados, use apenas `docker compose down`.

Nao use `docker compose down -v` no dia a dia: o `-v` apaga o volume `sagep_postgres_data` e remove o banco.

Use somente quando quiser destruir todo o ambiente, incluindo dados persistidos:

```bash
docker compose down -v
```

## Como rodar

1. Instale dependências:

```bash
npm install
```

2. Suba apenas o banco, se for rodar a API fora do Docker:

```bash
docker compose up -d postgres
```

3. Rode as migrations e gere o client:

```bash
npx prisma migrate dev
npx prisma generate
```

4. Rode o seed:

```bash
npm run prisma:seed
```

5. Inicie a API:

```bash
npm run dev
```

Servidor local:

- API: `http://localhost:3000/api`
- Docs OpenAPI HTML: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs/openapi.json`

## Comandos principais

```bash
npm run dev
npm run build
npm run start
npm test
npm run openapi:validate
npm run openapi:export
npm run openapi:generate-client
npm run openapi:check-client
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:seed:dev
npm run prisma:seed:demo
npm run prisma:studio
```

## Usuário admin do seed

O seed local cria perfis de desenvolvimento para validar os níveis de acesso.
As credenciais não são documentadas nem devem ser reutilizadas em produção.
Defina usuários e senhas próprios no ambiente local e altere qualquer acesso
provisório antes de disponibilizar a aplicação em rede.

## Documentação detalhada

Guia principal:

- [API](docs/API.md)
- [Fluxo Documental](docs/FLUXO_DOCUMENTAL.md)
- [Permissões](docs/PERMISSOES.md)
- [Dashboard](docs/DASHBOARD.md)
- [Saldo da ATA](docs/SALDO_ATA.md)
- [Mapa de Frontend](docs/FRONTEND_MAP.md)

Material complementar já existente no repositório:

- [Docs de API por temas](docs/api/README.md)
- [OpenAPI exportado](docs/api/openapi/openapi.json)
- [Cliente TypeScript gerado](src/generated/openapi.ts)

O CI valida auditoria de dependências e segredos, migrations, build, OpenAPI
versionado, cliente TypeScript gerado, suíte completa e a imagem Docker de produção.
O CodeQL executa análise estática adicional e o Dependabot acompanha atualizações
de npm, Docker e GitHub Actions. O contrato atual possui 128 paths e 164 operações.

## Estrutura resumida

```text
src/
  modules/
    auth/
    projects/
    tasks/
    atas/
    ata-items/
    estimates/
    diex/
    service-orders/
    compras-gov/
    dashboard/
    permissions/
    operational-alerts/
    reports/
    exports/
prisma/
  schema.prisma
  seed.ts
tests/
  critical-flows.test.ts
docs/
```

## Observações

- O backend usa autenticação Bearer JWT.
- O controle de permissão efetiva é calculado a partir da role persistida no banco e dos overrides por usuário.
- O módulo de saldo da ATA é auditável por movimentação, não por campo acumulado simples.
- O Compras.gov.br é usado somente para prévia e importação inicial da ATA.
- Kanban e Gantt são projeções do domínio existente; não mantêm estados paralelos.
- O frontend pode tomar o `README` como porta de entrada e os arquivos em `docs/` como base funcional.
