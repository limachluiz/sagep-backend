# Mapa para o Frontend do SAGEP

Este documento organiza a construção do frontend a partir do backend atual.

## Estratégia geral

Prioridade recomendada:

1. autenticação e sessão
2. layout base + RBAC do frontend
3. projetos e detalhe de projeto
4. estimativas
5. DIEx
6. Ordem de Serviço
7. ATAs e itens de ATA
8. dashboards
9. administração

## Estratégia de autenticação

### Modelo atual do backend

- login retorna `accessToken` e `refreshToken`
- `/auth/me` devolve role e permissões efetivas
- existe refresh de token
- existe revogação de sessão

### Estratégia sugerida

- guardar `accessToken` em memória;
- guardar `refreshToken` em storage seguro compatível com a arquitetura do frontend;
- no bootstrap da aplicação:
  - tentar recuperar sessão;
  - chamar `/auth/me`;
  - montar contexto de usuário e permissões;
- em `401` por expiração:
  - tentar `POST /auth/refresh`;
  - repetir a requisição original;
- em falha de refresh:
  - forçar logout local.

## Telas necessárias

### 1. Login

Perfis:

- todos

Endpoints:

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`

Componentes principais:

- formulário de login
- estado de sessão
- feedback de autenticação

Estados:

- carregando login
- credencial inválida
- sessão expirada

### 2. Home / shell autenticado

Perfis:

- todos

Endpoints:

- `GET /auth/me`

Componentes principais:

- sidebar
- guardas por permissão
- cabeçalho com usuário e sessão

### 3. Lista de projetos

Perfis:

- ADMIN
- GESTOR
- PROJETISTA
- CONSULTA conforme acesso

Endpoints:

- `GET /projects`
- `GET /projects/code/:code`

Componentes principais:

- tabela/lista
- filtros
- paginação
- badges de fase/status

Estados:

- vazio sem projetos
- sem permissão
- erro de consulta

### 4. Detalhe do projeto

Perfis:

- todos com acesso ao projeto

Endpoints:

- `GET /projects/:id`
- `GET /projects/:id/details`
- `GET /projects/:id/timeline`
- `GET /projects/:id/next-action`
- `PATCH /projects/:id`
- `PATCH /projects/:id/flow`
- `PATCH /projects/:id/as-built/review`
- `POST /projects/:id/commitment-note/cancel`

Componentes principais:

- resumo do projeto
- card de fase atual
- próximos passos
- timeline/auditoria
- ações de workflow

Estados:

- projeto não encontrado
- bloqueio por regra de workflow
- ação em andamento

### 5. Gestão de membros do projeto

Perfis:

- ADMIN
- GESTOR
- dono/gestor autorizado do projeto

Endpoints:

- `POST /projects/:id/members`
- `GET /projects/:id/members`
- `DELETE /projects/:id/members/:memberId`

### 6. Tarefas

Perfis:

- ADMIN
- GESTOR
- PROJETISTA
- CONSULTA somente leitura

Endpoints:

- `GET /tasks`
- `GET /tasks/:id`
- `POST /tasks`
- `PATCH /tasks/:id`
- `PATCH /tasks/:id/status`

Componentes principais:

- lista
- formulário
- quadro por status

### 7. Estimativas

Perfis:

- ADMIN
- GESTOR
- PROJETISTA
- CONSULTA leitura quando tiver acesso

Endpoints:

- `GET /estimates`
- `GET /estimates/:id`
- `POST /estimates`
- `PATCH /estimates/:id`
- `PATCH /estimates/:id/status`
- `GET /estimates/:id/document/html`
- `GET /estimates/:id/document/pdf`

Componentes principais:

- wizard ou formulário de estimativa
- seletor de ATA / grupo / OM
- grid de itens
- visualização de saldo disponível por item

Estados:

- item sem saldo
- item incompatível com cobertura
- estimativa finalizada / bloqueada

### 8. DIEx

Perfis:

- ADMIN
- GESTOR
- PROJETISTA

Endpoints:

- `GET /diex`
- `GET /diex/:id`
- `POST /diex`
- `PATCH /diex/:id`
- `DELETE /diex/:id`
- `GET /diex/:id/document/html`
- `GET /diex/:id/document/pdf`

Componentes principais:

- formulário de emissão
- visualização de itens reservados
- preview/documento

Estados:

- saldo insuficiente para reserva
- falta Nota de Crédito
- estimativa não finalizada

### 9. Ordem de Serviço

Perfis:

- ADMIN
- GESTOR
- PROJETISTA

Endpoints:

- `GET /service-orders`
- `GET /service-orders/number/:serviceOrderNumber`
- `GET /service-orders/:id`
- `POST /service-orders`
- `PATCH /service-orders/:id`
- `DELETE /service-orders/:id`
- `GET /service-orders/:id/document/html`
- `GET /service-orders/:id/document/pdf`

Componentes principais:

- formulário de emissão
- cronograma
- documentos entregues
- preview/documento

Observação de integração:

- No `POST /service-orders`, o frontend deve enviar `issuedAt`, mas não precisa mais enviar `serviceOrderNumber`.
- O backend retorna `serviceOrderNumber` já gerado no padrão `OS-YYYY-XXX`.

### 10. ATAs

Perfis:

- ADMIN
- GESTOR leitura
- PROJETISTA leitura
- CONSULTA leitura

Endpoints:

- `GET /atas`
- `GET /atas/:id`
- `POST /atas`
- `PATCH /atas/:id`
- `DELETE /atas/:id`

### 11. Itens da ATA

Perfis:

- ADMIN gerencia
- demais perfis consultam conforme permissão de leitura operacional

Endpoints:

- `GET /ata-items`
- `GET /ata-items/:id`
- `GET /atas/:id/items`
- `POST /atas/:id/items`
- `PATCH /ata-items/:id`
- `DELETE /ata-items/:id`

Componentes principais:

- tabela de itens
- saldo atual
- filtros por ATA, grupo, localidade e busca
- destaque de risco de estoque

### 12. OMs

Perfis:

- ADMIN gerencia
- demais perfis consultam

Endpoints:

- `GET /military-organizations`
- `GET /military-organizations/:id`
- `POST /military-organizations`
- `PATCH /military-organizations/:id`
- `DELETE /military-organizations/:id`

### 13. Dashboard operacional

Perfis:

- quem tiver `dashboard.view_operational`

Endpoints:

- `GET /dashboard/operational`
- `GET /operational-alerts`

Componentes principais:

- cards de alerta
- fila operacional
- bloco de inventory
- próximos passos frequentes

### 14. Dashboard executivo

Perfis:

- quem tiver `dashboard.view_executive`

Endpoints:

- `GET /dashboard/executive`

Componentes principais:

- cards gerenciais
- distribuição por tipo/fornecedor
- bloco executivo de inventory

### 15. Dashboard geral

Perfis:

- quem tiver `dashboard.financial_view`

Endpoints:

- `GET /dashboard`

### 16. Administração de usuários

Perfis:

- ADMIN

Endpoints:

- `GET /users`
- `POST /users`
- `PATCH /users/:id/role`

### 17. Administração de permissões

Perfis:

- ADMIN para escrita
- GESTOR leitura, se a permissão estiver presente

Endpoints:

- `GET /permissions/catalog`
- `GET /permissions/roles/:role`
- `PUT /permissions/roles/:role`
- `GET /permissions/users/:id`
- `GET /permissions/users/:id/overrides`
- `POST /permissions/users/:id/overrides/allow`
- `POST /permissions/users/:id/overrides/deny`
- `DELETE /permissions/users/:id/overrides/:permissionCode`

### 18. Sessões

Perfis:

- todos para próprias sessões
- ADMIN para sessões globais

Endpoints:

- `GET /auth/sessions`
- `POST /auth/sessions/revoke-all`
- `POST /auth/sessions/:sessionId/revoke`
- `GET /auth/users/:userId/sessions`
- `POST /auth/users/:userId/sessions/revoke-all`
- `POST /auth/users/:userId/sessions/:sessionId/revoke`

### 19. Auditoria administrativa

Perfis:

- ADMIN
- GESTOR

Endpoints:

- `GET /audits`

Filtros:

- `entityType`
- `action`
- `actor`
- `search`
- `startDate`
- `endDate`
- `page`
- `limit`

## Ordem sugerida de implementação

### Fase 1

- login
- shell autenticado
- `/auth/me`
- guardas por permissão

### Fase 2

- lista de projetos
- detalhe do projeto
- timeline
- next action

### Fase 3

- tarefas
- estimativas
- visualização de saldo da ATA na estimativa

### Fase 4

- DIEx
- NE no fluxo do projeto
- OS
- cancelamento de NE

### Fase 5

- dashboards
- alertas operacionais
- inventário/saldo da ATA

### Fase 6

- usuários
- permissões
- sessões administrativas

## Estados de carregamento, erro e vazio

Todas as telas principais devem prever:

- carregamento inicial
- refetch
- vazio sem dados
- erro de rede
- `401` sessão expirada
- `403` acesso negado
- `404` entidade ausente
- `409` regra de negócio

## Componentes transversais recomendados

- `AuthGuard`
- `PermissionGate`
- `ProjectStageBadge`
- `DocumentStatusBadge`
- `CurrencyValue`
- `DecimalValue`
- `AuditTimeline`
- `InventoryBalanceCard`
- `LowStockBadge`
- `WorkflowNextActionCard`

## Observações finais

- o frontend deve consumir `permissions` efetivas do backend, não inferir tudo só pela role;
- o mapa acima prioriza telas que destravam o fluxo principal antes da camada administrativa;
- o módulo de saldo da ATA deve aparecer cedo no frontend porque afeta estimativas, DIEx, dashboards e alertas.
