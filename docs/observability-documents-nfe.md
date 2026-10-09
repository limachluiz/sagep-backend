# Observabilidade, versões documentais e conferência de NF-e

## Observabilidade

- `GET /api/health/status` permanece público e sanitizado para monitores externos de disponibilidade.
- `GET /api/health/details` exige `system_health.view_details` e inclui runtime, memória, requisições dos últimos 15 minutos, armazenamento, backups, certificado e automações.
- `GET /api/health/metrics` exige a mesma permissão e expõe métricas no formato OpenMetrics/Prometheus.
- Toda resposta recebe `X-Request-Id`. Um identificador recebido nesse cabeçalho é preservado quando respeita o formato seguro, permitindo rastrear proxy, API e logs.
- Os logs HTTP são JSON e não registram query strings, tokens, corpos nem credenciais. A retenção e rotação devem ser configuradas no runtime de containers.

Para detectar indisponibilidade total, configure uma sonda externa contra `/api/health/status`; um processo executado dentro do próprio SAGEP não consegue alertar quando todo o host está fora do ar.

## Versões documentais

Estimativas, DIEx e Ordens de Serviço preservam automaticamente o PDF gerado no volume de evidências. O banco registra versão, autor, data, tamanho e SHA-256. Gerar novamente conteúdo idêntico não cria uma versão duplicada.

Rotas principais:

- `GET /api/document-versions?entityType=...&entityId=...`
- `GET /api/document-versions/:id/download`
- `POST /api/document-versions/:id/signed`
- `PATCH /api/document-versions/:id/signature-validation`
- `PATCH /api/document-versions/:id/invalidate`

O SAGEP detecta a presença estrutural de assinatura embarcada no PDF, mas não declara validade criptográfica automaticamente. A validação feita no GOV.BR, ICP-Brasil ou outra fonte autorizada é registrada separadamente, sem custodiar certificado ou chave privada pessoal.

## NF-e

O cadastro manual foi mantido. A opção recomendada é importar o XML autorizado, que confere:

- estrutura NF-e, chave de 44 dígitos e dígito verificador;
- assinatura XML e protocolo de autorização;
- CNPJ do emitente contra o favorecido da NE;
- valor da nota contra o limite financeiro da NE;
- duplicidade por chave ou por número, série e fornecedor.

O XML integral não é persistido. O SAGEP guarda somente o hash SHA-256 e o resumo financeiro necessário à auditoria. Divergências não movimentam automaticamente o workflow nem o saldo.

A consulta web pública do Portal da NF-e usa desafio humano. O Web Service oficial `NFeDistribuicaoDFe` exige uma integração com certificado digital e regras de distribuição; essa conexão pode ser acrescentada futuramente sem alterar o fluxo de conferência por XML.

Referências oficiais: Portal Nacional da NF-e, relação de Web Services e Manual de Orientação do Contribuinte (`NFeDistribuicaoDFe`).
