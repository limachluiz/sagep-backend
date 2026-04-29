# Dashboards, Busca, Alertas, Relatorios E Administracao

## Dashboards

Base:

```text
/api/dashboard
```

| Metodo | Rota | Descricao | Permissao |
|---|---|---|---|
| `GET` | `/dashboard/operational` | Fila operacional, alertas e proximas acoes. | `dashboard.view_operational` |
| `GET` | `/dashboard/executive` | Indicadores executivos e financeiros agregados. | `dashboard.view_executive` |
| `GET` | `/dashboard` | Visao geral/financeira ampla. | `dashboard.financial_view` |

### Filtros Temporais

`/dashboard` e `/dashboard/executive` aceitam:

| Param | Tipo | Regra |
|---|---|---|
| `periodType` | `month`, `quarter`, `semester`, `year` | Usa `referenceDate` ou data atual. |
| `referenceDate` | date | Nao combinar com `startDate/endDate`. |
| `startDate` | date | Deve vir com `endDate`. |
| `endDate` | date | Deve ser >= `startDate`. |
| `asOfDate` | date | Ponto no tempo; nao combinar com os demais filtros. |

`/dashboard/operational` aceita:

| Param | Tipo | Padrao |
|---|---|---|
| `staleDays` | number | `15` |
| `limit` | number | `100` |

Arquivados nao entram nos dashboards padrao.

## Busca Global

```http
GET /api/search?q=manaus&limit=10
```

Query:

| Param | Tipo | Observacao |
|---|---|---|
| `q` | string | Obrigatorio. |
| `limit` | number | Maximo `20`. |

Resposta agrupada por tipo, com projetos, estimativas, DIEx e OS quando encontrados. Projetos/documentos arquivados nao entram no resultado padrao.

## Alertas Operacionais

```http
GET /api/operational-alerts?staleDays=15&limit=100
```

Query:

| Param | Tipo | Observacao |
|---|---|---|
| `staleDays` | number | Maximo `365`. |
| `limit` | number | Maximo `200`. |

Retorna resumo, grupos por severidade/categoria e lista de alertas operacionais. Arquivados nao entram no calculo.

## Exports

```http
GET /api/exports/projects.xlsx
```

Permissao: `reports.export`.

Filtros aceitos sao similares a `GET /projects`:

| Param | Tipo |
|---|---|
| `code` | number |
| `status` | status do projeto |
| `stage` | etapa do workflow |
| `search` | string |
| `includeArchived` | boolean para incluir projetos arquivados quando permitido |

Estimativas, DIEx e OS arquivados nao alimentam os campos padrao do XLSX.

## Reports

```http
GET /api/reports/projects/:id/dossier
GET /api/reports/projects/:id/dossier.pdf
```

Permissao: `reports.export`.

Uso: gerar dossie consolidado do projeto em JSON ou PDF.

## Users

Base:

```text
/api/users
```

Todas as rotas exigem `users.manage`.

Rotas principais:

```http
GET /api/users
POST /api/users
GET /api/users/:id
GET /api/users/code/:code
PATCH /api/users/:id
PATCH /api/users/:id/role
PATCH /api/users/:id/password
PATCH /api/users/:id/activation
```

Roles aceitos:

- `ADMIN`
- `GESTOR`
- `PROJETISTA`
- `CONSULTA`

## ATAs E Itens

Base:

```text
/api/atas
/api/ata-items
```

Leitura exige usuario autenticado para `ADMIN`, `GESTOR`, `PROJETISTA` e
`CONSULTA`. Escrita/manutencao exige `atas.manage`, permissao exclusiva de
`ADMIN`.

Rotas comuns:

```http
GET /api/atas
POST /api/atas
GET /api/atas/:id
GET /api/atas/code/:code
PATCH /api/atas/:id
DELETE /api/atas/:id
POST /api/atas/:id/items
PATCH /api/ata-items/:id
DELETE /api/ata-items/:id
```

Uso: catalogo de contratos/atas, grupos de cobertura, localidades e itens precificaveis usados em estimativas.

## Organizacoes Militares

Base:

```text
/api/military-organizations
```

Leitura exige usuario autenticado para `ADMIN`, `GESTOR`, `PROJETISTA` e
`CONSULTA`. Escrita/manutencao exige `military_organizations.manage`,
permissao exclusiva de `ADMIN`.

Uso: catalogo de OMs/destinos para estimativas.

## Health

```http
GET /api/health
```

Endpoint publico para verificacao basica da API.
