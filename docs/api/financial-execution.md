# Execução financeira

O módulo transforma a Nota de Empenho em uma entidade rastreável vinculada ao
projeto. A consulta externa usa exclusivamente o backend e o token da API do
Portal da Transparência nunca é exposto ao navegador.

## Fluxo

1. `POST /financial-execution/commitment-notes/lookup` consulta qualquer NE
   para conferência, sem persistir, vincular a projeto ou movimentar o workflow.
2. `POST /financial-execution/commitment-notes/preview` consulta a NE pelo
   código formado por UG, Gestão e número do documento e compara CNPJ/valor com
   os dados do projeto.
3. `POST /financial-execution/commitment-notes` repete a validação, persiste o
   snapshot oficial, consome a reserva da ATA e libera a OS.
4. `POST /financial-execution/commitment-notes/:id/sync` atualiza liquidações,
   pagamentos, anulações e divergências sem movimentar a etapa do projeto.
5. `POST /financial-execution/invoices` registra a NFe e confronta CNPJ e valor
   com a NE vinculada.

## Sincronização

Com o token configurado, o backend sincroniza todas as NEs ativas assim que o
servidor inicia e repete o ciclo no intervalo definido por
`PORTAL_TRANSPARENCIA_SYNC_INTERVAL_MINUTES` (24 horas por padrão). Um novo
ciclo automático não começa enquanto o anterior ainda estiver em execução.

O usuário com a permissão `financial_execution.sync` também pode atualizar a
carteira completa por `POST /financial-execution/sync` ou verificar apenas uma
NE por `POST /financial-execution/commitment-notes/:id/sync`.

O último snapshot válido é preservado quando a fonte externa falha. A falha é
registrada em `syncStatus=ERRO` e aparece na central de notificações.

## Situações

- `NAO_LIQUIDADA`
- `PARCIALMENTE_LIQUIDADA`
- `LIQUIDADA`
- `PARCIALMENTE_PAGA`
- `PAGA`
- `PARCIALMENTE_ANULADA`
- `ANULADA`

## Notificações

Alertas financeiros são agregados aos alertas operacionais. `DELETE
/operational-alerts` limpa as notificações visíveis apenas para o usuário
autenticado. A dispensa fica válida enquanto a origem não mudar; uma nova
sincronização ou alteração do projeto pode fazer o alerta reaparecer.
