# SAGEP Backend

Backend do **SAGEP** — Sistema de Apoio à Gestão de Projetos.

O projeto centraliza o fluxo operacional e documental da Seção de Projetos, cobrindo desde a estimativa de preço até a conclusão do serviço, com rastreabilidade, governança de permissões, dashboards e controle de saldo dos itens da ATA.

## Visão geral

O SAGEP foi estruturado para apoiar a gestão de projetos técnicos com foco em:

- controle do fluxo documental real do processo;
- gestão de projetos, tarefas e membros;
- emissão e acompanhamento de Estimativas, DIEx e Ordens de Serviço;
- governança de acesso via RBAC persistido no banco;
- auditoria de ações críticas;
- dashboards operacionais, executivos e financeiros;
- gestão de saldo dos itens da ATA com reserva, consumo, estorno e rollback de NE.

## Stack técnica

- Node.js 20+
- TypeScript
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
- RBAC governado pelo banco com permissões por role e overrides por usuário;
- projetos com workflow documental;
- tarefas e membros de projeto;
- catálogo de ATAs e itens de ATA;
- estimativas de preço;
- DIEx requisitório;
- Ordens de Serviço;
- saldo dos itens da ATA por movimentação;
- dashboards operacional, executivo e visão geral;
- alertas operacionais;
- relatórios e exportações;
- auditoria e timeline.

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

Com o módulo de saldo da ATA:

- a estimativa consulta saldo disponível;
- o DIEx reserva saldo;
- a NE consome saldo;
- o cancelamento da NE estorna saldo e faz rollback documental do projeto.

## Requisitos para rodar localmente

- Node.js 20 ou superior
- npm
- PostgreSQL 15+ ou Docker Compose
- acesso local para criar e migrar o banco

## Variáveis de ambiente

Crie o `.env` com base em `.env.example`.

Variáveis usadas atualmente:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `PORT` | sim | Porta HTTP da aplicação |
| `NODE_ENV` | sim | Ambiente de execução |
| `DATABASE_URL` | sim | String de conexão PostgreSQL |
| `JWT_ACCESS_SECRET` | sim | Segredo do access token |
| `JWT_REFRESH_SECRET` | sim | Segredo do refresh token |
| `JWT_ACCESS_EXPIRES_IN` | sim | Expiração do access token |
| `JWT_REFRESH_EXPIRES_IN` | sim | Expiração do refresh token |

Exemplo:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://sagep:sagep123@localhost:5432/sagep?schema=public"
JWT_ACCESS_SECRET="Senha forte aqui"
JWT_REFRESH_SECRET="Outra senha forte aqui"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
```

## Como rodar

1. Instale dependências:

```bash
npm install
```

2. Suba o banco:

```bash
docker compose up -d
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
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:seed:dev
npm run prisma:seed:demo
npm run prisma:studio
```

## Usuário admin do seed

Seed local padrão:

- e-mail: `admin@sagep.com`
- senha: `123456`
- role: `ADMIN`

Outros usuários seeded:

- `gestor@sagep.com`
- `projetista@sagep.com`
- `consulta@sagep.com`

Essas credenciais são para desenvolvimento local.

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
- O frontend pode tomar o `README` como porta de entrada e os arquivos em `docs/` como base funcional.
