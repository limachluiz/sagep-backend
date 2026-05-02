# Perfis e Permissões do SAGEP

O SAGEP usa RBAC governado pelo banco:

- permissões base por role;
- overrides por usuário com `ALLOW` e `DENY`;
- cálculo efetivo aplicado em login, `/auth/me`, middleware e serviços.

## Perfis padrão

Perfis atuais:

- `ADMIN`
- `GESTOR`
- `PROJETISTA`
- `CONSULTA`

## ADMIN

### Papel

Perfil com gestão total do sistema.

### Pode fazer

- administrar usuários;
- administrar permissões e overrides;
- visualizar e editar projetos em geral;
- restaurar projetos, tarefas, estimativas, DIEx e OS;
- gerenciar atas e itens de ata;
- gerenciar OMs;
- emitir e cancelar documentos;
- visualizar todos os dashboards;
- administrar sessões de qualquer usuário;
- exportar relatórios.

### Módulos/telas esperadas

- login e perfil;
- administração de usuários;
- administração de permissões;
- projetos;
- tarefas;
- atas e itens de ata;
- estimativas;
- DIEx;
- OS;
- dashboards operacional, executivo e financeiro;
- sessões;
- relatórios/exportações.

## GESTOR

### Papel

Perfil gerencial com visão ampla e forte atuação operacional, mas sem governança total do sistema.

### Pode fazer

- visualizar projetos em geral;
- editar projetos;
- concluir e reabrir projetos conforme regra;
- criar e gerenciar tarefas;
- criar, editar, finalizar e restaurar estimativas;
- emitir, cancelar e restaurar DIEx;
- emitir, cancelar e restaurar OS;
- visualizar governança de permissões;
- gerenciar próprias sessões;
- acessar dashboards operacional, executivo e financeiro;
- exportar relatórios.

### Não deve fazer

- administrar usuários;
- alterar base de permissões;
- criar overrides de permissões;
- administrar atas e OMs.

### Módulos/telas esperadas

- projetos;
- tarefas;
- estimativas;
- DIEx;
- OS;
- dashboards;
- relatórios;
- consulta de permissões.

## PROJETISTA

### Papel

Perfil operacional de execução e produção técnica do projeto.

### Pode fazer

- editar projetos próprios;
- concluir projeto quando a regra permitir;
- criar tarefas;
- editar tarefas no próprio contexto;
- concluir tarefas;
- criar estimativas;
- editar estimativas;
- finalizar estimativas;
- emitir DIEx;
- emitir OS;
- gerenciar próprias sessões;
- acessar dashboard operacional;
- exportar relatórios.

### Restrições típicas

- não administra usuários;
- não administra permissões;
- não administra atas;
- não acessa dashboard executivo por padrão.

### Módulos/telas esperadas

- meus projetos;
- tarefas;
- estimativas;
- DIEx;
- OS;
- dashboard operacional;
- relatórios operacionais.

## CONSULTA

### Papel

Perfil de leitura e acompanhamento.

### Pode fazer

- visualizar tarefas;
- visualizar estimativas;
- gerenciar próprias sessões;
- acessar dashboard operacional.

### Não deve fazer

- editar projetos;
- emitir DIEx;
- emitir OS;
- administrar usuários;
- administrar permissões;
- acessar dashboard executivo por padrão.

### Módulos/telas esperadas

- consulta de projetos conforme acesso;
- consulta de tarefas;
- consulta de estimativas;
- dashboard operacional.

## Permissões por área

### Governança

- `permissions.view`
- `permissions.manage_user_overrides`
- `permissions.manage_role_permissions`

### Projetos

- `projects.view_all`
- `projects.edit_own`
- `projects.edit_all`
- `projects.restore`
- `projects.complete`
- `projects.reopen`

### Tarefas

- `tasks.view_all`
- `tasks.create`
- `tasks.edit_all`
- `tasks.edit_own`
- `tasks.assign`
- `tasks.complete`
- `tasks.archive`
- `tasks.restore`

### Estimativas

- `estimates.view_all`
- `estimates.create`
- `estimates.edit`
- `estimates.finalize`
- `estimates.archive`
- `estimates.restore`

### Documentos

- `diex.issue`
- `diex.cancel`
- `diex.restore`
- `service_orders.issue`
- `service_orders.cancel`
- `service_orders.restore`

### Administração

- `atas.manage`
- `military_organizations.manage`
- `users.manage`

### Sessões

- `sessions.manage_own`
- `sessions.manage_all`

### Dashboards e relatórios

- `dashboard.view_operational`
- `dashboard.view_executive`
- `dashboard.financial_view`
- `reports.export`

## Observações importantes

- o frontend deve sempre considerar `permissions` devolvidas por `/auth/me` como fonte de verdade para habilitar ações;
- a role continua útil para contexto, mas a decisão final deve usar permissão efetiva;
- regras críticas de segurança continuam no backend, mesmo que a UI esconda ações.
