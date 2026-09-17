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
- `POST /financial-execution/discovery/page`: `pregaoIds`, `ataIds` (opcional, restringe às ATAs selecionadas), `cnpj`, `ug`, `startDate`, `endDate` (YYYY-MM-DD), `year` e `page`. Valida o fornecedor nos pregões e consulta uma página oficial de empenhos. Apenas uma resposta vazia válida indica `exhausted`; erros e páginas fora do período não indicam término.
- `GET /financial-execution/discovery/documents/:code`: documento oficial e documentos relacionados, sem limitar a data destes ao intervalo de emissão das NEs.

O frontend percorre fornecedor × UG × ano sequencialmente, informa cobertura por combinação e interrompe em erro, repetição ou limite de páginas. Datas ausentes permanecem sinalizadas. A combinação mínima/máxima das vigências das ATAs sugere o intervalo, editável para qualquer quantidade de pregões. A busca não confirma vínculo licitatório só pelo CNPJ e não grava/consome saldos.

Esta etapa oferece consulta e importação independente conforme descrito abaixo; conciliação de vínculo e consolidação de totais financeiros ainda não estão implementadas. Validar a cobertura com respostas autenticadas reais antes de oferecer garantia de completude. Mudanças na fonte durante a paginação podem afetar a estabilidade dos resultados.

### Base independente de NEs importadas

A migration `20260915195000_discovered_commitments` cria `DiscoveredCommitment`, sem relações que movimentem saldos ou projetos. Aplicar com o fluxo normal de `prisma migrate deploy` antes de usar esta versão. Nenhuma migration é executada automaticamente por uma consulta.

- `GET /financial-execution/discovery/archive?page=1&pageSize=10&search=...`: base paginada, 10 registros por padrão, opções 10/20/30/50; permissão `financial_execution.view`.
- `POST /financial-execution/discovery/archive/:code`: importa/atualiza pelo código completo, lendo documento e vínculos novamente na fonte. Permissão `financial_execution.manage`. Chave única impede duplicatas. Falha na fonte preserva a cópia anterior.
- `DELETE /financial-execution/discovery/archive/:code`: exclui somente a cópia da base de consulta; mesma permissão de gerenciamento. Pode ser importada novamente.

A aba NEs importadas consulta as cópias persistidas sem depender da disponibilidade da fonte. Não representa vínculo licitatório confirmado. As cópias agora compõem a carteira consolidada, sem consumo dos saldos das ATAs ou duplicação de NEs de projetos. A correção de CNPJ usa o endpoint existente de edição de ATA e a permissão `atas.manage`. Não deduz CNPJ por nome empresarial. O contador de páginas na busca descreve respostas da API já processadas; a tabela de resultados tem paginação própria.

### Recuperação dinâmica de CNPJ (PNCP)

Quando a ATA possui controle PNCP, o resolver consulta `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados`, derivando o órgão, ano e sequencial do controle e os itens de `AtaItem.externalItemNumber`. Usa `niFornecedor` e `nomeRazaoSocialFornecedor` dos resultados ativos de pessoa jurídica, exigindo nome normalizado equivalente e CNPJ único. O CNPJ do órgão no controle PNCP nunca é usado como CNPJ do fornecedor.

Ordem: cadastro preenchido, snapshots oficiais locais, resultados dos itens PNCP; o caminho Compras.gov é usado quando não há controle PNCP. Não há nomes ou CNPJs de empresas fixados no código. O cache de respostas PNCP dura 5 minutos, comporta até 500 URLs e compartilha requisições simultâneas; erros não são armazenados. Os itens são consultados progressivamente até um resultado oficial completo identificar o fornecedor, com prazo total de 20 segundos e limite explícito de 100 itens. A URL do item comprobatório acompanha a resposta. A interface processa até duas ATAs ao mesmo tempo. Falhas não são interpretadas como resultado vazio. O retorno comprova a identidade do fornecedor em um item da ATA; não representa varredura de todos os resultados do pregão. Alteração concorrente do cadastro impede sobrescrita automática.

Validação real de leitura em 16/09/2026: o cliente novo recuperou o fornecedor do item 1 da compra PNCP `00394452000103-1-018542/2025`; não foi executada gravação no banco de produção.

### Seleção, importação em lote e carteira consolidada

Aplicar também a migration `20260916160000_discovered_origin` com `prisma migrate deploy` antes de iniciar o novo backend. A origem padrão dos registros existentes é `IMPORTED`.

- `POST /discovery/archive/:code` aceita `{ origin: "IMPORTED" | "STANDALONE", replaceOrigin?: "IMPORTED" | "STANDALONE" }` (prefixo `/financial-execution`). Importação e avulsa compartilham a chave única UG + gestão + número. Uma origem diferente retorna 409 `NE_DUPLICATE_ORIGIN`; substituir exige a origem anterior explicitamente confirmada. Atualizações concorrentes são recusadas para evitar sobrescrever uma decisão recente.
- `GET /discovery/archive/keys?search=...`: lista os códigos do filtro (até 5000) para confirmar o conjunto exato da exclusão.
- `POST /discovery/archive/delete-selected` recebe `{ codes: [...] }`, de 1 a 5000 códigos. Exclui exclusivamente cópias da base de consulta. Não cancela NEs vinculadas a projetos.
- A interface processa importações em sequência e apresenta sucessos, falhas e conflitos individualmente. Seleção atravessa páginas; importar todas usa todo o resultado encontrado, não somente a página visível. Remover dos resultados da busca não exclui cópias já salvas.
- `GET /financial-execution/portfolio` retorna registros de projetos acessíveis e cópias importadas/avulsas, deduplicados pelo código completo. Registros ativos de projeto têm prioridade. Uma cópia de NE vinculada a projeto fora do escopo do usuário não permite contornar esse escopo.
- Totais utilizam valores explicitamente disponíveis. Ausência de valores de liquidação/pagamento é `null`, não zero. Não somamos valores integrais de documentos relacionados: uma OB pode abranger outras NEs. Valores incompatíveis (como pago maior que empenhado) são exibidos como divergentes e excluídos dos totais; registros incompletos ficam a conferir. A interface identifica que os totais são apenas os valores informados.
- A busca apresenta modal centralizado, seleção por ATA e fornecedor, paginação local 10/20/30/50 e carga de CNPJ individual ou das ATAs selecionadas. O período sugerido usa a menor data inicial e maior data final das ATAs selecionadas.

A migração e a integração autenticada com dados reais precisam ser verificadas no ambiente de instalação. Os testes locais usam respostas simuladas e não comprovam cobertura integral da fonte.

### Liquidações e pagamentos por empenho (16/09/2026)

A documentação oficial `https://api.portaldatransparencia.gov.br/v3/api-docs` define o endpoint paginado `GET /api-de-dados/despesas/empenhos-impactados?codigoDocumento=...&fase=2|3&pagina=...`. O DTO `EmpenhoImpactadoBasicoDTO` informa `empenho`, `subitem`, `valorLiquidado`, `valorPago` e `valorRestoPago`. O DTO do documento principal informa `valor`, mas não os totais de liquidação/pagamento; por isso somente ler esse documento não preenchia os cartões.

A importação agora enriquece a cópia salva com `snapshot.financial` (versão 1). Para cada documento relacionado de liquidação/pagamento:

1. Consulta as páginas de empenhos impactados até receber uma lista vazia válida. Página repetida, erro de fonte, prazo de 60s ou limite de 100 páginas impedem publicar um total parcial daquele documento.
2. Seleciona apenas o código completo da NE, incluindo UG e gestão. Nunca associa somente pelo número abreviado.
3. Deduplica documentos e subitens; conflitos de valores são sinalizados. Soma valores com o sinal original, incluindo estornos. Na fase 3, soma `valorPago` e `valorRestoPago` informado separadamente pela fonte.
4. Salva os subitens comprobatórios e a parcela atribuída à NE. O valor integral da NS/OB não é utilizado como parcela de cada NE. Respostas completas de empenhos impactados têm cache de 5 minutos e limite de 300 entradas, compartilhado entre consultas simultâneas.

Quando há valor confirmado de pagamento/liquidação mas a outra fase não tem dados, a situação identifica a fase conhecida e a NE continua contada entre as que precisam de conferência. Ausência de documentos continua sendo valor não informado, não zero. Um valor de zero explícito é preservado.

- `GET /financial-execution/discovery/archive/:code`: detalhe salvo com resumo financeiro calculado, documento, relacionados e evidências por subitem. Usa `financial_execution.view`.
- `POST /financial-execution/discovery/archive/:code/sync`: atualiza uma cópia existente preservando sua origem; usa `financial_execution.manage`. Erro ao confirmar parcelas de uma cópia existente mantém o snapshot anterior.
- Na carteira, **Atualizar liquidações e pagamentos** atualiza as cópias importadas/avulsas sequencialmente e apresenta falhas por NE. É necessário executar essa atualização para enriquecer as importações feitas antes desta versão. Não consulta o governo a cada abertura de tela.
- A sincronização das NEs vinculadas a projetos usa a mesma atribuição por empenho. Assim, uma NS ou OB compartilhada não tem mais seu valor integral lançado em cada projeto; erro ou ambiguidade na atribuição interrompe a sincronização e preserva os valores anteriores.
- Filtros por empresa, situação e texto são combinados na lista e reiniciam a paginação. Os cartões mantêm o total da carteira completa, identificado na tela.
- O clique na NE abre o mesmo modal nas abas carteira e importadas; NEs de projetos utilizam o endpoint de detalhes existente com controle de acesso ao projeto. A UG de uma NE manual vem do campo cadastrado, não do identificador interno.

Não há nova migração nesta versão: as evidências complementam o JSON já persistido. Testes usam o formato publicado pela API e respostas simuladas; a validação autenticada das parcelas no ambiente do usuário continua necessária.
