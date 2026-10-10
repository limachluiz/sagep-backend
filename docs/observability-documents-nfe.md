# Observabilidade, versões documentais e conferência de NF-e

## Observabilidade

- `GET /api/health/status` permanece público e sanitizado para monitores externos de disponibilidade.
- `GET /api/health/details` exige `system_health.view_details` e inclui runtime, memória, requisições dos últimos 15 minutos, armazenamento, backups, certificado e automações.
- `GET /api/health/metrics` aceita usuário com `system_health.view_details` ou o token técnico `HEALTH_METRICS_TOKEN` e expõe métricas no formato OpenMetrics/Prometheus.
- Toda resposta recebe `X-Request-Id`. Um identificador recebido nesse cabeçalho é preservado quando respeita o formato seguro, permitindo rastrear proxy, API e logs.
- Os logs HTTP são JSON e não registram query strings, tokens, corpos nem credenciais. O Compose limita cada arquivo a `DOCKER_LOG_MAX_SIZE` e mantém `DOCKER_LOG_MAX_FILES` arquivos.

O perfil opcional `monitoring` inicia o Prometheus já configurado para coletar as métricas com o token técnico, sem reutilizar credenciais pessoais:

```bash
docker compose --profile monitoring up -d
```

Defina `HEALTH_METRICS_TOKEN` com um segredo aleatório de pelo menos 32 caracteres. O Prometheus fica restrito ao loopback por padrão e mantém 30 dias de histórico, ajustáveis por `PROMETHEUS_RETENTION`.

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

### Métricas e alertas operacionais

Os contadores HTTP são acumulados desde o início do processo, independentemente do limite de 5.000 amostras do diagnóstico recente. O histograma `sagep_http_request_duration_seconds` permite calcular p95 por `histogram_quantile`. Logs e métricas usam o modelo da rota (`/api/users/:id`), preservando o `requestId` sem expor valores de parâmetros ou URLs desconhecidas.

A coleta protegida também expõe `sagep_health_component_status`: `0` operacional, `1` degradado, `2` indisponível e `-1` não monitorado. Ela cobre banco, armazenamento, backups, certificado e automações. Componentes desativados não disparam alertas. As regras em `deploy/monitoring/alerts.yml` detectam falha de coleta, componentes com problema, erros HTTP e latência elevada.

O perfil local serve para histórico e diagnóstico. Para alertar sobre perda total do host, execute Prometheus em **outro host**, acessível ao endereço HTTPS do SAGEP. Use o exemplo `deploy/monitoring/prometheus-external.yml`, substitua `sagep.example.invalid` pelo endereço real e salve somente nesse host o token técnico em `/etc/prometheus/sagep-metrics-token` (modo `0600`). Monte também `alerts.yml` no caminho indicado. O arquivo externo utiliza validação TLS normal e nunca deve receber um token pessoal.

Para entrega externa, configure um Alertmanager no host de monitoramento e seus receptores de acordo com o canal autorizado pela instituição. O exemplo aponta para `alertmanager:9093`. A entrega real e a simulação de queda do host fazem parte da homologação; somente regras carregadas no Prometheus não comprovam recebimento de alerta. Não coloque credenciais de SMTP, Telegram ou webhook no repositório.
