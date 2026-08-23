# Instalação segura do SAGEP por OM

Este procedimento prepara uma instalação nova e isolada. Cada OM recebe sua
própria autoridade certificadora; a chave privada da raiz permanece no volume
`sagep_pki` e nunca é montada no Caddy ou incluída nos kits dos clientes.

## Requisitos e premissas

- Servidor Ubuntu, Debian ou Linux Mint com APT e systemd.
- IP IPv4 privado reservado no DHCP.
- Registro A no DNS interno apontando o nome do SAGEP para esse IP.
- Acesso aos repositórios e registries necessários para clonar e construir as
  imagens durante a instalação inicial.
- Backend em um diretório sem espaços, preferencialmente
  `/opt/sagep/sagep-backend`; o frontend ficará no diretório irmão `sagep-web`.

O instalador não publica o SAGEP na Internet, não altera SSH, não redefine a
política global do firewall e não expõe PostgreSQL ou pgAdmin na rede.

## 1. Preparar o host

Primeiro confira o servidor sem fazer alterações:

```bash
bash scripts/bootstrap-host.sh --check
```

Para instalar os pacotes ausentes a partir dos repositórios APT já confiáveis:

```bash
sudo bash scripts/bootstrap-host.sh --install
```

São instalados Git, OpenSSL, Node.js para os utilitários administrativos,
iptables, Docker Engine e Docker Compose v2. O usuário não é incluído no grupo
`docker`, pois esse grupo equivale a acesso administrativo ao host.

## 2. Criar a configuração protegida

Execute o assistente e informe o FQDN interno, IP privado reservado, CIDRs
autorizados e e-mail do pgAdmin:

```bash
npm run deployment:install
```

Ele cria `.env` com permissão `0600`, senhas aleatórias para PostgreSQL e
pgAdmin, segredos JWT distintos e uma chave temporária de setup. Nenhum desses
valores é exibido no terminal. Um `.env` existente nunca é substituído; links
simbólicos e arquivos legíveis por grupo ou outros usuários bloqueiam o deploy.

Para configuração repetível sem respostas sigilosas no arquivo de entrada:

```bash
cp deploy/installer/answers.example answers.om
chmod 600 answers.om
node scripts/install-sagep.mjs --answers answers.om --configure-only
```

O arquivo de respostas contém apenas DNS, IP, CIDRs e e-mail; todos os segredos
continuam sendo gerados localmente.

## 3. Preparar DNS e validar

Crie o registro A interno e confirme que ele resolve para `SAGEP_BIND_IP`.
Depois execute:

```bash
node scripts/check-deployment-preflight.mjs .env
```

Bloqueios de DNS, endereço público, CIDR inválido, Docker, Compose, OpenSSL ou
armazenamento impedem a próxima fase.

## 4. Implantar

O comando abaixo possui confirmação literal. Ele clona o frontend somente se o
diretório irmão ainda não existir, valida o Compose, constrói as imagens, cria a
CA e o certificado inicial nos volumes, aplica o firewall antes da publicação e
sobe os containers:

```bash
sudo /usr/bin/env node scripts/install-sagep.mjs \
  --deploy --clone-frontend --confirm-deploy IMPLANTAR
```

Se já existir material completo de PKI, ele é validado e preservado. Material
parcial, chave divergente ou certificado emitido para outro DNS bloqueiam a
implantação sem sobrescrever a autoridade.

Ao final, somente o certificado raiz público é copiado para
`deployment-output/sagep-om-root-ca.crt`. Instale-o primeiro na estação
administrativa e confira a impressão digital SHA-256 exibida pelo instalador por
um canal confiável. A chave privada da CA não sai do volume protegido.

A política por CIDR é reaplicada a cada inicialização do Docker pela unidade
`sagep-firewall.service`. Ela protege somente `SAGEP_BIND_IP:80/443` e não altera
as portas 22, 3000, 5050 ou 5432.

## 5. Concluir o setup

Depois de confiar na raiz pública, abra `https://<SAGEP_HOSTNAME>/setup`, confira
a impressão digital por um canal administrativo confiável e use a chave
`SAGEP_SETUP_TOKEN` armazenada no `.env` para criar o primeiro administrador e
cadastrar a OM. Após entrar no painel, gere os kits completos de confiança para
Windows 11, Linux Mint e Ubuntu.

Depois, remova definitivamente a chave temporária:

```bash
sudo /usr/bin/env node scripts/install-sagep.mjs \
  --finalize --confirm-finalize REMOVER-CHAVE
```

O comando altera apenas `SAGEP_SETUP_TOKEN`, preserva os demais valores e recria
somente a API. O painel de prontidão deve então indicar que a chave temporária
foi removida.

## Comportamento em falhas

- Falha antes do deploy não publica portas.
- Falha depois do firewall mantém 80/443 fechadas para redes não autorizadas.
- O instalador não remove volumes nem executa `docker compose down -v`.
- `.env`, CA e chaves existentes não são substituídos automaticamente.
- Uma nova tentativa é idempotente quando DNS, `.env`, volumes e certificados
  permanecem coerentes.
