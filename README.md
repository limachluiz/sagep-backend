# SAGEP Backend

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Containers-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-ISC-green)

Backend do **SAGEP** — Sistema de Apoio à Gestão de Projetos.

O SAGEP foi pensado para apoiar o fluxo documental e operacional da **Divisão Técnica – Seção de Projetos**, permitindo o gerenciamento de projetos, documentos, estimativas, workflow, auditoria, permissões e painéis de acompanhamento.

---

## Sumário

- [Visão geral](#visão-geral)
- [Tecnologias](#tecnologias)
- [Principais funcionalidades](#principais-funcionalidades)
- [Fluxo documental do projeto](#fluxo-documental-do-projeto)
- [Arquitetura](#arquitetura)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Requisitos](#requisitos)
- [Como rodar o projeto](#como-rodar-o-projeto)
- [Scripts principais](#scripts-principais)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Perfis do sistema](#perfis-do-sistema)
- [Principais módulos e endpoints](#principais-módulos-e-endpoints)
- [DocumentaÃ§Ã£o da API](#documentaÃ§Ã£o-da-api)
- [Exemplos de uso da API](#exemplos-de-uso-da-api)
- [Dashboards](#dashboards)
- [Testes](#testes)
- [Observações](#observações)
- [Licença](#licença)

---

## Visão geral

O backend do SAGEP centraliza a gestão de projetos e documentos técnicos, cobrindo desde a estimativa inicial até a conclusão do serviço. O sistema foi evoluído para suportar:

- workflow documental centralizado
- auditoria de ações e eventos de autenticação
- permissões granulares por perfil
- dashboards operacionais e executivos
- arquivamento e restauração de entidades
- relatórios e exportações
- gestão de sessões

---

## Tecnologias

- **Node.js**
- **TypeScript**
- **Express**
- **Prisma**
- **PostgreSQL**
- **Docker**

---

## Principais funcionalidades

- Autenticação com **JWT**
- Controle de acesso por **perfil e permissões**
- Gestão de **usuários**
- Gestão de **projetos**
- Gestão de **tarefas**
- Gestão de **membros de projeto**
- Gestão de **ATAs**
- Gestão de **itens de ATA por região/localidade**
- Gestão de **estimativas de preço**
- Emissão e controle de **DIEx requisitório**
- Emissão e controle de **Ordem de Serviço**
- Workflow documental centralizado
- Auditoria e histórico de ações
- Busca global
- Alertas operacionais
- Dashboard operacional
- Dashboard executivo/financeiro
- Exportação de projetos em **XLSX**
- Dossiê de projeto em **JSON** e **PDF**
- Arquivamento e restauração de entidades
- Gestão de sessão e auditoria de autenticação

---

## Fluxo documental do projeto

O SAGEP segue o fluxo real da Divisão Técnica – Seção de Projetos:

1. **Estimativa de Preço**
2. **Aguardando Nota de Crédito**
3. **DIEx Requisitório**
4. **Aguardando Nota de Empenho**
5. **OS Liberada**
6. **Serviço em Execução**
7. **Analisando As-Built**
8. **Atestar NF**
9. **Serviço Concluído**

---

## Arquitetura

A aplicação segue uma estrutura modular baseada em domínio, organizada por módulos de negócio e serviços especializados.

### Camadas principais

- **Controllers**: recebem a requisição HTTP, validam entrada e delegam regras de negócio.
- **Services**: concentram regras de negócio, workflow, permissões e integrações com Prisma.
- **Schemas**: validam entrada usando Zod.
- **Middleware**: autenticação, autorização e tratamento de erros.
- **Prisma**: acesso ao banco PostgreSQL.
- **Audit / Workflow / Permissions**: serviços centrais para rastreabilidade e consistência.

### Componentes importantes

- **Auth**: login, refresh, logout, gestão de sessões e auditoria de autenticação.
- **Projects**: núcleo do sistema, com workflow, timeline, details e next-action.
- **Diex / Service Orders**: documentos operacionais integrados ao estado do projeto.
- **Dashboard / Alerts / Search**: visões gerenciais e operacionais.
- **Exports / Reports**: geração de XLSX, dossier JSON e PDF.

---

## Estrutura de pastas

```text
sagep-backend/
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── config/
│   ├── middlewares/
│   ├── modules/
│   │   ├── audit/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── diex/
│   │   ├── exports/
│   │   ├── global-search/
│   │   ├── operational-alerts/
│   │   ├── permissions/
│   │   ├── projects/
│   │   ├── reports/
│   │   ├── service-orders/
│   │   ├── tasks/
│   │   ├── users/
│   │   └── workflow/
│   ├── shared/
│   ├── types/
│   ├── routes.ts
│   └── server.ts
├── tests/
│   └── critical-flows.test.ts
├── package.json
└── tsconfig.json
```

---

## Requisitos

Antes de iniciar, você precisa ter instalado:

- **Node.js** 20+
- **Docker** e **Docker Compose**
- **PostgreSQL** (caso não utilize via Docker)

---

## Como rodar o projeto

### 1. Clonar o repositório

```bash
git clone https://github.com/limachluiz/sagep-backend.git
cd sagep-backend
```

### 2. Instalar as dependências

```bash
npm install
```

### 3. Configurar as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com base neste exemplo:

```env
PORT=3000
NODE_ENV=development

DATABASE_URL="postgresql://sagep:sagep123@localhost:5432/sagep?schema=public"

JWT_ACCESS_SECRET="Senha forte aqui"
JWT_REFRESH_SECRET="Senha forte aqui"

JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
```

### 4. Subir o banco com Docker

```bash
docker compose up -d
```

### 5. Rodar as migrations e gerar o Prisma Client

```bash
npx prisma migrate dev
npx prisma generate
```

### 6. Rodar o seed

```bash
npm run prisma:seed
```

> O seed cria dados iniciais para facilitar o uso e os testes locais.

### 7. Iniciar o servidor em modo desenvolvimento

```bash
npm run dev
```

---

## Scripts principais

```bash
npm run dev             # inicia o servidor em modo watch
npm run build           # compila o projeto TypeScript
npm run start           # inicia a versão compilada
npm test                # roda os testes automatizados
npm run prisma:generate # gera o Prisma Client
npm run prisma:migrate  # executa migrations no ambiente local
npm run prisma:studio   # abre o Prisma Studio
npm run prisma:push     # sincroniza schema com banco
npm run prisma:reset    # reseta o banco local
npm run prisma:seed     # executa o seed
```

---

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `PORT` | Porta da aplicação |
| `NODE_ENV` | Ambiente de execução |
| `DATABASE_URL` | Conexão com PostgreSQL |
| `JWT_ACCESS_SECRET` | Segredo do token de acesso |
| `JWT_REFRESH_SECRET` | Segredo do refresh token |
| `JWT_ACCESS_EXPIRES_IN` | Tempo de expiração do access token |
| `JWT_REFRESH_EXPIRES_IN` | Tempo de expiração do refresh token |

---

## Perfis do sistema

Atualmente o sistema trabalha com os seguintes perfis:

- **ADMIN**
- **GESTOR**
- **PROJETISTA**
- **CONSULTA**

Além do perfil, o backend também utiliza permissões granulares para controlar ações específicas.

---

## Principais módulos e endpoints

### Autenticação
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/sessions` (paginado; `format=legacy` disponÃ­vel)

### Usuários
- `GET /api/users` (paginado; filtros `role`, `active`, `search`)
- `POST /api/users`
- `PATCH /api/users/:id`

### Projetos
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `GET /api/projects/code/:code`
- `GET /api/projects/:id/details`
- `PATCH /api/projects/:id`
- `PATCH /api/projects/:id/flow`
- `DELETE /api/projects/:id`
- `POST /api/projects/:id/restore`

### Tarefas
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`

### Estimativas
- `GET /api/estimates`
- `POST /api/estimates`
- `PATCH /api/estimates/:id`

### DIEx
- `GET /api/diex`
- `POST /api/diex`
- `GET /api/diex/:id`
- `GET /api/diex/code/:code`
- `DELETE /api/diex/:id`
- `POST /api/diex/:id/restore`

### Ordem de Serviço
- `GET /api/service-orders`
- `POST /api/service-orders`
- `GET /api/service-orders/:id`
- `GET /api/service-orders/code/:code`
- `DELETE /api/service-orders/:id`
- `POST /api/service-orders/:id/restore`

### Visões e relatórios
- `GET /api/search`
- `GET /api/operational-alerts`
- `GET /api/dashboard/operational`
- `GET /api/dashboard/executive`
- `GET /api/exports/projects.xlsx`
- `GET /api/reports/projects/:id/dossier`
- `GET /api/reports/projects/:id/dossier.pdf`

---

## DocumentaÃ§Ã£o da API

A documentaÃ§Ã£o tÃ©cnica para consumo pelo frontend fica em:

- [docs/api/README.md](docs/api/README.md)
- [PadrÃµes da API](docs/api/patterns.md)
- [Auth, sessÃµes e permissÃµes](docs/api/auth-and-permissions.md)
- [Projetos, tarefas e estimativas](docs/api/projects-and-operations.md)
- [DIEx e Ordens de ServiÃ§o](docs/api/documents.md)
- [Dashboards, busca, alertas, relatÃ³rios e administraÃ§Ã£o](docs/api/insights-and-admin.md)

Ela documenta envelopes de listagem, paginaÃ§Ã£o, `format=legacy`, permissÃµes, arquivamento/restore e payloads principais.

---

## Exemplos de uso da API

### Health check

```http
GET http://localhost:3000/api/health
```

### Login

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json
```

```json
{
  "email": "admin@sagep.com",
  "password": "123456"
}
```

### Buscar projetos

```http
GET http://localhost:3000/api/projects
Authorization: Bearer <accessToken>
```

### Buscar detalhes de um projeto

```http
GET http://localhost:3000/api/projects/:id/details
Authorization: Bearer <accessToken>
```

### Emitir DIEx

```http
POST http://localhost:3000/api/diex
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Exportar projetos em XLSX

```http
GET http://localhost:3000/api/exports/projects.xlsx
Authorization: Bearer <accessToken>
```

---

## Dashboards

O backend já disponibiliza visões separadas para acompanhamento:

- **Dashboard operacional**
- **Dashboard executivo**
- **Dashboard financeiro**

Esses endpoints utilizam regras de permissão e filtros temporais conforme o perfil do usuário.

---

## Testes

Para rodar os testes automatizados:

```bash
npm test
```

A suíte cobre fluxos críticos como:

- autenticação
- workflow de projeto
- emissão de DIEx
- emissão de Ordem de Serviço
- permissões
- busca global
- dashboards
- exportações e relatórios
- arquivamento e restore

---

## Observações

- O projeto utiliza **arquivamento funcional** em vez de exclusão física para entidades principais.
- O backend possui auditoria para eventos relevantes de autenticação, workflow e documentos.
- Para desenvolvimento local, é recomendado usar um banco exclusivo para testes quando rodar a suíte automatizada.
- A revogação de sessão invalida o refresh token; o access token atual permanece válido até expirar.

---

## Licença

Este projeto está sob a licença **ISC**.
