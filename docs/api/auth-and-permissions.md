# Auth, Sessoes E Permissoes

## Perfis

| Perfil | Uso esperado |
|---|---|
| `ADMIN` | Administracao plena. Pode consultar arquivados e gerenciar usuarios/sessoes. |
| `GESTOR` | Operacao gerencial ampla. Pode criar/editar/restaurar documentos operacionais e ver dashboards gerenciais. |
| `PROJETISTA` | Operacao de projetos, tarefas proprias, estimativas, emissao documental e dashboard operacional. |
| `CONSULTA` | Leitura operacional e dashboard operacional, sem alteracoes. |

## Permissoes Principais

| Grupo | Permissoes |
|---|---|
| Projetos | `projects.view_all`, `projects.edit_own`, `projects.edit_all`, `projects.restore`, `projects.complete`, `projects.reopen` |
| Tarefas | `tasks.view_all`, `tasks.create`, `tasks.edit_all`, `tasks.edit_own`, `tasks.assign`, `tasks.complete`, `tasks.archive`, `tasks.restore` |
| Estimativas | `estimates.view_all`, `estimates.create`, `estimates.edit`, `estimates.finalize`, `estimates.archive`, `estimates.restore` |
| DIEx | `diex.issue`, `diex.cancel`, `diex.restore` |
| OS | `service_orders.issue`, `service_orders.cancel`, `service_orders.restore` |
| Catalogos | `atas.manage`, `military_organizations.manage` |
| Dashboards | `dashboard.view_operational`, `dashboard.view_executive`, `dashboard.financial_view` |
| Relatorios | `reports.export` |
| Sessoes | `sessions.manage_own`, `sessions.manage_all` |
| Usuarios | `users.manage` |

As permissoes sao derivadas por role no codigo, nao persistidas no banco.

## Login

```http
POST /api/auth/login
```

Request:

```json
{
  "email": "admin@sagep.com",
  "password": "123456"
}
```

Response:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "userCode": 1,
    "name": "ADMIN",
    "email": "admin@sagep.com",
    "role": "ADMIN",
    "rank": "2 Ten",
    "cpf": "11122233344",
    "active": true,
    "createdAt": "2026-04-27T00:00:00.000Z",
    "permissions": ["projects.view_all", "tasks.create"],
    "access": {
      "role": "ADMIN",
      "permissions": ["projects.view_all", "tasks.create"],
      "isAdmin": true
    }
  }
}
```

## Usuario Atual

```http
GET /api/auth/me
```

Response:

```json
{
  "id": "...",
  "userCode": 1,
  "name": "ADMIN",
  "email": "admin@sagep.com",
  "role": "ADMIN",
  "rank": "2 Ten",
  "cpf": "11122233344",
  "active": true,
  "createdAt": "2026-04-27T00:00:00.000Z",
  "permissions": ["projects.view_all", "tasks.create"],
  "access": {
    "role": "ADMIN",
    "permissions": ["projects.view_all", "tasks.create"],
    "isAdmin": true
  }
}
```

O frontend deve usar `permissions` para habilitar/desabilitar acoes. `role` e `access.isAdmin` sao atalhos de UX, nao substituem validacao no backend.

## Refresh E Logout

```http
POST /api/auth/refresh
POST /api/auth/logout
```

Request:

```json
{ "refreshToken": "..." }
```

`refresh` rotaciona o refresh token e retorna novo par de tokens. `logout` revoga o refresh token informado.

## Sessoes Proprias

```http
GET /api/auth/sessions?status=ACTIVE
POST /api/auth/sessions/:sessionId/revoke
POST /api/auth/sessions/revoke-all
```

Permissao: `sessions.manage_own`.

Status aceitos:

- `ACTIVE`
- `REVOKED`
- `EXPIRED`
- `ALL`

Resposta de listagem de sessoes ja possui envelope proprio:

```json
{
  "scope": "OWN",
  "permissionUsed": "sessions.manage_own",
  "summary": { "total": 2, "active": 1, "revoked": 1, "expired": 0 },
  "sessions": []
}
```

## Sessoes Administrativas

```http
GET /api/auth/users/:userId/sessions
POST /api/auth/users/:userId/sessions/:sessionId/revoke
POST /api/auth/users/:userId/sessions/revoke-all
POST /api/auth/sessions/cleanup
```

Permissao: `sessions.manage_all` (`ADMIN`).

`cleanup` aceita:

```json
{
  "refreshTokenRetentionDays": 90,
  "auditRetentionDays": 180
}
```

## Registro

```http
POST /api/auth/register
```

Cria usuario com role inicial `CONSULTA`.

```json
{
  "name": "Novo Usuario",
  "email": "usuario@sagep.com",
  "password": "123456"
}
```
