# Gestão de Saldo dos Itens da ATA

O SAGEP passou a tratar saldo da ATA como regra de negócio central.

## Objetivo

Garantir que os itens da ATA:

- não sejam sobrealocados;
- possam ser reservados por DIEx;
- sejam consumidos na NE;
- sejam estornados no cancelamento da NE;
- alimentem alertas e dashboards.

## Conceitos principais

### Saldo total

É o saldo inicial configurado no item da ATA:

- `initialQuantity`

O valor financeiro inicial é derivado de:

- `initialQuantity * unitPrice`

### Saldo reservado

Representa o saldo comprometido por DIEx emitido, mas ainda não convertido em consumo.

É afetado por:

- `RESERVE`
- `RELEASE`
- `CONSUME`

### Saldo consumido

Representa o saldo já baixado financeiramente após informação da NE.

É afetado por:

- `CONSUME`
- `REVERSE_CONSUME`

### Saldo disponível

É o saldo realmente utilizável para nova estimativa ou nova reserva.

Fórmula lógica:

- `disponível = inicial - reservado - consumido`

## Modelagem adotada

### AtaItem

O item da ATA mantém:

- identificação e preço unitário;
- `initialQuantity`;
- `deletedAt` para exclusão lógica.

### AtaItemBalanceMovement

Tabela de movimentações auditáveis por item.

Campos relevantes:

- `ataItemId`
- `projectId`
- `estimateId`
- `estimateItemId`
- `diexRequestId`
- `serviceOrderId`
- `actorUserId`
- `actorName`
- `movementType`
- `quantity`
- `unitPrice`
- `totalAmount`
- `summary`
- `metadata`
- `createdAt`

## Tipos de movimento

### `RESERVE`

Usado quando:

- o DIEx é emitido.

Efeito:

- aumenta saldo reservado;
- reduz saldo disponível.

### `RELEASE`

Usado quando:

- o DIEx é cancelado antes da NE.

Efeito:

- reduz saldo reservado;
- devolve saldo ao disponível.

### `CONSUME`

Usado quando:

- a NE é informada pela primeira vez no projeto.

Efeito:

- reduz reservado;
- aumenta consumido.

### `REVERSE_CONSUME`

Usado quando:

- a NE é cancelada.

Efeito:

- reduz consumido;
- devolve saldo ao disponível.

### `ADJUSTMENT`

Ficou preparado para ajustes futuros de inventário.

## Regras por etapa

### Na estimativa

- a estimativa consulta saldo disponível;
- o backend bloqueia item acima do disponível;
- item logicamente deletado ou inativo não participa;
- a estimativa não consome saldo.

### No DIEx

- o DIEx só nasce de estimativa finalizada;
- ao emitir, o backend cria `RESERVE`;
- se não houver saldo disponível suficiente, a emissão falha.

### Na Nota de Empenho

- a primeira informação da NE consome o saldo reservado;
- o backend cria `CONSUME`;
- não consome sem reserva coerente.

### No cancelamento da NE

- o backend cria `REVERSE_CONSUME`;
- cancela a cadeia documental vinculada;
- devolve o projeto à fase `ESTIMATIVA_PRECO`.

## Cancelamento da NE e rollback

Endpoint:

- `POST /api/projects/:id/commitment-note/cancel`

Executa em transação:

1. estorno do saldo consumido;
2. cancelamento da estimativa;
3. cancelamento do DIEx;
4. cancelamento/inutilização da OS, se existir;
5. retorno do projeto à fase inicial;
6. auditoria do rollback.

## Regras de segurança

- não permitir saldo negativo;
- não permitir reservar acima do disponível;
- não permitir consumir sem reserva coerente;
- não permitir uso de item com `deletedAt != null`;
- manter tudo auditável;
- preservar integridade entre projeto, estimativa, DIEx e OS.

## Alertas

### Saldo baixo

O item entra em alerta de saldo baixo quando o disponível fica próximo ao limite operacional definido pelo serviço.

Hoje o backend usa critério percentual sobre o saldo inicial.

### Saldo insuficiente

O item entra em insuficiência quando o disponível chega ao limite mínimo prático.

Consequência:

- nova alocação é bloqueada.

### Reservas antigas / stale

O backend já expõe reservas antigas no bloco de alertas operacionais e dashboards, permitindo identificar:

- DIEx emitido há muito tempo sem conversão em consumo;
- estoque preso em reserva.

### Estornos por cancelamento de NE

Os estornos recentes também são expostos:

- em alertas operacionais;
- no dashboard operacional;
- no dashboard executivo.

## Payload de saldo para frontend

Os endpoints de item da ATA e, quando aplicável, os itens da estimativa retornam algo na linha de:

```json
{
  "balance": {
    "initialQuantity": "1000.00",
    "reservedQuantity": "50.00",
    "consumedQuantity": "100.00",
    "availableQuantity": "850.00",
    "initialAmount": "100000.00",
    "reservedAmount": "5000.00",
    "consumedAmount": "10000.00",
    "availableAmount": "85000.00",
    "lowStock": false,
    "insufficient": false,
    "lastMovementAt": "2026-05-02T00:00:00.000Z"
  }
}
```

## Impacto no dashboard

### Dashboard operacional

Mostra:

- itens com saldo baixo;
- itens insuficientes;
- reservas ativas;
- consumo ativo;
- reservas antigas;
- estornos recentes.

### Dashboard executivo

Mostra:

- risco agregado de esgotamento;
- total reservado;
- total consumido;
- total estornado;
- distribuição por tipo de ATA;
- distribuição por fornecedor.
