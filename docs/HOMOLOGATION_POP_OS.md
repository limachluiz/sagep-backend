# Homologação isolada no Pop!_OS

Este procedimento valida o SAGEP no notebook sem parar, recriar ou reutilizar o
ambiente `sagep-backend` existente. A homologação utiliza nomes e portas
exclusivos:

| Recurso | Homologação |
| --- | --- |
| Projeto Compose | `sagep-homolog` |
| Prefixo dos containers e volumes | `sagep_homolog` |
| IP local | `192.168.250.10` |
| DNS | `sagep.homolog.test` |
| API local | `127.0.0.1:53000` |
| PostgreSQL local | `127.0.0.1:55432` |
| pgAdmin local | `127.0.0.1:55051` |
| HTTP/HTTPS | `192.168.250.10:58080/58443` |
| Namespace do firewall | `SAGEP-HML` |

## 1. Atualizar e conferir os repositórios

No diretório que contém `sagep-backend` e `sagep-web`:

```bash
git -C sagep-backend pull --ff-only origin upgrade-security
git -C sagep-web pull --ff-only origin upgrade-security
git -C sagep-backend status --short --branch
git -C sagep-web status --short --branch
```

## 2. Criar a configuração protegida

```bash
cd sagep-backend
npm run homologation:prepare
stat -c '%a %n' .env.homolog
```

O arquivo deve aparecer com modo `600`. O comando gera localmente todas as
senhas e chaves e nunca as imprime. Um arquivo existente não é sobrescrito.

## 3. Preparar IP e resolução local

Os comandos seguintes alteram somente um endereço adicional da interface de
loopback e uma linha exclusiva em `/etc/hosts`:

```bash
sudo ip address add 192.168.250.10/32 dev lo
grep -qxF '192.168.250.10 sagep.homolog.test' /etc/hosts || \
  printf '%s\n' '192.168.250.10 sagep.homolog.test' | sudo tee -a /etc/hosts
getent hosts sagep.homolog.test
```

Se o endereço já existir, `ip` responderá `File exists`; isso não exige nova
alteração. O nome deve resolver exatamente para `192.168.250.10`.

## 4. Pré-validar e implantar

```bash
npm run homologation:check
node scripts/check-deployment-preflight.mjs .env.homolog
sudo /usr/bin/env node scripts/install-sagep.mjs \
  --env .env.homolog --deploy --confirm-deploy IMPLANTAR
```

O instalador constrói as imagens, inicializa a autoridade da homologação, aplica
somente o namespace `SAGEP-HML` do firewall, sobe os containers isolados e
instala `sagep-homolog-firewall.service`. O ambiente já existente mantém seus
containers, volumes, portas e regras.

## 5. Conferir o resultado

```bash
docker compose --env-file .env.homolog --profile https ps
sudo node scripts/manage-firewall.mjs --env .env.homolog --check
curl -fsS http://127.0.0.1:53000/api/health/status
```

O acesso inicial será:

```text
https://sagep.homolog.test:58443/setup
```

O certificado raiz público será exportado para
`deployment-output/sagep-om-root-ca.crt`. Confira a impressão digital exibida
no terminal antes de instalar a confiança no navegador ou no sistema.

## Parada segura sem apagar dados

```bash
docker compose --env-file .env.homolog --profile https down
```

Não utilize `-v`: os volumes da homologação contêm banco, backups e autoridade
certificadora e devem ser preservados para os testes de atualização e rollback.

## Remoção das regras e do endereço de teste

Execute somente ao encerrar definitivamente a homologação:

```bash
sudo systemctl disable --now sagep-homolog-firewall.service
sudo node scripts/manage-firewall.mjs --env .env.homolog --remove --confirm
sudo ip address del 192.168.250.10/32 dev lo
```

A linha `192.168.250.10 sagep.homolog.test` pode então ser removida manualmente
de `/etc/hosts`. A remoção dos volumes Docker é deliberadamente omitida para
evitar perda acidental de dados.
