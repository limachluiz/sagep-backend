# API do SAGEP

Base padrão local:

- `http://localhost:3000/api`

Autenticação:

- Bearer JWT no header `Authorization: Bearer <token>`

Documentação viva:

- HTML: `GET /api/docs`
- OpenAPI JSON: `GET /api/docs/openapi.json`

## Convenções gerais

- A maioria das rotas exige autenticação.
- Alguns endpoints usam permissão explícita na rota; outros aplicam regras de ownership e role no service.
- Campos monetários e quantitativos costumam ser serializados como string decimal.
- Entidades principais suportam arquivamento (`archivedAt`) e, em alguns casos, deleção lógica (`deletedAt`).

---

## Health

### Objetivo

Verificar se a API está de pé.

### Endpoints

#### `GET /health`

- Autenticação: não
- Permissão: não
- Resposta resumida:

```json
{
  "status": "ok"
}
```

- Erros comuns:
  - `500` em falha inesperada do servidor

---

## Auth

### Objetivo

Autenticação, sessão, refresh token e autogestão de sessões.

### Endpoints

#### `POST /auth/register`

- Autenticação: não
- Permissão: não
- Body exemplo:

```json
{
  "name": "Usuário Exemplo",
  "email": "usuario@sagep.com",
  "password": "123456"
}
```

- Resposta resumida:

```json
{
  "id": "usr_123",
  "email": "usuario@sagep.com",
  "role": "CONSULTA"
}
```

- Erros comuns:
  - `409` e-mail já cadastrado
  - `400` body inválido

#### `POST /auth/login`

- Autenticação: não
- Permissão: não
- Body exemplo:

```json
{
  "email": "admin@sagep.com",
  "password": "123456"
}
```

- Resposta resumida:

```json
{
  "accessToken": "jwt",
  "refreshToken": "token",
  "user": {
    "id": "usr_123",
    "role": "ADMIN",
    "permissions": ["projects.view_all", "dashboard.view_executive"]
  }
}
```

- Erros comuns:
  - `401` credenciais inválidas
  - `403` usuário inativo

#### `POST /auth/refresh`

- Autenticação: não
- Permissão: não
- Body exemplo:

```json
{
  "refreshToken": "token"
}
```

- Resposta resumida:

```json
{
  "accessToken": "novo-jwt",
  "refreshToken": "novo-token"
}
```

- Erros comuns:
  - `401` refresh token inválido, expirado ou revogado

#### `POST /auth/logout`

- Autenticação: não
- Permissão: não
- Body exemplo:

```json
{
  "refreshToken": "token"
}
```

- Resposta resumida:

```json
{
  "message": "Logout realizado com sucesso"
}
```

#### `GET /auth/me`

- Autenticação: sim
- Permissão: qualquer usuário autenticado
- Resposta resumida:

```json
{
  "id": "usr_123",
  "email": "admin@sagep.com",
  "role": "ADMIN",
  "permissions": ["projects.view_all"],
  "access": {
    "role": "ADMIN",
    "permissions": ["projects.view_all"],
    "isAdmin": true
  }
}
```

#### `GET /auth/sessions`

- Autenticação: sim
- Permissão: `sessions.manage_own`
- Resposta resumida:

```json
{
  "items": [
    {
      "id": "sess_123",
      "current": true,
      "expiresAt": "2026-05-10T00:00:00.000Z"
    }
  ]
}
```

#### `POST /auth/sessions/revoke-all`

- Autenticação: sim
- Permissão: `sessions.manage_own`

#### `POST /auth/sessions/:sessionId/revoke`

- Autenticação: sim
- Permissão: `sessions.manage_own`

#### `POST /auth/sessions/cleanup`

- Autenticação: sim
- Permissão: `sessions.manage_all`

#### `GET /auth/users/:userId/sessions`

- Autenticação: sim
- Permissão: `sessions.manage_all`

#### `POST /auth/users/:userId/sessions/revoke-all`

- Autenticação: sim
- Permissão: `sessions.manage_all`

#### `POST /auth/users/:userId/sessions/:sessionId/revoke`

- Autenticação: sim
- Permissão: `sessions.manage_all`

- Erros comuns do bloco de sessões:
  - `401` token inválido
  - `403` permissão insuficiente
  - `404` sessão ou usuário não encontrado

---

## Users

### Objetivo

Administração de usuários do sistema.

### Endpoints

#### `POST /users`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `users.manage`
- Body exemplo:

```json
{
  "name": "Novo Gestor",
  "email": "novo.gestor@sagep.com",
  "password": "123456",
  "role": "GESTOR"
}
```

- Resposta resumida:

```json
{
  "id": "usr_456",
  "email": "novo.gestor@sagep.com",
  "role": "GESTOR"
}
```

#### `GET /users`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `users.manage`

#### `GET /users/:id`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `users.manage`

#### `PATCH /users/:id`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `users.manage`
- Campos: `name`, `email`, `rank`, `cpf`

#### `PATCH /users/:id/status`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `users.manage`
- Campos: `active`
- Bloqueia a auto-desativação quando isso deixaria o sistema sem ADMIN ativo.

#### `PATCH /users/:id/role`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `users.manage`
- Body exemplo:

```json
{
  "role": "PROJETISTA"
}
```

- Erros comuns:
  - `403` tentativa de autoalteração proibida em cenários sensíveis
  - `404` usuário não encontrado
  - `409` regra de segurança/role inválida

---

## Projects

### Objetivo

Entidade principal do sistema. Representa o ciclo de vida completo do projeto.

### Endpoints

#### `POST /projects`

- Autenticação: sim
- Permissão: autenticado; criação validada pelo domínio
- Body exemplo:

```json
{
  "title": "Implantação de CFTV",
  "description": "Projeto piloto"
}
```

#### `GET /projects`

- Autenticação: sim
- Permissão: acesso por ownership, membership ou `projects.view_all`

#### `GET /projects/code/:code`

- Autenticação: sim

#### `GET /projects/:id`

- Autenticação: sim

#### `PATCH /projects/:id`

- Autenticação: sim
- Permissão: `projects.edit_own` ou `projects.edit_all`

#### `PATCH /projects/:id/flow`

- Autenticação: sim
- Permissão: `projects.edit_own` ou `projects.edit_all`
- Body exemplo:

```json
{
  "stage": "AGUARDANDO_NOTA_EMPENHO",
  "commitmentNoteNumber": "NE-2026-001",
  "commitmentNoteReceivedAt": "2026-05-02T00:00:00.000Z"
}
```

- Observação:
  - informar a NE pode consumir saldo da ATA;
  - avançar etapas depende de documentos e regras do workflow.

#### `PATCH /projects/:id/as-built/review`

- Autenticação: sim
- Permissão: `projects.edit_own` ou `projects.edit_all`
- Regras:
  - somente disponível quando o projeto estiver em `ANALISANDO_AS_BUILT`;
  - se aprovado, o projeto avança para `ATESTAR_NF`;
  - se reprovado, exige motivo, limpa `asBuiltReceivedAt` e retorna para `SERVICO_EM_EXECUCAO`.
- Body exemplo para aprovação:

```json
{
  "approved": true,
  "reviewedAt": "2026-05-06T10:00:00.000Z"
}
```

- Body exemplo para reprovação:

```json
{
  "approved": false,
  "reviewedAt": "2026-05-06T10:00:00.000Z",
  "rejectionReason": "Documento incompleto"
}
```

#### `POST /projects/:id/commitment-note/cancel`

- Autenticação: sim
- Permissão: `projects.edit_own` ou `projects.edit_all`
- Body exemplo:

```json
{
  "reason": "Empenho cancelado pelo setor financeiro"
}
```

- Resposta resumida:

```json
{
  "message": "Nota de Empenho cancelada com rollback documental e financeiro",
  "rollback": {
    "estimateId": "est_123",
    "diexRequestId": "diex_123",
    "serviceOrderId": "os_123"
  }
}
```

#### `GET /projects/:id/details`

- Autenticação: sim
- Objetivo:
  - consolidado funcional do projeto para tela de detalhe

#### `GET /projects/:id/timeline`

- Autenticação: sim
- Objetivo:
  - timeline com auditoria agregada

#### `GET /projects/:id/next-action`

- Autenticação: sim
- Objetivo:
  - próxima ação sugerida do workflow

#### `POST /projects/:id/members`

- Autenticação: sim
- Permissão: gestão do projeto

#### `GET /projects/:id/members`

- Autenticação: sim

#### `DELETE /projects/:id/members/:memberId`

- Autenticação: sim

#### `DELETE /projects/:id`

- Autenticação: sim
- Permissão: gestão do projeto
- Observação:
  - arquiva o projeto, não remove fisicamente

#### `POST /projects/:id/restore`

- Autenticação: sim
- Permissão: `projects.restore`
- Body opcional:

```json
{
  "cascade": true
}
```

- Erros comuns:
  - `403` sem permissão
  - `404` projeto não encontrado
  - `409` transição de etapa inválida ou dependência inconsistente

---

## Tasks

### Objetivo

Gestão operacional de tarefas vinculadas aos projetos.

### Endpoints

#### `POST /tasks`

- Autenticação: sim
- Permissão: `tasks.create`

#### `GET /tasks`

- Autenticação: sim

#### `GET /tasks/code/:code`

- Autenticação: sim

#### `GET /tasks/:id`

- Autenticação: sim

#### `PATCH /tasks/:id`

- Autenticação: sim
- Permissão: `tasks.edit_all`, `tasks.edit_own` ou `tasks.assign`

#### `PATCH /tasks/:id/status`

- Autenticação: sim
- Permissão: `tasks.edit_all`, `tasks.edit_own` ou `tasks.complete`

#### `DELETE /tasks/:id`

- Autenticação: sim
- Permissão: `tasks.archive`

#### `POST /tasks/:id/restore`

- Autenticação: sim
- Permissão: `tasks.restore`

- Erros comuns:
  - `403` sem permissão
  - `409` tarefa arquivada ou fluxo inconsistente

---

## ATAs

### Objetivo

Cadastro da ata e sua estrutura de cobertura.

### Endpoints

#### `POST /atas`

- Autenticação: sim
- Permissão: `atas.manage`

#### `GET /atas`

- Autenticação: sim

#### `GET /atas/code/:code`

- Autenticação: sim

#### `GET /atas/:id`

- Autenticação: sim

#### `PATCH /atas/:id`

- Autenticação: sim
- Permissão: `atas.manage`

#### `DELETE /atas/:id`

- Autenticação: sim
- Permissão: `atas.manage`

#### `POST /atas/:id/coverage-groups`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `atas.manage`
- Cria um grupo de cobertura sem substituir os demais grupos da ATA.
- Body: `code`, `name`, `description` opcional e `localities`.

#### `PATCH /atas/:id/coverage-groups/:groupId`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `atas.manage`
- Atualiza parcialmente um grupo de cobertura. Quando `localities` for enviado, substitui apenas as localidades desse grupo.

#### `DELETE /atas/:id/coverage-groups/:groupId`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `atas.manage`
- Remove o grupo quando ele ainda não possui itens ou estimativas vinculadas.

- Erros comuns:
  - `404` ata não encontrada
  - `409` vínculo ou regra de integridade

---

## Integrações Compras.gov.br

### Objetivo

Importar ATA de Registro de Preços e itens a partir da API pública do Compras.gov.br, sempre pelo backend.

### Endpoints

#### `GET /integrations/compras-gov/atas/preview`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `atas.manage`
- Query: `uasg`, `numeroPregao`, `anoPregao`, `numeroAta` opcional

#### `POST /integrations/compras-gov/atas/import`

- Autenticação: sim
- Role: `ADMIN`
- Permissão: `atas.manage`
- Body: `uasg`, `numeroPregao`, `anoPregao`, `numeroAta` opcional, `ataType`, `coverageGroupId` opcional, `coverageGroupCode` opcional, `coverageGroupName` opcional, `coverageGroupStateUf` opcional, `coverageGroupCityName` opcional, `coverageGroupLocalities` opcional, `dryRun` opcional
- Cria ou atualiza a ATA e cria ou atualiza itens sem duplicar por `ataId`, grupo e `referenceCode`.

```json
{
  "uasg": "120624",
  "numeroPregao": "90001",
  "anoPregao": "2026",
  "numeroAta": "0001",
  "ataType": "CFTV",
  "coverageGroupCode": "MAO",
  "coverageGroupName": "Manaus",
  "coverageGroupStateUf": "AM",
  "coverageGroupCityName": "Manaus"
}
```

#### Saldos externos Compras.gov.br

- `GET /atas/:id/external-balance`: le apenas snapshots externos persistidos no banco; nao consulta Compras.gov.br.
- `POST /atas/:id/sync-external-balance`: consulta Compras.gov.br e atualiza snapshots persistidos dos itens processados, sem alterar saldo local.
- `GET /ata-items/:id/balance-comparison`: le apenas o ultimo snapshot persistido do item; se nao existir, retorna `NAO_SINCRONIZADO`.
- `POST /ata-items/:id/sync-external-balance`: consulta Compras.gov.br e atualiza apenas o snapshot persistido do item informado, sem sincronizar os demais itens da ATA.
- Status: `OK`, `DIVERGENTE`, `CONSUMO_EXTERNO_DETECTADO`, `NAO_SINCRONIZADO`, `NAO_ENCONTRADO`, `ERRO_CONSULTA_EXTERNA`, `RATE_LIMIT_COMPRAS_GOV`, `SEM_EMPENHO_REGISTRADO`.
- HTTP `429` do Compras.gov.br e tratado como `RATE_LIMIT_COMPRAS_GOV`: nao aplica fallback importado, nao marca `SEM_EMPENHO_REGISTRADO` e a sincronizacao nao atualiza `externalLastSyncAt`. Quando disponivel, `retryAfterSeconds` informa a espera sugerida.
- A consulta externa da ATA tenta primeiro `4_consultarEmpenhosSaldoItem` por `numeroAta` e `unidadeGerenciadora`. Se o endpoint oficial retornar vazio, o backend usa o `externalItemId`/`externalItemNumber` do item para consultar `2.1_consultarARPItem_Id`, `3_consultarUnidadesItem` e `5_consultarAdesoesItem`, casando por `numeroItem` com zeros a esquerda normalizados.
- `externalBalance.managedBalance` usa apenas a UASG gerenciadora (`unitCode`, `unitName`, `registeredQuantity`, `committedQuantity`, `availableQuantity`, `commitments`).
- `externalBalance.adhesionBalance` separa adesoes/caronas de orgaos nao participantes (`limitQuantity`, `approvedQuantity`, `committedQuantity`, `availableQuantity`, `adhesions`).
- `externalBalance.nonParticipantCommitments` lista apenas empenhos efetivos de nao participantes.
- `externalBalance.externalUsageStatus` resume o uso externo em `SEM_USO_EXTERNO`, `ADESAO_DETECTADA`, `CONSUMO_GERENCIADORA_DETECTADO` ou `CONSUMO_GERENCIADORA_E_ADESAO_DETECTADOS`.
- Snapshot persistido por item: `AtaItemExternalBalanceSnapshot` com `source`, `status`, `externalUsageStatus`, `managedBalance`, `adhesionBalance`, `commitments`, `nonParticipantCommitments`, `difference`, `lastSyncAt` e `warnings`.
- Adesao nao reduz o saldo principal da gerenciadora e nenhum valor externo cria movimentacao local.
- Valores estimados de empenhos/adesoes saem apenas em `estimatedAmount`; o backend nao inventa `numeroEmpenho`.
- Os aliases revisados cobrem `numeroEmpenho`, `fornecedor`, `dataEmpenho`, `quantidadeEmpenhada` e `estimatedAmount` a partir dos endpoints `3_consultarUnidadesItem`, `4_consultarEmpenhosSaldoItem`, `5_consultarAdesoesItem` e `2.1_consultarARPItem_Id`.
- Em `development`, cada empenho/adesao pode incluir `rawKeyDebug` com chaves brutas disponiveis, endpoint de origem, item e unidade para facilitar diagnostico.
- Se a API retornar `200` sem registros, itens importados do Compras.gov.br exibem fallback baseado na quantidade registrada importada (`COMPRAS_GOV_IMPORT_FALLBACK`).

---

## ATA Items

### Objetivo

Itens precificáveis da ATA, agora com saldo inicial e saldo efetivo calculado por movimentação.

### Endpoints

#### `POST /atas/:id/items`

- Autenticação: sim
- Permissão: `atas.manage`
- Body exemplo:

```json
{
  "coverageGroupCode": "AM",
  "referenceCode": "ITEM-001",
  "description": "Camera IP",
  "unit": "UN",
  "unitPrice": 100,
  "initialQuantity": 1000
}
```

#### `GET /atas/:id/items`

- Autenticação: sim
- Observação:
  - já retorna saldo por item

#### `GET /ata-items`

- Autenticação: sim

#### `GET /ata-items/code/:code`

- Autenticação: sim

#### `GET /ata-items/:id`

- Autenticação: sim

#### `GET /ata-items/:id/movements`

- Autenticacao: sim
- Observacao:
  - retorna historico de movimentacoes de saldo ordenado por `createdAt desc`
  - inclui codigos amigaveis de projeto, estimativa, DIEx e ordem de servico quando existirem

#### `PATCH /ata-items/:id`

- Autenticação: sim
- Permissão: `atas.manage`

#### `DELETE /ata-items/:id`

- Autenticação: sim
- Permissão: `atas.manage`
- Observação:
  - arquivamento lógico

- Resposta resumida:

```json
{
  "id": "ata_item_123",
  "referenceCode": "ITEM-001",
  "balance": {
    "initialQuantity": "1000.00",
    "reservedQuantity": "50.00",
    "consumedQuantity": "100.00",
    "availableQuantity": "850.00",
    "lowStock": false,
    "insufficient": false
  }
}
```

- Erros comuns:
  - `404` item não encontrado
  - `409` item inativo, logicamente deletado ou regra de consistência

---

## Estimates

### Objetivo

Estimativas de preço vinculadas a projeto, ATA, grupo de cobertura e OM.

### Endpoints

#### `POST /estimates`

- Autenticação: sim
- Permissão: `estimates.create`
- Body exemplo:

```json
{
  "projectId": "prj_123",
  "ataId": "ata_123",
  "coverageGroupId": "cov_123",
  "omId": "om_123",
  "items": [
    {
      "ataItemId": "ata_item_123",
      "quantity": 2
    }
  ]
}
```

- Observação:
  - o saldo é validado na criação e na finalização

#### `GET /estimates`

- Autenticação: sim

#### `GET /estimates/code/:code`

- Autenticação: sim

#### `GET /estimates/:id`

- Autenticação: sim

#### `PATCH /estimates/:id`

- Autenticação: sim
- Permissão: `estimates.edit` ou `estimates.finalize`

#### `PATCH /estimates/:id/status`

- Autenticação: sim
- Permissão: `estimates.edit` ou `estimates.finalize`

#### `GET /estimates/:id/document/html`

- Autenticação: sim

#### `GET /estimates/:id/document/pdf`

- Autenticação: sim

#### `DELETE /estimates/:id`

- Autenticação: sim
- Permissão: `estimates.archive`

#### `POST /estimates/:id/restore`

- Autenticação: sim
- Permissão: `estimates.restore`

- Resposta resumida:

```json
{
  "id": "est_123",
  "status": "FINALIZADA",
  "items": [
    {
      "ataItem": {
        "id": "ata_item_123",
        "balance": {
          "availableQuantity": "850.00"
        }
      }
    }
  ]
}
```

- Erros comuns:
  - `409` saldo insuficiente
  - `409` item inativo/incompatível com ata ou cobertura
  - `403` sem acesso ao projeto

---

## DIEx

### Objetivo

Documento requisitório derivado de estimativa finalizada. Reserva saldo da ATA.

### Endpoints

#### `POST /diex`

- Autenticação: sim
- Permissão: `diex.issue`
- Body exemplo:

```json
{
  "projectId": "prj_123",
  "estimateId": "est_123",
  "diexNumber": "DIEX-001",
  "issuedAt": "2026-05-02T00:00:00.000Z",
  "supplierCnpj": "12345678000190",
  "requesterName": "Requisitante",
  "requesterRank": "2 Ten"
}
```

- Observação:
  - ao criar, reserva saldo dos itens envolvidos

#### `GET /diex`

- Autenticação: sim

#### `GET /diex/code/:code`

- Autenticação: sim

#### `GET /diex/:id`

- Autenticação: sim

#### `PATCH /diex/:id`

- Autenticação: sim

#### `GET /diex/:id/document/html`

- Autenticação: sim

#### `GET /diex/:id/document/pdf`

- Autenticação: sim

#### `DELETE /diex/:id`

- Autenticação: sim
- Permissão: `diex.cancel`
- Observação:
  - antes da NE, a remoção libera a reserva

#### `POST /diex/:id/restore`

- Autenticação: sim
- Permissão: `diex.restore`

- Erros comuns:
  - `409` projeto sem Nota de Crédito
  - `409` estimativa não finalizada
  - `409` saldo insuficiente para reservar

---

## Service Orders

### Objetivo

Ordem de Serviço derivada do projeto com NE informada.

### Endpoints

#### `POST /service-orders`

- Autenticação: sim
- Permissão: `service_orders.issue`
- Body exemplo:

```json
{
  "projectId": "prj_123",
  "estimateId": "est_123",
  "issuedAt": "2026-05-02T00:00:00.000Z",
  "contractorCnpj": "12345678000190",
  "requesterName": "Fiscal",
  "requesterRank": "2 Ten"
}
```

- `serviceOrderNumber` não precisa mais ser enviado no `POST /service-orders`.
- O backend gera automaticamente no formato `OS-YYYY-XXX` com sequencia anual baseada em `issuedAt`.
- Se `serviceOrderNumber` vier no payload, ele é sobrescrito pelo valor gerado.

#### `GET /service-orders`

- Autenticação: sim

#### `GET /service-orders/code/:code`

- Autenticação: sim

#### `GET /service-orders/number/:serviceOrderNumber`

- Autenticação: sim

#### `GET /service-orders/:id`

- Autenticação: sim

#### `PATCH /service-orders/:id`

- Autenticação: sim

#### `GET /service-orders/:id/document/html`

- Autenticação: sim

#### `GET /service-orders/:id/document/pdf`

- Autenticação: sim

#### `DELETE /service-orders/:id`

- Autenticação: sim
- Permissão: `service_orders.cancel`

#### `POST /service-orders/:id/restore`

- Autenticação: sim
- Permissão: `service_orders.restore`

- Erros comuns:
  - `409` NE ausente
  - `409` já existe OS para a estimativa
  - `403` sem permissão

---

## Military Organizations

### Objetivo

Catálogo de OMs usado como destino operacional das estimativas.

### Endpoints

#### `POST /military-organizations`

- Autenticação: sim
- Permissão: `military_organizations.manage`

#### `GET /military-organizations`

- Autenticação: sim

#### `GET /military-organizations/code/:code`

- Autenticação: sim

#### `GET /military-organizations/:id`

- Autenticação: sim

#### `PATCH /military-organizations/:id`

- Autenticação: sim
- Permissão: `military_organizations.manage`

#### `PATCH /military-organizations/code/:code`

- Autenticação: sim
- Permissão: `military_organizations.manage`

#### `DELETE /military-organizations/:id`

- Autenticação: sim
- Permissão: `military_organizations.manage`

#### `DELETE /military-organizations/code/:code`

- Autenticação: sim
- Permissão: `military_organizations.manage`

- Erros comuns:
  - `404` OM não encontrada
  - `409` OM vinculada a estimativas

---

## Dashboard

### Objetivo

Fornecer visão geral, operacional e executiva para acompanhamento do sistema.

### Endpoints

#### `GET /dashboard`

- Autenticação: sim
- Permissão: `dashboard.financial_view`
- Query params:
  - `periodType=month|quarter|semester|year`
  - `referenceDate`
  - `startDate` + `endDate`
  - `asOfDate`

#### `GET /dashboard/operational`

- Autenticação: sim
- Permissão: `dashboard.view_operational`
- Query params:
  - `staleDays`
  - `limit`

- Resposta resumida:

```json
{
  "alerts": {
    "summary": {}
  },
  "inventory": {
    "summary": {
      "lowStockItems": 3,
      "itemsWithActiveReserve": 5
    }
  }
}
```

#### `GET /dashboard/executive`

- Autenticação: sim
- Permissão: `dashboard.view_executive`
- Query params:
  - `periodType=month|quarter|semester|year`
  - `referenceDate`
  - `startDate` + `endDate`
  - `asOfDate`

- Resposta resumida:

```json
{
  "summary": {
    "projectsTotal": 10,
    "ataItemsAtRisk": 4
  },
  "inventory": {
    "snapshot": {
      "totalReservedAmount": "12000.00",
      "totalConsumedAmount": "45000.00"
    }
  }
}
```

- Erros comuns:
  - `400` combinação inválida de filtros temporais
  - `403` sem permissão

---

## Auditoria

### Objetivo

Expor a listagem real de `AuditLog` para telas administrativas.

### Endpoint

#### `GET /audits`

- Autenticacao: sim
- Perfis: `ADMIN`, `GESTOR`
- Ordenacao: `createdAt desc`
- Query params opcionais:
  - `entityType`
  - `action`
  - `actor`
  - `search`
  - `startDate`
  - `endDate`
  - `page`
  - `limit`
- Campos retornados por item:
  - `id`
  - `entityType`
  - `entityId`
  - `action`
  - `actorUserId`
  - `actorName`
  - `summary`
  - `createdAt`
  - `metadata`

---

## Principais erros transversais

- `400` body, params ou query inválidos
- `401` token ausente ou inválido
- `403` permissão insuficiente
- `404` entidade não encontrada
- `409` violação de regra de negócio
- `500` erro interno inesperado
