#!/usr/bin/env bash
set -euo pipefail

mode="${1:---check}"

fail() {
  echo "[BLOQUEIO] $*" >&2
  exit 1
}

command_ready() {
  command -v "$1" >/dev/null 2>&1
}

check_host() {
  local failures=0
  for command in git openssl node npm iptables docker; do
    if command_ready "$command"; then
      echo "[OK] $command disponível."
    else
      echo "[BLOQUEIO] $command não encontrado."
      failures=$((failures + 1))
    fi
  done

  if command_ready node; then
    local node_major
    node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
    if [ "$node_major" -ge 18 ]; then
      echo "[OK] Node.js ${node_major} atende aos utilitários administrativos."
    else
      echo "[BLOQUEIO] Node.js 18 ou superior é necessário no host."
      failures=$((failures + 1))
    fi
  fi

  if command_ready docker && docker compose version >/dev/null 2>&1; then
    echo "[OK] Docker Compose v2 disponível."
  else
    echo "[BLOQUEIO] Docker Compose v2 não está disponível."
    failures=$((failures + 1))
  fi

  [ "$failures" -eq 0 ] || return 1
}

install_host() {
  [ "$(id -u)" -eq 0 ] || fail "Execute a instalação de pré-requisitos com sudo."
  command_ready apt-get || fail "Instalação automática disponível somente para Ubuntu, Debian e Linux Mint com APT."
  [ -r /etc/os-release ] || fail "Não foi possível identificar o sistema operacional."

  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian|linuxmint) ;;
    *) fail "Distribuição não suportada automaticamente: ${ID:-desconhecida}." ;;
  esac

  export DEBIAN_FRONTEND=noninteractive
  apt-get update

  local compose_package=""
  for candidate in docker-compose-v2 docker-compose-plugin; do
    if apt-cache show "$candidate" >/dev/null 2>&1; then
      compose_package="$candidate"
      break
    fi
  done
  [ -n "$compose_package" ] || fail "O repositório APT não oferece Docker Compose v2; configure um repositório corporativo confiável."

  apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    iptables \
    nodejs \
    npm \
    openssl \
    docker.io \
    "$compose_package"

  if command_ready systemctl; then
    systemctl enable --now docker.service
  fi
  check_host || fail "Os pacotes foram instalados, mas ainda existem pré-requisitos bloqueantes."
  echo "Pré-requisitos do host instalados. Nenhuma regra de firewall ou SSH foi alterada."
}

case "$mode" in
  --check) check_host ;;
  --install) install_host ;;
  *) fail "Uso: sudo bash scripts/bootstrap-host.sh --install | bash scripts/bootstrap-host.sh --check" ;;
esac
