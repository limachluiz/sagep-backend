# Segurança do SAGEP Backend

## Verificação de dependências

Execute periodicamente:

```bash
npm audit
npm outdated
```

Em 21/08/2026, o frontend não apresenta vulnerabilidades conhecidas no `npm audit`.
No backend permanecem dois alertas transitivos sem atualização compatível disponível:

- `deepmerge-ts < 8`, carregado por `@prisma/config` no CLI do Prisma. O cenário exige a
  mesclagem de um grafo de objetos recursivo na configuração local; ele não recebe dados das
  requisições HTTP. A correção sugerida pelo npm é o downgrade do Prisma 7 para o Prisma 6,
  incompatível com a arquitetura atual.
- `esbuild 0.27`, carregado por `tsx` apenas no desenvolvimento. O alerta é de baixa
  severidade, exige acesso local e afeta o servidor de desenvolvimento no Windows; a imagem
  de produção Linux não instala essa dependência.

Essas exceções devem ser reavaliadas sempre que Prisma ou `tsx` publicarem nova versão. Não
devem ser silenciadas com `--force` nem corrigidas por override de versão principal sem que
`prisma generate`, validação das migrations, testes e build Docker sejam executados.

O comando `npm run security:audit` é a barreira usada pelo CI. Ele reconhece somente os
identificadores e encadeamentos acima; qualquer alerta novo, mudança de severidade ou alteração
da cadeia transitiva reprova a execução. `npm run security:secrets` procura padrões de chaves
privadas e tokens nos arquivos versionados.

## Automação no GitHub

- O workflow `Backend CI` valida dependências, segredos, migrations, contratos, testes e a
  imagem Docker, inclusive o entrypoint usado para preparar o volume de backups.
- O workflow `Análise de segurança CodeQL` executa consultas estendidas em JavaScript e
  TypeScript a cada push, pull request e semanalmente.
- O Dependabot abre atualizações semanais de npm, Docker e GitHub Actions contra a `main`.
- Os workflows usam permissões mínimas; somente o job do CodeQL recebe
  `security-events: write` para publicar os resultados.

## Tratamento de incidentes

Ao investigar falhas, use o `requestId` devolvido pela API para localizar o evento no log do
servidor. Não copie para chamados segredos JWT, senhas, tokens de integração, arquivos `.env`,
backups `.dump` ou exportações SQL.
