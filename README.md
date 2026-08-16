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
- JWT + refresh token
- Vitest
- Docker / Docker Compose

## Funcionalidades principais

- autenticação com JWT e refresh token;
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
| `JWT_ACCESS_EXPIRES_IN` | sim | Expiração do access token |
| `JWT_REFRESH_EXPIRES_IN` | sim | Expiração do refresh token |
| `ALLOW_PUBLIC_REGISTRATION` | nao | Habilita `POST /auth/register`. Padrao seguro: `false` |
| `HEALTH_PGADMIN_URL` | nao | Endpoint interno de ping do pgAdmin. No Compose: `http://pgadmin/misc/ping` |
| `HEALTH_PROBE_TIMEOUT_MS` | nao | Timeout das sondas internas. Padrao `2000` ms |
| `BACKUP_DIRECTORY` | nao | Diretório dos backups e manifestos. Padrão `./backups`; no Docker usa volume persistente |
| `BACKUP_RETENTION_DAYS` | nao | Retenção dos backups automáticos em dias. Padrão `30` |
| `BACKUP_MAX_FILES` | nao | Quantidade máxima de backups automáticos mantidos. Padrão `30` |
| `BACKUP_SCHEDULE_HOURS` | nao | Intervalo entre backups automáticos. `0` desativa; padrão `24` |
| `BACKUP_RUN_ON_STARTUP` | nao | Cria backup ao iniciar a API. Padrão `false` |
| `BACKUP_MAX_UPLOAD_MB` | nao | Limite para importação de arquivo `.dump`. Padrão `512` MB |

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
PDF_TIMEOUT_MS=60000
PDF_RENDER_MODE=real
COMPRAS_GOV_DEBUG=false
PORTAL_TRANSPARENCIA_API_TOKEN=
CORS_ALLOWED_ORIGINS="http://localhost:4200"
CORS_ALLOW_CREDENTIALS=false
ALLOW_PUBLIC_REGISTRATION=false
HEALTH_PGADMIN_URL="http://pgadmin/misc/ping"
HEALTH_PROBE_TIMEOUT_MS=2000
BACKUP_DIRECTORY=./backups
BACKUP_RETENTION_DAYS=30
BACKUP_MAX_FILES=30
BACKUP_SCHEDULE_HOURS=24
BACKUP_RUN_ON_STARTUP=false
BACKUP_MAX_UPLOAD_MB=512
```

Requisicoes sem header `Origin`, como scripts, health checks e comunicacao
entre servicos, nao sao bloqueadas pelo CORS. Em producao, informe apenas as
URLs oficiais do frontend.

## Docker com banco persistente

O ambiente Docker sobe `api`, `postgres` e `pgadmin`. O PostgreSQL usa o volume nomeado `sagep_postgres_data`, montado em `/var/lib/postgresql/data`, para preservar ATAs importadas, usuários, projetos e demais dados entre reinícios.

Dentro do Docker, defina `DOCKER_DATABASE_URL` usando o host `postgres` e a mesma senha informada em `POSTGRES_PASSWORD`. Nao use `localhost` dentro do container da API: nesse contexto, `localhost` e o proprio container, nao o Postgres.

Fora do Docker, para desenvolvimento local, use `DATABASE_URL` com o host `localhost` e a senha definida para o PostgreSQL.

No pgAdmin rodando no Docker, cadastre o servidor PostgreSQL com host `postgres`, porta `5432`, usuario `sagep`, a senha definida em `POSTGRES_PASSWORD` e banco `sagep`.

Subir tudo:

```bash
docker compose up -d --build
```

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

O CI valida migrations, build, OpenAPI versionado, cliente TypeScript gerado e
a suíte completa. O contrato atual possui 89 paths e 120 operações.

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
