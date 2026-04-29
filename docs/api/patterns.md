# Padroes Da API

## Autenticacao

Rotas protegidas exigem access token JWT:

```http
Authorization: Bearer <accessToken>
```

Erros comuns:

```json
{ "message": "Token não informado" }
```

```json
{ "message": "Você não tem permissão para acessar este recurso" }
```

## Listagens Com Envelope

As listagens principais retornam envelope por padrao:

```json
{
  "items": [{ "id": "..." }],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 120,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "filters": {
    "search": "manaus",
    "includeArchived": false
  },
  "links": {
    "self": "/api/projects?search=manaus"
  }
}
```

Parametros transversais:

| Param | Tipo | Padrao | Observacao |
|---|---:|---:|---|
| `page` | number | `1` | Pagina atual. |
| `pageSize` | number | `50` | Maximo `100`. |
| `format` | `envelope` ou `legacy` | `envelope` | `legacy` retorna o array antigo. |

Listagens com envelope/legacy:

- `GET /projects`
- `GET /tasks`
- `GET /estimates`
- `GET /diex`
- `GET /service-orders`

## Filtros De Arquivamento

Entidades com arquivamento funcional:

- `Project`
- `Task`
- `Estimate`
- `DiexRequest`
- `ServiceOrder`

Parametros:

| Param | Uso |
|---|---|
| `includeArchived=true` | Retorna ativos e arquivados. Apenas `ADMIN`. |
| `onlyArchived=true` | Retorna somente arquivados. Apenas `ADMIN`. |

Por padrao, arquivados e deletados logicamente nao aparecem em listagens, detalhes, dashboards, exports e resumos operacionais/financeiros.

## IDs E Codigos Amigaveis

Os modulos principais aceitam busca por `id` e por codigo sequencial:

| Entidade | Por ID | Por codigo |
|---|---|---|
| Project | `/projects/:id` | `/projects/code/:code` |
| Task | `/tasks/:id` | `/tasks/code/:code` |
| Estimate | `/estimates/:id` | `/estimates/code/:code` |
| DIEx | `/diex/:id` | `/diex/code/:code` |
| Service Order | `/service-orders/:id` | `/service-orders/code/:code` |

## Arquivamento E Restore

`DELETE` nos modulos principais arquiva. Nao ha remocao fisica para o consumo normal.

| Entidade | Arquivar | Restaurar |
|---|---|---|
| Project | `DELETE /projects/:id` | `POST /projects/:id/restore` |
| Task | `DELETE /tasks/:id` | `POST /tasks/:id/restore` |
| Estimate | `DELETE /estimates/:id` | `POST /estimates/:id/restore` |
| DIEx | `DELETE /diex/:id` | `POST /diex/:id/restore` |
| Service Order | `DELETE /service-orders/:id` | `POST /service-orders/:id/restore` |

Payload comum:

```json
{
  "message": "Tarefa arquivada com sucesso",
  "permissionUsed": "tasks.archive",
  "task": {
    "id": "...",
    "archivedAt": "2026-04-27T00:00:00.000Z"
  }
}
```

## Auditoria

Acoes relevantes geram `AuditLog`, incluindo:

- `CREATE`
- `UPDATE`
- `ARCHIVE`
- `RESTORE`
- `STATUS_CHANGE`
- `STAGE_CHANGE`
- `ISSUE`
- `CANCEL`
- eventos de auth/sessao

Para projetos, consulte:

```http
GET /api/projects/:id/timeline
```

Esse endpoint agrega eventos de auditoria de `PROJECT`, `ESTIMATE`,
`DIEX_REQUEST`, `SERVICE_ORDER` e `TASK` relacionados ao projeto. Os itens
incluem `entityType`, `entityId`, `source` e `context`, alem dos campos comuns
de auditoria, para facilitar a renderizacao por modulo no frontend.
