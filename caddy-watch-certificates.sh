#!/bin/sh
set -u

config_file="/etc/caddy/Caddyfile"
certificate_file="/etc/caddy/pki/server.crt"
private_key_file="/etc/caddy/pki/server.key"
check_seconds="${CERTIFICATE_RELOAD_CHECK_SECONDS:-15}"
caddy_pid=""
watcher_pid=""

certificate_checksum() {
  sha256sum "$certificate_file" "$private_key_file" 2>/dev/null | sha256sum | cut -d ' ' -f 1
}

cleanup() {
  [ -z "$watcher_pid" ] || kill "$watcher_pid" 2>/dev/null || true
  [ -z "$caddy_pid" ] || kill -TERM "$caddy_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT
caddy run --config "$config_file" --adapter caddyfile &
caddy_pid="$!"

(
  previous="$(certificate_checksum)"
  while kill -0 "$caddy_pid" 2>/dev/null; do
    sleep "$check_seconds"
    current="$(certificate_checksum)"
    if [ "$current" != "$previous" ]; then
      if caddy reload --config "$config_file" --adapter caddyfile; then
        previous="$current"
        echo "Certificado TLS recarregado automaticamente pelo Caddy"
      else
        echo "Falha ao recarregar certificado TLS; nova tentativa será realizada" >&2
      fi
    fi
  done
) &
watcher_pid="$!"

wait "$caddy_pid"
status="$?"
trap - EXIT
cleanup
wait "$watcher_pid" 2>/dev/null || true
exit "$status"
