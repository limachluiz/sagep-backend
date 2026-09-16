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

## Descoberta de NEs por fornecedor

Rotas autenticadas, com permissão `financial_execution.view`:

- `GET /financial-execution/discovery/options`: pregões cadastrados, fornecedores e vigências das ATAs; UG padrão das integrações.
- `POST /financial-execution/discovery/page`: `pregaoIds`, `cnpj`, `ug`, `startDate`, `endDate` (YYYY-MM-DD), `year` e `page`. Valida o fornecedor nos pregões e consulta uma página oficial de empenhos. Apenas uma resposta vazia válida indica `exhausted`; erros e páginas fora do período não indicam término.
- `GET /financial-execution/discovery/documents/:code`: documento oficial e documentos relacionados, sem limitar a data destes ao intervalo de emissão das NEs.

O frontend percorre fornecedor × UG × ano sequencialmente, informa cobertura por combinação e interrompe em erro, repetição ou limite de páginas. Datas ausentes permanecem sinalizadas. A combinação mínima/máxima das vigências das ATAs sugere o intervalo, editável para qualquer quantidade de pregões. A busca não confirma vínculo licitatório só pelo CNPJ e não grava/consome saldos.

Esta etapa oferece consulta e importação independente conforme descrito abaixo; conciliação de vínculo e consolidação de totais financeiros ainda não estão implementadas. Validar a cobertura com respostas autenticadas reais antes de oferecer garantia de completude. Mudanças na fonte durante a paginação podem afetar a estabilidade dos resultados.

### Base independente de NEs importadas

A migration `20260915195000_discovered_commitments` cria `DiscoveredCommitment`, sem relações com saldos, projetos ou a carteira financeira. Aplicar com o fluxo normal de `prisma migrate deploy` antes de usar esta versão. Nenhuma migration é executada automaticamente por uma consulta.

- `GET /financial-execution/discovery/archive?page=1&search=...`: base paginada, 20 registros por página; permissão `financial_execution.view`.
- `POST /financial-execution/discovery/archive/:code`: importa/atualiza pelo código completo, lendo documento e vínculos novamente na fonte. Permissão `financial_execution.manage`. Chave única impede duplicatas. Falha na fonte preserva a cópia anterior.
- `DELETE /financial-execution/discovery/archive/:code`: exclui somente a cópia da base de consulta; mesma permissão de gerenciamento. Pode ser importada novamente.

A aba NEs importadas consulta as cópias persistidas sem depender da disponibilidade da fonte. Não representa vínculo licitatório confirmado nem compõe totais financeiros. A correção de CNPJ usa o endpoint existente de edição de ATA e a permissão `atas.manage`. Não deduz CNPJ por nome empresarial. O contador de páginas na busca descreve respostas da API já processadas; a tabela de resultados tem paginação própria.

### Recuperação dinâmica de CNPJ (PNCP)

Quando a ATA possui controle PNCP, o resolver consulta `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados`, derivando o órgão, ano e sequencial do controle e os itens de `AtaItem.externalItemNumber`. Usa `niFornecedor` e `nomeRazaoSocialFornecedor` dos resultados ativos de pessoa jurídica, exigindo nome normalizado equivalente e CNPJ único. O CNPJ do órgão no controle PNCP nunca é usado como CNPJ do fornecedor.

Ordem: cadastro preenchido, snapshots oficiais locais, resultados dos itens PNCP; o caminho Compras.gov é usado quando não há controle PNCP. Não há nomes ou CNPJs de empresas fixados no código. O cache de respostas PNCP dura 5 minutos, comporta até 500 URLs e compartilha requisições simultâneas; erros não são armazenados. Os itens são consultados progressivamente até um resultado oficial completo identificar o fornecedor, com prazo total de 20 segundos e limite explícito de 100 itens. A URL do item comprobatório acompanha a resposta. A interface processa até duas ATAs ao mesmo tempo. Falhas não são interpretadas como resultado vazio. O retorno comprova a identidade do fornecedor em um item da ATA; não representa varredura de todos os resultados do pregão. Alteração concorrente do cadastro impede sobrescrita automática.

Validação real de leitura em 16/09/2026: o cliente novo recuperou o fornecedor do item 1 da compra PNCP `00394452000103-1-018542/2025`; não foi executada gravação no banco de produção.
