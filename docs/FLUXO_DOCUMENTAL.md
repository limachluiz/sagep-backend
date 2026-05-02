# Fluxo Documental do SAGEP

Este documento descreve o fluxo real suportado hoje pelo backend do SAGEP.

## Visão geral

O projeto evolui pelas seguintes fases:

1. `ESTIMATIVA_PRECO`
2. `AGUARDANDO_NOTA_CREDITO`
3. `DIEX_REQUISITORIO`
4. `AGUARDANDO_NOTA_EMPENHO`
5. `OS_LIBERADA`
6. `SERVICO_EM_EXECUCAO`
7. `ANALISANDO_AS_BUILT`
8. `ATESTAR_NF`
9. `SERVICO_CONCLUIDO`

Também existe a fase `CANCELADO`.

## Entidades do fluxo

- **Projeto**
  - entidade central que guarda a etapa atual e os marcos documentais
- **Estimativa**
  - base financeira e técnica do projeto
- **Nota de Crédito**
  - dado que destrava a formalização documental seguinte
- **DIEx**
  - documento requisitório emitido a partir de estimativa finalizada
- **Nota de Empenho**
  - dado que consolida o compromisso financeiro
- **Ordem de Serviço**
  - documento operacional que libera a execução

## Fase a fase

### 1. Estimativa de Preço

Significa:

- o projeto está em elaboração inicial;
- ainda não avançou para a formalização de crédito.

O que destrava a próxima etapa:

- pelo menos uma estimativa finalizada;
- atualização do projeto para `AGUARDANDO_NOTA_CREDITO`.

Relações importantes:

- a estimativa usa itens da ATA;
- o backend já valida saldo disponível da ATA nesta fase.

### 2. Aguardando Nota de Crédito

Significa:

- o projeto já tem base de estimativa válida;
- aguarda o documento ou dado de crédito.

O que destrava a próxima etapa:

- `creditNoteNumber` ou `creditNoteReceivedAt`;
- criação do DIEx.

### 3. DIEx Requisitório

Significa:

- o projeto já possui DIEx emitido;
- inicia a fase de requisição operacional.

O que destrava a próxima etapa:

- existência do DIEx;
- posterior informação da Nota de Empenho.

Regras importantes:

- o DIEx só pode ser criado a partir de estimativa finalizada;
- ao emitir o DIEx, o backend **reserva saldo** dos itens da ATA;
- se o DIEx for cancelado antes da NE, a reserva é liberada.

### 4. Aguardando Nota de Empenho

Significa:

- o DIEx existe, mas ainda não há OS liberada;
- o próximo marco é a NE.

O que destrava a próxima etapa:

- `commitmentNoteNumber` ou `commitmentNoteReceivedAt`;
- posteriormente, emissão da Ordem de Serviço.

Regras importantes:

- na primeira informação da NE, o backend **consome** o saldo reservado;
- o consumo só acontece se a reserva estiver coerente.

### 5. OS Liberada

Significa:

- a Ordem de Serviço foi emitida;
- o projeto está pronto para iniciar execução.

O que destrava a próxima etapa:

- `executionStartedAt`.

Regras importantes:

- a OS depende de NE informada;
- a OS pode ser cancelada/restaurada conforme as regras atuais do sistema;
- se a NE for cancelada, a OS vinculada é cancelada/inutilizada no rollback.

### 6. Serviço em Execução

Significa:

- a execução começou formalmente.

O que destrava a próxima etapa:

- `asBuiltReceivedAt`.

### 7. Analisando As-Built

Significa:

- o As-Built foi recebido e está em análise.

O que destrava a próxima etapa:

- validação e posterior `invoiceAttestedAt`.

### 8. Atestar NF

Significa:

- o projeto chegou à fase de atesto da nota fiscal.

O que destrava a próxima etapa:

- `invoiceAttestedAt`;
- `serviceCompletedAt`.

### 9. Serviço Concluído

Significa:

- o fluxo documental do projeto foi encerrado com sucesso.

Regras importantes:

- reabertura depende de permissão de negócio apropriada;
- o projeto passa a status concluído.

## Regras de transição

O backend não permite salto arbitrário de fase. A transição é validada pelo serviço de workflow.

Exemplos:

- não é possível avançar para `DIEX_REQUISITORIO` sem estimativa finalizada e sem dado de Nota de Crédito;
- não é possível liberar OS sem NE e sem os dados da própria OS;
- não é possível concluir serviço sem atesto de NF e data de conclusão.

## Regras de retorno

Os retornos principais suportados hoje são:

- cancelamento/arquivamento de DIEx pode devolver o projeto a `AGUARDANDO_NOTA_CREDITO`;
- cancelamento/arquivamento de OS pode devolver o projeto a `AGUARDANDO_NOTA_EMPENHO`;
- cancelamento de NE com rollback devolve o projeto a `ESTIMATIVA_PRECO`.

## Regras de cancelamento

### Cancelamento de DIEx

Regras:

- não pode existir OS ativa vinculada;
- o projeto não pode ter avançado além do ponto permitido;
- a reserva de saldo é liberada.

### Cancelamento de OS

Regras:

- respeita o estágio do projeto;
- não pode violar as restrições de execução já iniciada.

### Cancelamento de Nota de Empenho

O backend suporta uma ação explícita:

- `POST /api/projects/:id/commitment-note/cancel`

Quando executada com sucesso, ocorre em transação:

1. estorno do saldo consumido;
2. cancelamento da estimativa vinculada;
3. cancelamento do DIEx vinculado;
4. cancelamento/inutilização da OS vinculada, se existir;
5. retorno do projeto para `ESTIMATIVA_PRECO`;
6. auditoria do rollback.

## Relação entre Projeto, Estimativa, DIEx, NE e OS

### Projeto

- concentra a etapa atual;
- mantém os marcos documentais;
- serve de eixo de auditoria e dashboard.

### Estimativa

- define itens, quantidades, custos e cobertura;
- é o ponto de partida financeiro;
- precisa estar finalizada para gerar DIEx.

### DIEx

- nasce da estimativa;
- clona itens da estimativa para o documento requisitório;
- reserva saldo da ATA.

### Nota de Empenho

- não é uma entidade separada no modelo atual;
- é representada por campos do projeto;
- quando informada, consome saldo reservado.

### Ordem de Serviço

- depende do projeto com NE informada;
- operacionaliza a execução;
- pode ser cancelada por rollback da NE.

## Relação com saldo da ATA

- a estimativa consulta saldo;
- o DIEx reserva;
- a NE consome;
- o cancelamento da NE estorna;
- alertas e dashboards refletem esse estado.
