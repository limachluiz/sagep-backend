# SAGEP API

Esta documentacao descreve a API atual do backend para consumo pelo frontend e manutencao futura. A base HTTP padrao e:

```text
/api
```

Todas as rotas protegidas usam:

```http
Authorization: Bearer <accessToken>
```

## Estrutura

- [Padroes da API](./patterns.md): envelopes de listagem, paginacao, filtros, arquivamento e erros.
- [Auth, sessoes e permissoes](./auth-and-permissions.md): login, `/auth/me`, refresh, logout, sessoes e matriz RBAC.
- [Projetos e operacao](./projects-and-operations.md): projetos, membros, tarefas, estimativas e fluxo documental.
- [Documentos](./documents.md): DIEx, Ordens de Servico, HTML/PDF e restore.
- [Consulta e gestao](./insights-and-admin.md): dashboards, busca, alertas, exports, reports, usuarios, atas e OMs.

## Modulos Principais

| Modulo | Base | Observacoes |
|---|---|---|
| Auth | `/auth` | Login, refresh, logout, `/me`, sessoes proprias e administrativas. |
| Projects | `/projects` | Entidade central; possui workflow, details, timeline e next action. |
| Tasks | `/tasks` | Tarefas operacionais vinculadas a projetos. |
| Estimates | `/estimates` | Estimativas de preco vinculadas a projeto, ATA, grupo de cobertura e OM. |
| DIEx | `/diex` | Documento requisitorio gerado a partir de projeto e estimativa finalizada. |
| Service Orders | `/service-orders` | Ordem de Servico gerada apos DIEx e Nota de Empenho. |
| Dashboard | `/dashboard` | Visoes operacional, executiva e financeira. |
| Search | `/search` | Busca global agrupada. |
| Operational Alerts | `/operational-alerts` | Alertas e filas operacionais. |
| Exports | `/exports` | Exportacoes, atualmente XLSX de projetos. |
| Reports | `/reports` | Dossie de projeto em JSON/PDF. |
| Users | `/users` | Gestao administrativa de usuarios. |
| ATAs | `/atas`, `/ata-items` | Catalogo de atas, cobertura e itens. |
| OMs | `/military-organizations` | Organizacoes militares/destinos. |

## Fluxo Documental

O projeto passa pelas etapas:

1. `ESTIMATIVA_PRECO`
2. `AGUARDANDO_NOTA_CREDITO`
3. `DIEX_REQUISITORIO`
4. `AGUARDANDO_NOTA_EMPENHO`
5. `OS_LIBERADA`
6. `SERVICO_EM_EXECUCAO`
7. `ANALISANDO_AS_BUILT`
8. `ATESTAR_NF`
9. `SERVICO_CONCLUIDO`
10. `CANCELADO`

O backend valida saltos de etapa e requisitos documentais no servico de workflow. O frontend deve preferir `GET /projects/:id/details` e `GET /projects/:id/next-action` para decidir a proxima acao de tela.

## Resposta De Listagens

As listagens dos modulos principais usam envelope por padrao:

```json
{
  "items": [],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 0,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "filters": {},
  "links": {
    "self": "/api/tasks"
  }
}
```

Para compatibilidade temporaria, use:

```text
format=legacy
```

Rotas com `format=legacy`: `GET /projects`, `GET /tasks`, `GET /estimates`, `GET /diex`, `GET /service-orders`.

## Validacao Recomendada

```bash
npx tsc --noEmit
npm test
```
