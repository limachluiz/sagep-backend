# Consulta oficial de NF-e e validação criptográfica local

## Consulta NF-e

Na Carteira de Empenhos, abra Registrar Nota Fiscal e selecione **Consultar SEFAZ**. Informe os 44 dígitos da chave modelo 55. O backend consulta o `NFeDistribuicaoDFe` do Ambiente Nacional com autenticação TLS por certificado A1 institucional. Não são utilizados CAPTCHA, scraping ou credenciais pessoais GOV.BR.

O servidor precisa de `NFE_INTERESTED_CNPJ`, `NFE_UF_CODE` (código IBGE, Amazonas=13), certificado `.pfx` e senha fornecida por arquivo. O certificado deve representar o interessado autorizado pela SEFAZ. Não basta conhecer a chave. Documentos fora da janela de distribuição, sem autorização ou indisponíveis podem exigir importação manual do XML.

O transporte fixa os endpoints oficiais de produção/homologação, valida TLS, limita tempo e tamanho de resposta e descompressão e não repete automaticamente pedidos. Respostas 137/656 bloqueiam novas consultas para o mesmo interessado/ambiente por uma hora, com controle persistido no banco. A aplicação serializa consultas desse interessado, inclusive entre múltiplas instâncias. A prévia é reutilizada por até 15 minutos.

O retorno pode ser XML completo, resumo ou somente eventos. Um resumo não contém os itens, destinatário e assinatura XML: a interface informa esses limites e mantém a conferência pendente. O protocolo do XML completo comprova a autorização na emissão; sozinho não garante ausência de cancelamento posterior. Somente dados retornados são tratados como evidência. Não é enviada manifestação do destinatário automaticamente. O XML completo não é persistido; preservam-se resumo, hash quando disponível, origem SEFAZ, ambiente, data e identificador da consulta.

A importação exige revisão e `confirmed=true`. Ela verifica novamente vínculo com projeto/NE, duplicidade e expiração da prévia. Ambiente de homologação e notas canceladas/denegadas não podem ser importados. Divergências financeiras são exibidas ao fiscal. **A consulta/importação oficial nunca realiza atesto, consumo de saldo nem avanço de workflow.**

A implementação utiliza o leiaute `distDFeInt` 1.01 para CNPJ numérico e NF-e modelo 55. CNPJ alfanumérico não é aceito nesta entrega; exige atualização dos cadastros fiscais e seus contratos em conjunto.

## Assinaturas PDF

Ao anexar uma versão assinada, a interface inicia a validação local. O botão **Validar assinatura** permite repetir a análise. O endpoint `POST /api/document-versions/:id/validate` verifica autorização no projeto, hash do arquivo preservado e as assinaturas embarcadas com pyHanko 0.33.0. O PDF nunca é enviado a terceiros.

O resultado separa integridade do conteúdo assinado, verificação criptográfica, análise de atualizações incrementais, cadeia de confiança e revogação. Certificados embutidos no PDF não são aceitos como raízes de confiança. Dados de revogação devem estar disponíveis no documento (DSS) ou no diretório administrado. A validação opera offline, sem acessar URLs de certificados/PDFs não confiáveis.

- `VALID`: todas as assinaturas passaram, com cadeia e dados de revogação suficientes.
- `INVALID`: assinatura alterada, criptografia inválida, certificado revogado, ausência de assinatura ou modificações incompatíveis.
- `PENDING_VALIDATION` (`INDETERMINATE` no diagnóstico): ausência de confiança/revogação, certificado vencido sem prova histórica suficiente ou impossibilidade de concluir a análise.

A confirmação local é técnica, conforme as raízes administradas. Ela não declara automaticamente conformidade jurídica com todas as políticas ICP-Brasil/GOV.BR. O horário declarado pelo assinante não equivale a um carimbo do tempo confiável. A interface mantém link ao VALIDAR/ITI para verificação oficial complementar.

## Configuração Docker

Prepare **no próprio host** as pastas:

- `runtime-secrets/nfe/certificate.pfx`: certificado institucional A1;
- `runtime-secrets/nfe/password`: senha em arquivo, modo 0600;
- `signature-trust/roots/`: certificados de autoridades raiz explicitamente confiáveis, obtidos e verificados no repositório oficial ITI ou na infraestrutura adotada;
- `signature-trust/intermediates/`: certificados intermediários PEM/DER, quando necessários;
- `signature-trust/crls/`: listas de revogação DER `.crl`, atualizadas;
- `signature-trust/ocsps/`: respostas OCSP DER `.der`, quando necessárias.

Use permissões que permitam somente ao usuário da aplicação ler esses materiais e mantenha cópia institucional protegida. As pastas são ignoradas pelo Git e montadas somente para leitura:

```bash
docker compose -f docker-compose.yml -f deploy/document-verification.compose.yml up -d --build
```

Sem certificado fiscal, o cadastro manual/XML continua disponível. Sem raízes e revogação, a integridade criptográfica do PDF ainda pode ser analisada, mas a assinatura fica inconclusiva. Em instalação sem Docker, instale `scripts/signature-validation/requirements.txt` em ambiente Python isolado e configure `PDF_VALIDATION_PYTHON` para o executável desse ambiente.

## Homologação necessária

A suíte usa respostas fiscais simuladas sanitizadas e PDFs/certificados gerados exclusivamente durante os testes. A consulta real exige o certificado institucional e uma chave autorizada. Verifique no ambiente real consulta autorizada, resumo, falta de acesso, espera, duplicidade, registro sem atesto e PDFs assinados pela infraestrutura usada pela OM, com evidências de revogação atualizadas.

Fontes oficiais:

- [Relação de Web Services NF-e](https://www.nfe.fazenda.gov.br/portal/webServices.aspx?tipoConteudo=OUC%2FYVNWZfo%3D)
- [NT 2014.002 e regras de consulta/distribuição](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY%3D)
- [Validação de assinaturas pyHanko 0.33.0](https://docs.pyhanko.eu/en/v0.33.0/lib-guide/validation.html)
- [VALIDAR/ITI](https://validar.iti.gov.br/)

