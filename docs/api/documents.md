# Documentos: DIEx E Ordem De Servico

## DIEx

Base:

```text
/api/diex
```

### Endpoints

| Metodo | Rota | Descricao | Permissao/regra |
|---|---|---|---|
| `GET` | `/diex` | Lista DIEx. | Autenticado; escopo por projeto para nao privilegiados. |
| `POST` | `/diex` | Emite/cria DIEx. | `diex.issue`. |
| `GET` | `/diex/:id` | Detalhe por ID. | Pode ver projeto vinculado. |
| `GET` | `/diex/code/:code` | Detalhe por codigo. | Pode ver projeto vinculado. |
| `GET` | `/diex/:id/document/html` | Documento HTML. | DIEx ativo. |
| `GET` | `/diex/:id/document/pdf` | Documento PDF. | DIEx ativo. |
| `PATCH` | `/diex/:id` | Atualiza DIEx. | Regras de gerenciamento do projeto/documento. |
| `DELETE` | `/diex/:id` | Arquiva/cancela DIEx. | `diex.cancel`; bloqueia se houver OS ativa. |
| `POST` | `/diex/:id/restore` | Restaura DIEx. | `diex.restore`; projeto pai precisa estar ativo. |

### Listagem

```http
GET /api/diex?projectCode=1&page=1&pageSize=50
```

Filtros:

| Param | Tipo |
|---|---|
| `code` | number |
| `projectCode` | number |
| `estimateCode` | number |
| `search` | string |
| `includeArchived`, `onlyArchived` | boolean, apenas `ADMIN` |
| `archivedFrom`, `archivedUntil` | datas ISO, apenas `ADMIN`; filtram por periodo de arquivamento |
| `format` | `envelope` ou `legacy` |

### Criar DIEx

```json
{
  "projectId": "...",
  "estimateId": "...",
  "diexNumber": "DIEX-001",
  "issuedAt": "2026-04-01T00:00:00.000Z",
  "supplierCnpj": "12345678000190",
  "requesterName": "Requisitante",
  "requesterRank": "2 Ten",
  "requesterCpf": "11122233344",
  "requesterRole": "Requisitante",
  "issuingOrganization": "4 CTA",
  "commandName": "COMANDO MILITAR DA AMAZONIA",
  "pregaoNumber": "04/2025",
  "uasg": "160016",
  "notes": "Observacao"
}
```

Tambem aceita `projectCode` e `estimateCode`.

Regras importantes:

- Projeto e estimativa precisam estar ativos.
- Estimativa arquivada nao pode originar DIEx.
- Workflow exige pre-condicoes documentais, como Nota de Credito quando aplicavel.
- Arquivar DIEx atualiza o estado documental do projeto.
- Restore tambem reidrata os marcos documentais do projeto quando valido.

## Service Orders

Base:

```text
/api/service-orders
```

Tambem ha rota aninhada:

```text
/api/projects/:id/service-order
```

### Endpoints

| Metodo | Rota | Descricao | Permissao/regra |
|---|---|---|---|
| `GET` | `/service-orders` | Lista OS. | Autenticado; escopo por projeto para nao privilegiados. |
| `POST` | `/service-orders` | Emite/cria OS. | `service_orders.issue`. |
| `GET` | `/service-orders/:id` | Detalhe por ID. | Pode ver projeto vinculado. |
| `GET` | `/service-orders/code/:code` | Detalhe por codigo. | Pode ver projeto vinculado. |
| `GET` | `/service-orders/:id/document/html` | Documento HTML. | OS ativa. |
| `GET` | `/service-orders/:id/document/pdf` | Documento PDF. | OS ativa. |
| `PATCH` | `/service-orders/:id` | Atualiza OS. | Regras de gerenciamento do projeto/documento. |
| `DELETE` | `/service-orders/:id` | Arquiva/cancela OS. | `service_orders.cancel`. |
| `POST` | `/service-orders/:id/restore` | Restaura OS. | `service_orders.restore`; projeto/DIEx pai precisam estar ativos. |

### Listagem

Filtros:

| Param | Tipo |
|---|---|
| `code` | number |
| `projectCode` | number |
| `estimateCode` | number |
| `diexCode` | number |
| `emergency` | boolean |
| `search` | string |
| `includeArchived`, `onlyArchived` | boolean, apenas `ADMIN` |
| `archivedFrom`, `archivedUntil` | datas ISO, apenas `ADMIN`; filtram por periodo de arquivamento |
| `format` | `envelope` ou `legacy` |

### Criar OS

```json
{
  "projectId": "...",
  "estimateId": "...",
  "diexId": "...",
  "serviceOrderNumber": "OS-001",
  "issuedAt": "2026-04-03T00:00:00.000Z",
  "contractorCnpj": "12345678000190",
  "requesterName": "Fiscal",
  "requesterRank": "2 Ten",
  "requesterCpf": "11122233344",
  "isEmergency": false,
  "plannedStartDate": "2026-04-04T00:00:00.000Z",
  "plannedEndDate": "2026-04-20T00:00:00.000Z",
  "scheduleItems": [
    {
      "orderIndex": 1,
      "taskStep": "Instalacao",
      "scheduleText": "Executar instalacao inicial"
    }
  ],
  "deliveredDocuments": [
    {
      "description": "Relatorio fotografico",
      "isChecked": true
    }
  ],
  "notes": "Observacao"
}
```

Tambem aceita `projectCode`, `estimateCode` e `diexCode`.

Regras importantes:

- Projeto, estimativa e DIEx precisam estar ativos.
- Estimativa arquivada nao pode originar OS.
- DIEx arquivado nao pode originar OS.
- OS exige Nota de Empenho e DIEx conforme workflow.
- Arquivar/restaurar OS atualiza os marcos documentais do projeto.

## Documentos HTML/PDF

Estimativas, DIEx e OS possuem endpoints de documento:

```http
GET /api/estimates/:id/document/html
GET /api/estimates/:id/document/pdf
GET /api/diex/:id/document/html
GET /api/diex/:id/document/pdf
GET /api/service-orders/:id/document/html
GET /api/service-orders/:id/document/pdf
```

Entidades arquivadas/deletadas retornam `404` para documentos.
