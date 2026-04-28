# Projetos, Tarefas E Estimativas

## Projects

Base:

```text
/api/projects
```

### Endpoints

| Metodo | Rota | Descricao | Permissao/regra |
|---|---|---|---|
| `GET` | `/projects` | Lista projetos. | Autenticado; escopo por projeto para nao privilegiados. |
| `POST` | `/projects` | Cria projeto. | Regras de edicao de projeto. |
| `GET` | `/projects/:id` | Detalhe simples. | Pode ver projeto. |
| `GET` | `/projects/code/:code` | Detalhe por codigo. | Pode ver projeto. |
| `GET` | `/projects/:id/details` | Visao amigavel para tela de projeto. | Pode ver projeto. |
| `GET` | `/projects/:id/timeline` | Timeline de auditoria. | Pode ver projeto. |
| `GET` | `/projects/:id/next-action` | Proxima acao do workflow. | Pode ver projeto. |
| `PATCH` | `/projects/:id` | Atualiza dados basicos. | `projects.edit_all` ou `projects.edit_own` em escopo. |
| `PATCH` | `/projects/:id/flow` | Atualiza etapa/marcos documentais. | Regras de edicao e workflow. |
| `DELETE` | `/projects/:id` | Arquiva projeto. | Regras de edicao; bloqueia se houver vinculos. |
| `POST` | `/projects/:id/restore` | Restaura projeto. | `projects.restore`. |

### Listagem

```http
GET /api/projects?page=1&pageSize=50&search=manaus
```

Filtros:

| Param | Tipo |
|---|---|
| `code` | number |
| `status` | `PLANEJAMENTO`, `EM_ANDAMENTO`, `PAUSADO`, `CONCLUIDO`, `CANCELADO` |
| `stage` | etapa do workflow |
| `search` | string |
| `includeArchived` | boolean, apenas `ADMIN` |
| `onlyArchived` | boolean, apenas `ADMIN` |
| `format` | `envelope` ou `legacy` |

### Criar Projeto

```http
POST /api/projects
```

```json
{
  "title": "Projeto CFTV Manaus",
  "description": "Projeto de instalacao",
  "status": "PLANEJAMENTO",
  "startDate": "2026-04-01T00:00:00.000Z",
  "endDate": "2026-05-01T00:00:00.000Z"
}
```

### Atualizar Fluxo

```http
PATCH /api/projects/:id/flow
```

Campos aceitos:

```json
{
  "stage": "AGUARDANDO_NOTA_CREDITO",
  "creditNoteNumber": "NC-001",
  "creditNoteReceivedAt": "2026-04-01T00:00:00.000Z",
  "diexNumber": "DIEX-001",
  "diexIssuedAt": "2026-04-02T00:00:00.000Z",
  "commitmentNoteNumber": "NE-001",
  "commitmentNoteReceivedAt": "2026-04-03T00:00:00.000Z",
  "serviceOrderNumber": "OS-001",
  "serviceOrderIssuedAt": "2026-04-04T00:00:00.000Z",
  "executionStartedAt": "2026-04-05T00:00:00.000Z",
  "asBuiltReceivedAt": "2026-04-10T00:00:00.000Z",
  "invoiceAttestedAt": "2026-04-15T00:00:00.000Z",
  "serviceCompletedAt": "2026-04-20T00:00:00.000Z"
}
```

### Details

`GET /projects/:id/details` e o endpoint recomendado para a tela principal do projeto. Retorna:

- `project`: identificacao, dono, membros e datas.
- `workflow`: etapa, status, marcos e proxima acao.
- `pendingActions`: pendencias calculadas.
- `timeline`: auditoria do projeto.
- `documents`: ultimas estimativas, DIEx e OS.
- `financialSummary`: totais financeiros sem arquivados por padrao.
- `operationalSummary`: contagens, incluindo `openTasksCount` sem arquivadas.

Use `includeArchived=true` apenas em telas administrativas.

## Project Members

Rotas aninhadas:

```http
POST /api/projects/:id/members
GET /api/projects/:id/members
DELETE /api/projects/:id/members/:memberId
```

Uso: vincular usuarios ao projeto para acesso/operacao.

## Tasks

Base:

```text
/api/tasks
```

### Endpoints

| Metodo | Rota | Descricao | Permissao/regra |
|---|---|---|---|
| `GET` | `/tasks` | Lista tarefas. | Autenticado; `tasks.view_all` ve todas, demais por escopo. |
| `POST` | `/tasks` | Cria tarefa. | `tasks.create`. |
| `GET` | `/tasks/:id` | Detalhe por ID. | Pode ver tarefa. |
| `GET` | `/tasks/code/:code` | Detalhe por codigo. | Pode ver tarefa. |
| `PATCH` | `/tasks/:id/status` | Atualiza status. | `tasks.edit_all`, `tasks.edit_own` ou `tasks.complete`. |
| `PATCH` | `/tasks/:id` | Atualiza dados. | `tasks.edit_all`, `tasks.edit_own`; mudanca de responsavel exige `tasks.assign`. |
| `DELETE` | `/tasks/:id` | Arquiva tarefa. | `tasks.archive`. |
| `POST` | `/tasks/:id/restore` | Restaura tarefa. | `tasks.restore`. |

### Filtros

```http
GET /api/tasks?projectCode=1&status=PENDENTE&page=1&pageSize=20
```

| Param | Tipo |
|---|---|
| `code` | number |
| `projectCode` | number |
| `assigneeCode` | number |
| `status` | `PENDENTE`, `EM_ANDAMENTO`, `REVISAO`, `CONCLUIDA`, `CANCELADA` |
| `search` | string |
| `includeArchived`, `onlyArchived` | boolean, apenas `ADMIN` |
| `format` | `envelope` ou `legacy` |

### Criar Tarefa

```json
{
  "projectId": "...",
  "title": "Validar levantamento",
  "description": "Checar informacoes tecnicas",
  "status": "PENDENTE",
  "priority": 3,
  "assigneeId": "...",
  "dueDate": "2026-04-30T00:00:00.000Z"
}
```

`projectId` ou `projectCode` e obrigatorio. `assigneeId` ou `assigneeUserCode` sao opcionais, mas atribuir exige `tasks.assign`.

## Estimates

Base:

```text
/api/estimates
```

### Endpoints

| Metodo | Rota | Descricao | Permissao/regra |
|---|---|---|---|
| `GET` | `/estimates` | Lista estimativas. | Autenticado; `estimates.view_all` ve todas, demais por escopo. |
| `POST` | `/estimates` | Cria estimativa. | `estimates.create`. |
| `GET` | `/estimates/:id` | Detalhe por ID. | Pode ver estimativa. |
| `GET` | `/estimates/code/:code` | Detalhe por codigo. | Pode ver estimativa. |
| `GET` | `/estimates/:id/document/html` | Documento HTML. | Pode ver estimativa; arquivada retorna 404. |
| `GET` | `/estimates/:id/document/pdf` | Documento PDF. | Pode ver estimativa; arquivada retorna 404. |
| `PATCH` | `/estimates/:id/status` | Atualiza status. | `estimates.edit` ou `estimates.finalize`. |
| `PATCH` | `/estimates/:id` | Atualiza dados/itens. | `estimates.edit`; finalizar exige `estimates.finalize`. |
| `DELETE` | `/estimates/:id` | Arquiva estimativa. | `estimates.archive`; bloqueia se houver DIEx/OS ativos. |
| `POST` | `/estimates/:id/restore` | Restaura estimativa. | `estimates.restore`. |

### Filtros

| Param | Tipo |
|---|---|
| `code` | number |
| `projectCode` | number |
| `ataCode` | number |
| `omCode` | number |
| `status` | `RASCUNHO`, `FINALIZADA`, `CANCELADA` |
| `cityName` | string |
| `stateUf` | `AM`, `RO`, `RR`, `AC` |
| `search` | string |
| `includeArchived`, `onlyArchived` | boolean, apenas `ADMIN` |
| `format` | `envelope` ou `legacy` |

### Criar Estimativa

```json
{
  "projectId": "...",
  "ataId": "...",
  "coverageGroupId": "...",
  "omId": "...",
  "notes": "Observacao",
  "items": [
    {
      "ataItemId": "...",
      "quantity": 2,
      "notes": "Item principal"
    }
  ]
}
```

Tambem e possivel usar `projectCode`, `ataCode`, `coverageGroupCode`, `omCode` e `ataItemCode`.
