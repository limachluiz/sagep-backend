# OpenAPI Formal

Esta pasta complementa a documentacao narrativa em Markdown com uma
especificacao OpenAPI formal, gerada a partir do backend atual.

## Fontes

- Runtime: `GET /api/docs`
- JSON cru: `GET /api/docs/openapi.json`
- Fonte da especificacao: `src/docs/openapi.ts`

## Cobertura Atual

Modulos priorizados nesta primeira versao:

- `auth`
- `projects`
- `tasks`
- `estimates`
- `diex`
- `service-orders`
- `dashboard`
- `search`
- `operational-alerts`
- `exports`
- `reports`
- `users`
- `atas`
- `ata-items`
- `military-organizations`

Tambem inclui:

- autenticacao Bearer JWT
- envelopes de paginacao
- `format=legacy` onde aplicavel
- filtros `includeArchived` / `onlyArchived`
- endpoints de arquivamento e restore
- sessoes proprias e administrativas
- grupos de permissao por operacao via `x-permissions`

## Observacoes

- A especificacao prioriza compatibilidade com as rotas realmente expostas em `src/routes.ts`.
- A documentacao Markdown continua sendo a referencia narrativa e de regras de negocio.
- A UI em `/api/docs` e propositalmente simples, local e sem dependencia externa de CDN.
- Alguns payloads administrativos e de catalogos foram documentados com schemas mais amplos (`additionalProperties`) quando o backend atual retorna estruturas extensas ou pouco estaveis.

## Export E Validacao

```bash
npm run openapi:validate
npm run openapi:export
```

O comando de export gera:

```text
docs/api/openapi/openapi.json
```
