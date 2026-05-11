# Dashboards, Busca, Alertas, Relatorios E Administracao

## Auditoria

Base:

```text
/api/audits
```

Leitura exige usuario autenticado com role `ADMIN` ou `GESTOR`.

| Metodo | Rota | Uso | Acesso |
|---|---|---|---|
| `GET` | `/audits` | Lista AuditLog real. | `ADMIN`, `GESTOR` |

Filtros opcionais:

| Param | Tipo | Observacao |
|---|---|---|
| `entityType` | string | Filtra tipo da entidade auditada. |
| `action` | string | Filtra acao auditada. |
| `actor` | string | Busca por `actorName` ou `actorUserId`. |
| `search` | string | Busca em resumo, entidade e ator. |
| `startDate` | date-time | Inicio do periodo por `createdAt`. |
| `endDate` | date-time | Fim do periodo por `createdAt`. |
| `page` | number | Padrao `1`. |
| `limit` | number | Padrao `50`, maximo `100`. |

Resposta em envelope paginado com `items`, `meta`, `filters` e `links`.
Cada item retorna `id`, `entityType`, `entityId`, `action`, `actorUserId`,
`actorName`, `summary`, `createdAt` e `metadata`.

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

Todas as rotas exigem usuario `ADMIN` com `users.manage`.

### Leitura Vs Manutencao

- Leitura/listagem: administrativa; nao ha rota publica nem rota autenticada de leitura parcial fora de `users.manage`.
- Manutencao: administrativa; criar usuario, editar cadastro, alterar status e alterar role exigem `ADMIN`.
- O frontend operacional comum deve consumir dados do usuario atual por `GET /api/auth/me`; `users` fica para telas administrativas.

### Endpoints Implementados Hoje

| Metodo | Rota | Uso | Permissao |
|---|---|---|---|
| `GET` | `/users` | Lista usuarios para administracao. | `ADMIN` + `users.manage` |
| `POST` | `/users` | Cria usuario administrativo. | `ADMIN` + `users.manage` |
| `GET` | `/users/:id` | Detalha usuario por id. | `ADMIN` + `users.manage` |
| `PATCH` | `/users/:id` | Atualiza `name`, `email`, `rank` e `cpf`. | `ADMIN` + `users.manage` |
| `PATCH` | `/users/:id/status` | Atualiza `active`. | `ADMIN` + `users.manage` |
| `PATCH` | `/users/:id/role` | Altera role do usuario. | `ADMIN` + `users.manage` |

Observacao importante:

- endpoints como `GET /users/code/:code` e troca de senha administrativa ainda nao estao expostos nas rotas atuais; portanto continuam fora da OpenAPI formal e desta documentacao detalhada.

### Filtros E Paginacao

`GET /api/users` usa envelope paginado por padrao e aceita:

| Param | Tipo | Observacao |
|---|---|---|
| `page` | number | Padrao `1`. |
| `pageSize` | number | Padrao `50`, maximo `100`. |
| `format` | `envelope` ou `legacy` | `legacy` retorna array simples. |
| `role` | `ADMIN`, `GESTOR`, `PROJETISTA`, `CONSULTA` | Filtra por perfil. |
| `active` | boolean | Filtra por status de ativacao. |
| `search` | string | Busca em `name`, `email`, `rank` e `cpf`. |

Exemplo:

```http
GET /api/users?role=PROJETISTA&active=true&search=manaus&page=1&pageSize=20
```

Resposta com envelope:

```json
{
  "items": [
    {
      "id": "cmabc123",
      "userCode": 7,
      "name": "Cap Joao Silva",
      "email": "joao.silva@sagep.mil.br",
      "role": "PROJETISTA",
      "active": true,
      "createdAt": "2026-04-29T00:00:00.000Z",
      "updatedAt": "2026-04-29T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "filters": {
    "role": "PROJETISTA",
    "active": true,
    "search": "manaus"
  },
  "links": {
    "self": "/api/users?role=PROJETISTA&active=true&search=manaus&page=1&pageSize=20"
  }
}
```

### Criar Usuario

```http
POST /api/users
```

Payload:

```json
{
  "name": "1 Ten Maria Souza",
  "email": "maria.souza@sagep.mil.br",
  "password": "123456",
  "role": "GESTOR",
  "rank": "1 Ten",
  "cpf": "12345678900"
}
```

Observacoes:

- a rota administrativa aceita apenas `PROJETISTA`, `GESTOR` e `CONSULTA` na criacao; `ADMIN` nao entra nesse fluxo.
- o backend valida unicidade de `email`.
- a resposta atual nao retorna `rank` nem `cpf`, apenas o resumo administrativo selecionado no service.

Resposta tipica:

```json
{
  "id": "cmuser123",
  "userCode": 8,
  "name": "1 Ten Maria Souza",
  "email": "maria.souza@sagep.mil.br",
  "role": "GESTOR",
  "active": true,
  "createdAt": "2026-04-29T00:00:00.000Z"
}
```

### Alterar Role

```http
PATCH /api/users/:id/role
```

Payload aceito pelo schema:

```json
{
  "role": "CONSULTA",
  "rank": "1 Ten",
  "cpf": "12345678900"
}
```

Comportamento real atual:

- a regra de negocio efetivamente persistida hoje altera apenas `role`.
- `rank` e `cpf` sao aceitos pelo schema, mas nao sao gravados pelo service nesta rota.
- o usuario administrador autenticado nao pode remover o proprio perfil `ADMIN` por esta rota.

Resposta tipica:

```json
{
  "id": "cmuser123",
  "userCode": 8,
  "name": "1 Ten Maria Souza",
  "email": "maria.souza@sagep.mil.br",
  "role": "CONSULTA",
  "active": true,
  "createdAt": "2026-04-29T00:00:00.000Z",
  "updatedAt": "2026-04-29T12:00:00.000Z"
}
```

### Campos Importantes

| Campo | Onde aparece | Observacao |
|---|---|---|
| `id` | requests de update e respostas | UUID/cuid interno do usuario. |
| `userCode` | respostas | Codigo sequencial amigavel para exibicao. |
| `role` | create/list/update | Perfil funcional do usuario. |
| `active` | list/responses | Hoje so pode ser filtrado; nao ha rota administrativa dedicada para alterar esse campo. |
| `rank`, `cpf` | create e filtro de busca | Relevantes para cadastro e busca textual; nem sempre retornam nos selects atuais. |

### Roles Aceitos

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

Leitura exige usuario autenticado para `ADMIN`, `GESTOR`, `PROJETISTA` e `CONSULTA`.
Escrita/manutencao exige `atas.manage`, permissao exclusiva de `ADMIN`.

### Relacao Entre ATA, Grupo, Localidade E Item

Estrutura conceitual:

1. `Ata`: contrato-base/catalogo principal.
2. `CoverageGroup`: recorte logico dentro da ata, identificado por `code`.
3. `Localities`: cidades/UFs atendidas por esse grupo.
4. `AtaItem`: item precificavel vinculado a uma `Ata` e a um `CoverageGroup`.

No fluxo de estimativas:

- a estimativa escolhe uma `Ata`;
- depois escolhe um `CoverageGroup` daquela ata;
- depois escolhe uma `OM`;
- a OM define cidade/UF de destino;
- o backend valida se a OM pertence a uma localidade coberta pelo grupo escolhido;
- os itens usados na estimativa precisam pertencer simultaneamente a essa ata e a esse grupo de cobertura.

### Leitura Vs Manutencao

- Leitura: catalogo autenticado, usado por telas de selecao, filtros e apoio ao fluxo de estimativas.
- Manutencao: administrativa; create/update/delete sao destrutivos no catalogo e nao fazem arquivamento funcional como `projects`/`tasks`.
- Exclusao de ata ou item e fisica no banco via `delete`, nao `archive`.

### Endpoints De ATAs

| Metodo | Rota | Uso | Permissao |
|---|---|---|---|
| `GET` | `/atas` | Lista atas. | Autenticado |
| `POST` | `/atas` | Cria ata com grupos/localidades. | `atas.manage` |
| `GET` | `/atas/:id` | Detalhe por id. | Autenticado |
| `GET` | `/atas/code/:code` | Detalhe por codigo amigavel. | Autenticado |
| `PATCH` | `/atas/:id` | Atualiza cabecalho e, se enviado, substitui todos os grupos/localidades. | `atas.manage` |
| `DELETE` | `/atas/:id` | Remove ata. | `atas.manage` |
| `POST` | `/atas/:id/coverage-groups` | Cria grupo de cobertura sem substituir os demais. | `ADMIN` + `atas.manage` |
| `PATCH` | `/atas/:id/coverage-groups/:groupId` | Atualiza um grupo de cobertura especifico. | `ADMIN` + `atas.manage` |
| `DELETE` | `/atas/:id/coverage-groups/:groupId` | Remove um grupo de cobertura sem itens/estimativas vinculadas. | `ADMIN` + `atas.manage` |
| `GET` | `/atas/:id/items` | Lista itens daquela ata. | Autenticado |
| `POST` | `/atas/:id/items` | Cria item vinculado a um grupo da ata. | `atas.manage` |

### Filtros E Paginacao De ATAs

`GET /api/atas` aceita:

| Param | Tipo | Observacao |
|---|---|---|
| `page` | number | Padrao `1`. |
| `pageSize` | number | Padrao `50`, maximo `100`. |
| `format` | `envelope` ou `legacy` | `legacy` retorna array simples. |
| `code` | number | Filtra por `ataCode`. |
| `type` | `CFTV` ou `FIBRA_OPTICA` | Tipo da ata. |
| `groupCode` | string | Filtra atas que contenham o grupo. |
| `cityName` | string | Filtra por localidade coberta. |
| `stateUf` | `AM`, `RO`, `RR`, `AC` | Filtra por UF coberta. |
| `active` | boolean | Filtra por `isActive`. |
| `search` | string | Busca em numero, fornecedor, orgao gerenciador, notas, grupos e cidades. |

Exemplo:

```http
GET /api/atas?type=CFTV&stateUf=AM&groupCode=MNS&page=1&pageSize=10
```

### Criar ATA

```http
POST /api/atas
```

Payload:

```json
{
  "number": "ATA 04/2025",
  "type": "CFTV",
  "vendorName": "Empresa Alpha Ltda",
  "managingAgency": "4 CTA",
  "validFrom": "2026-01-01T00:00:00.000Z",
  "validUntil": "2026-12-31T00:00:00.000Z",
  "notes": "Ata principal de CFTV",
  "coverageGroups": [
    {
      "code": "MNS",
      "name": "Grupo Manaus",
      "description": "Atendimento urbano",
      "localities": [
        { "cityName": "Manaus", "stateUf": "AM" },
        { "cityName": "Iranduba", "stateUf": "AM" }
      ]
    }
  ]
}
```

Observacoes de uso:

- `coverageGroups` e obrigatorio e vem junto com a criacao da ata.
- o backend normaliza `coverageGroup.code` para maiusculo.
- localidades repetidas dentro do mesmo grupo sao deduplicadas antes de persistir.

Resposta tipica:

```json
{
  "id": "cmata123",
  "ataCode": 3,
  "number": "ATA 04/2025",
  "type": "CFTV",
  "vendorName": "Empresa Alpha Ltda",
  "managingAgency": "4 CTA",
  "validFrom": "2026-01-01T00:00:00.000Z",
  "validUntil": "2026-12-31T00:00:00.000Z",
  "notes": "Ata principal de CFTV",
  "isActive": true,
  "coverageGroups": [
    {
      "id": "cmgroup123",
      "code": "MNS",
      "name": "Grupo Manaus",
      "description": "Atendimento urbano",
      "createdAt": "2026-04-29T00:00:00.000Z",
      "localities": [
        {
          "id": "cmloc123",
          "cityName": "Iranduba",
          "stateUf": "AM",
          "createdAt": "2026-04-29T00:00:00.000Z"
        },
        {
          "id": "cmloc124",
          "cityName": "Manaus",
          "stateUf": "AM",
          "createdAt": "2026-04-29T00:00:00.000Z"
        }
      ]
    }
  ],
  "createdAt": "2026-04-29T00:00:00.000Z",
  "updatedAt": "2026-04-29T00:00:00.000Z"
}
```

### Atualizar ATA

```http
PATCH /api/atas/:id
```

Observacao crucial:

- quando `coverageGroups` e enviado no update, o backend apaga todos os grupos/localidades anteriores da ata e recria a estrutura inteira com base no payload novo.
- para editar grupos individualmente sem sobrescrever todos, use os endpoints `/atas/:id/coverage-groups`.

Exemplo de update parcial:

```json
{
  "vendorName": "Empresa Alpha Norte Ltda",
  "isActive": false
}
```

### Detalhar Usuario

```http
GET /api/users/:id
```

Retorna o resumo administrativo do usuario, incluindo `rank`, `cpf`, `active`, `createdAt` e `updatedAt`.

### Atualizar Usuario

```http
PATCH /api/users/:id
```

Payload:

```json
{
  "name": "1 Ten Maria Souza",
  "email": "maria.souza.atualizada@sagep.mil.br",
  "rank": "1 Ten",
  "cpf": "12345678900"
}
```

Observacoes:

- todos os campos sao opcionais, mas ao menos um deve ser enviado.
- `email` deve ser unico.

### Alterar Status

```http
PATCH /api/users/:id/status
```

Payload:

```json
{
  "active": false
}
```

Regra de seguranca:

- o usuario ADMIN autenticado nao pode desativar a si mesmo se isso deixar o sistema sem nenhum ADMIN ativo.

### Gerenciar Grupos De Cobertura Da ATA

Cria, edita ou remove um grupo especifico sem substituir todos os grupos da ATA.

```http
POST /api/atas/:id/coverage-groups
PATCH /api/atas/:id/coverage-groups/:groupId
DELETE /api/atas/:id/coverage-groups/:groupId
```

Payload de criacao:

```json
{
  "code": "RR",
  "name": "Roraima",
  "description": "Capital e interior",
  "localities": [
    { "cityName": "Boa Vista", "stateUf": "RR" }
  ]
}
```

Payload de edicao parcial:

```json
{
  "name": "Roraima atualizado",
  "localities": [
    { "cityName": "Boa Vista", "stateUf": "RR" },
    { "cityName": "Pacaraima", "stateUf": "RR" }
  ]
}
```

Observacoes:

- `code` e normalizado para maiusculo e deve ser unico dentro da ATA.
- em `PATCH`, `localities` substitui apenas as localidades do grupo editado.
- como o modelo atual nao possui `active` no grupo, `DELETE` remove o registro e retorna `409` quando houver itens ou estimativas vinculadas.

Exemplo de update com substituicao de grupos:

```json
{
  "coverageGroups": [
    {
      "code": "INT",
      "name": "Interior",
      "localities": [
        { "cityName": "Tefe", "stateUf": "AM" }
      ]
    }
  ]
}
```

### Endpoints De ATA Items

| Metodo | Rota | Uso | Permissao |
|---|---|---|---|
| `GET` | `/ata-items` | Lista global de itens. | Autenticado |
| `GET` | `/ata-items/:id` | Detalhe por id. | Autenticado |
| `GET` | `/ata-items/code/:code` | Detalhe por codigo amigavel. | Autenticado |
| `GET` | `/ata-items/:id/movements` | Historico de movimentacoes de saldo do item. | Autenticado |
| `PATCH` | `/ata-items/:id` | Atualiza item. | `atas.manage` |
| `DELETE` | `/ata-items/:id` | Remove item. | `atas.manage` |
| `GET` | `/atas/:id/items` | Lista itens de uma ata. | Autenticado |
| `POST` | `/atas/:id/items` | Cria item em uma ata. | `atas.manage` |

### Filtros E Paginacao De Itens

`GET /api/ata-items` e `GET /api/atas/:id/items` aceitam:

| Param | Tipo | Observacao |
|---|---|---|
| `page` | number | Padrao `1`. |
| `pageSize` | number | Padrao `50`, maximo `100`. |
| `format` | `envelope` ou `legacy` | `legacy` retorna array simples. |
| `code` | number | Filtra por `ataItemCode`. |
| `ataCode` | number | So em `/ata-items`; filtra pela ata. |
| `groupCode` | string | Filtra pelo grupo de cobertura. |
| `cityName` | string | Filtra por localidade do grupo. |
| `stateUf` | `AM`, `RO`, `RR`, `AC` | Filtra por UF do grupo. |
| `active` | boolean | Filtra por `isActive`. |
| `search` | string | Busca em `referenceCode`, `description` e `notes`. |

Exemplo:

```http
GET /api/ata-items?ataCode=3&groupCode=MNS&active=true&search=camera
```

### Criar Item De ATA

```http
POST /api/atas/:id/items
```

Payload:

```json
{
  "coverageGroupCode": "MNS",
  "referenceCode": "CAM-001",
  "description": "Camera IP externa",
  "unit": "un",
  "unitPrice": 1250.5,
  "notes": "Modelo padrao"
}
```

Observacoes de uso:

- `coverageGroupCode` precisa existir dentro da ata apontada por `:id`.
- `unit` e normalizado para maiusculo no backend.
- `unitPrice` e persistido com duas casas decimais.

Resposta tipica:

```json
{
  "id": "cmitem123",
  "ataItemCode": 12,
  "ataId": "cmata123",
  "coverageGroupId": "cmgroup123",
  "referenceCode": "CAM-001",
  "description": "Camera IP externa",
  "unit": "UN",
  "unitPrice": "1250.50",
  "notes": "Modelo padrao",
  "isActive": true,
  "createdAt": "2026-04-29T00:00:00.000Z",
  "updatedAt": "2026-04-29T00:00:00.000Z",
  "ata": {
    "id": "cmata123",
    "ataCode": 3,
    "number": "ATA 04/2025",
    "type": "CFTV",
    "vendorName": "Empresa Alpha Ltda",
    "isActive": true
  },
  "coverageGroup": {
    "id": "cmgroup123",
    "code": "MNS",
    "name": "Grupo Manaus",
    "description": "Atendimento urbano",
    "localities": [
      { "id": "cmloc124", "cityName": "Manaus", "stateUf": "AM" }
    ]
  }
}
```

### Atualizar E Remover Item

`PATCH /api/ata-items/:id` aceita update parcial:

```json
{
  "coverageGroupCode": "INT",
  "unitPrice": 1310,
  "isActive": false
}
```

Observacoes:

- se `coverageGroupCode` for enviado, ele precisa existir na mesma ata do item atual.
- `DELETE /api/ata-items/:id` remove fisicamente o item e retorna apenas mensagem simples.

### Movimentacoes De Saldo Do Item

```http
GET /api/ata-items/:id/movements
```

Retorna um array ordenado por `createdAt` decrescente. Cada item contem:

- `id`, `movementType`, `quantity`, `unitPrice`, `totalAmount`, `summary`, `actorName`, `createdAt`;
- `projectId` e `projectCode`, quando houver projeto associado;
- `estimateId` e `estimateCode`, quando houver estimativa associada;
- `diexRequestId` e `diexCode`, quando houver DIEx associado;
- `serviceOrderId` e `serviceOrderCode`, quando houver ordem de servico associada.

O endpoint e somente leitura e nao altera regra de saldo nem fluxo documental.

## Organizacoes Militares

Base:

```text
/api/military-organizations
```

Leitura exige usuario autenticado para `ADMIN`, `GESTOR`, `PROJETISTA` e `CONSULTA`.
Escrita/manutencao exige `military_organizations.manage`, permissao exclusiva de `ADMIN`.

### Como OMs Entram No Fluxo

Uso principal:

- a OM representa o destino operacional de uma estimativa;
- em `POST /estimates`, o frontend informa `omId` ou `omCode`;
- o backend resolve a OM e copia para a estimativa os dados de destino (`cityName`, `stateUf`, nome da OM);
- o grupo de cobertura da ATA precisa cobrir a localidade dessa OM;
- projetos nao apontam diretamente para OMs, mas herdam esse contexto pelas estimativas e documentos derivados.

Observacao de precisao:

- o backend atual valida existencia da OM, mas nao bloqueia explicitamente o uso de OMs inativas na resolucao de estimativas.

### Endpoints Disponiveis

| Metodo | Rota | Uso | Permissao |
|---|---|---|---|
| `GET` | `/military-organizations` | Lista OMs. | Autenticado |
| `POST` | `/military-organizations` | Cria OM. | `military_organizations.manage` |
| `GET` | `/military-organizations/:id` | Detalhe por id. | Autenticado |
| `PATCH` | `/military-organizations/:id` | Atualiza por id. | `military_organizations.manage` |
| `DELETE` | `/military-organizations/:id` | Remove por id. | `military_organizations.manage` |
| `GET` | `/military-organizations/code/:code` | Detalhe por codigo. | Autenticado |
| `PATCH` | `/military-organizations/code/:code` | Atualiza por codigo. | `military_organizations.manage` |
| `DELETE` | `/military-organizations/code/:code` | Remove por codigo. | `military_organizations.manage` |

### Filtros E Paginacao

`GET /api/military-organizations` aceita:

| Param | Tipo | Observacao |
|---|---|---|
| `page` | number | Padrao `1`. |
| `pageSize` | number | Padrao `50`, maximo `100`. |
| `format` | `envelope` ou `legacy` | `legacy` retorna array simples. |
| `code` | number | Filtra por `omCode`. |
| `sigla` | string | Busca parcial por sigla. |
| `cityName` | string | Busca parcial por cidade. |
| `stateUf` | `AM`, `RO`, `RR`, `AC` | Filtra por UF. |
| `active` | boolean | Filtra por `isActive`. |
| `search` | string | Busca ampla em `sigla`, `name` e `cityName`. |

Exemplo:

```http
GET /api/military-organizations?stateUf=AM&active=true&search=manaus
```

### Criar OM

```http
POST /api/military-organizations
```

Payload:

```json
{
  "sigla": "4CTA",
  "name": "4 Centro de Telematica de Area",
  "cityName": "Manaus",
  "stateUf": "AM"
}
```

Comportamento:

- `sigla` precisa ser unica no catalogo.
- a resposta retorna o registro completo persistido, incluindo `omCode`, `isActive`, `createdAt` e `updatedAt`.

Resposta tipica:

```json
{
  "id": "cmom123",
  "omCode": 14,
  "sigla": "4CTA",
  "name": "4 Centro de Telematica de Area",
  "cityName": "Manaus",
  "stateUf": "AM",
  "isActive": true,
  "createdAt": "2026-04-29T00:00:00.000Z",
  "updatedAt": "2026-04-29T00:00:00.000Z"
}
```

### Atualizar E Remover OM

`PATCH /api/military-organizations/:id` e `PATCH /api/military-organizations/code/:code` aceitam update parcial:

```json
{
  "name": "4 Centro de Telematica de Area - Sede Manaus",
  "isActive": false
}
```

Observacoes:

- `sigla`, quando alterada, continua sujeita a unicidade global.
- as rotas por `id` e por `code` sao equivalentes em efeito; a diferenca e apenas a forma de identificar o registro.
- `DELETE` remove fisicamente a OM e retorna mensagem simples.

### Campos Importantes

| Campo | Uso | Observacao |
|---|---|---|
| `omCode` | frontend e filtros | Codigo amigavel para selecao em tela. |
| `sigla` | busca e UX | Identificador curto e unico. |
| `cityName`, `stateUf` | integracao com estimativas | Precisam ser coerentes com os grupos/localidades de ATA. |
| `isActive` | filtros/catalogo | Hoje e usado como marca de catalogo; nao impede automaticamente uso na estimativa. |

## Health

```http
GET /api/health
```

Endpoint publico para verificacao basica da API.
