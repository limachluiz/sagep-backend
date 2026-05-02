# Dashboards do SAGEP

O backend expõe três visões principais:

- dashboard geral
- dashboard operacional
- dashboard executivo

Todos os endpoints ficam sob `/api/dashboard`.

## Regras gerais

- todos exigem autenticação;
- as permissões variam por dashboard;
- os dashboards mantêm blocos existentes e foram evoluídos com novos objetos, sem remoção de contratos anteriores.

## 1. Dashboard geral

### Endpoint

- `GET /api/dashboard`

### Permissão

- `dashboard.financial_view`

### Objetivo

Visão consolidada do sistema com foco em projetos, documentos, pipeline e indicadores financeiros.

### Blocos principais

- `summary`
- `totals`
- `documents`
- `pendingActions`
- `financial`
- `pipeline`
- `attention`
- `rankings`
- `openProjects`
- `completedProjects`
- `canceledProjects`
- `recent`

### Filtros temporais

Aceita:

- `periodType=month|quarter|semester|year`
- `referenceDate`
- `startDate`
- `endDate`
- `asOfDate`

Regras:

- `asOfDate` não pode ser combinado com os demais filtros temporais;
- `startDate` e `endDate` devem ser enviados juntos.

### Exemplos

```http
GET /api/dashboard?periodType=month&referenceDate=2026-05-01T00:00:00.000Z
```

```http
GET /api/dashboard?startDate=2026-05-01T00:00:00.000Z&endDate=2026-05-31T23:59:59.999Z
```

## 2. Dashboard operacional

### Endpoint

- `GET /api/dashboard/operational`

### Permissão

- `dashboard.view_operational`

### Objetivo

Acompanhar fila de trabalho, pendências, alertas e risco imediato da operação.

### Query params

- `staleDays`
- `limit`

Exemplos:

```http
GET /api/dashboard/operational
```

```http
GET /api/dashboard/operational?staleDays=10&limit=50
```

### Blocos principais

- `alerts`
- `staleProjects`
- `pendingByStage`
- `operationalQueue`
- `frequentNextActions`
- `latestMovements`

### Novo bloco de inventory/saldo

Campo novo:

- `inventory`

Estrutura resumida:

```json
{
  "inventory": {
    "summary": {
      "totalItems": 120,
      "lowStockItems": 8,
      "insufficientItems": 2,
      "itemsWithActiveReserve": 11,
      "itemsWithActiveConsumption": 15,
      "recentReversals": 1,
      "staleReservations": 3,
      "totalReservedAmount": "12000.00",
      "totalConsumedAmount": "45000.00",
      "totalAvailableAmount": "188000.00"
    },
    "criticalItems": [],
    "staleReservations": [],
    "recentReversals": []
  }
}
```

### O que o bloco operacional de inventory responde

- quantos itens estão com saldo baixo;
- quantos itens já estão insuficientes;
- quantos itens possuem reserva ativa;
- quantos itens possuem consumo ativo;
- quantos estornos recentes ocorreram;
- quais itens exigem ação prioritária;
- quais reservas estão envelhecendo sem conversão.

### Uso sugerido no frontend

- cards de alerta rápido;
- tabela de itens críticos;
- lista curta de reservas antigas;
- feed de estornos recentes.

## 3. Dashboard executivo

### Endpoint

- `GET /api/dashboard/executive`

### Permissão

- `dashboard.view_executive`

### Objetivo

Fornecer visão gerencial agregada, com foco em volume, risco e capacidade.

### Query params

Aceita o mesmo modelo temporal do dashboard geral:

- `periodType=month|quarter|semester|year`
- `referenceDate`
- `startDate`
- `endDate`
- `asOfDate`

Exemplos:

```http
GET /api/dashboard/executive?periodType=month&referenceDate=2026-05-01T00:00:00.000Z
```

```http
GET /api/dashboard/executive?asOfDate=2026-05-15T00:00:00.000Z
```

### Blocos principais

- `summary`
- `projects`
- `financial`
- `distribution`
- `periodIndicators`

### Novo bloco de inventory/saldo

Campo novo:

- `inventory`

Estrutura resumida:

```json
{
  "inventory": {
    "snapshot": {
      "itemsAtRisk": 8,
      "itemsInsufficient": 2,
      "itemsWithActiveReserve": 11,
      "itemsWithActiveConsumption": 15,
      "totalReservedAmount": "12000.00",
      "totalConsumedAmount": "45000.00",
      "totalAvailableAmount": "188000.00"
    },
    "periodActivity": {
      "totalReservedAmount": "8000.00",
      "totalConsumedAmount": "30000.00",
      "totalReversedAmount": "5000.00",
      "totalReleasedAmount": "2000.00"
    },
    "distribution": {
      "byAtaType": [],
      "byVendor": []
    },
    "criticalItems": []
  }
}
```

### Novos indicadores adicionados ao payload executivo

Em `summary`:

- `ataItemsAtRisk`
- `ataItemsInsufficient`

Em `financial`:

- `inventoryCurrentReservedAmount`
- `inventoryCurrentConsumedAmount`
- `inventoryCurrentAvailableAmount`
- `inventoryReversedAmountInPeriod`
- `inventoryByAtaType`
- `inventoryByVendor`

### O que o bloco executivo responde

- risco agregado de indisponibilidade de itens;
- estoque comprometido hoje;
- estoque já consumido;
- estorno de período;
- concentração por tipo de ATA;
- concentração por fornecedor.

## Indicadores financeiros

Além dos indicadores antigos de estimativa, DIEx e OS, o backend agora também devolve indicadores de saldo:

- valor reservado atual;
- valor consumido atual;
- valor disponível atual;
- valor estornado no período;
- distribuição financeira do inventário por tipo de ATA e fornecedor.

## Indicadores por projeto

O dashboard continua organizado em torno de projeto:

- fase atual;
- pendências por etapa;
- fila operacional;
- próximos passos;
- atenção por estagnação e bloqueio documental.

O inventário complementa essa visão, mas não substitui o foco principal em projeto.

## Relação com alertas operacionais

O backend reaproveita o serviço de alertas e o serviço de saldo da ATA para compor:

- risco de saldo baixo;
- risco de saldo insuficiente;
- reservas antigas;
- estornos recentes.

## Observação de contrato

As mudanças recentes foram aditivas:

- nenhum bloco legado foi removido;
- os novos dados de saldo foram adicionados em objetos específicos (`inventory` e campos extras em `summary`/`financial`).
