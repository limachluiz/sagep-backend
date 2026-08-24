#!/bin/sh
set -eu

backup_directory="${BACKUP_DIRECTORY:-/app/backups}"
evidence_directory="${EVIDENCE_DIRECTORY:-/app/evidence-files}"
pki_directory="${DEPLOYMENT_PKI_DIRECTORY:-/app/pki}"
tls_directory="${DEPLOYMENT_TLS_DIRECTORY:-/app/tls}"

if [ "$backup_directory" != "/app/backups" ]; then
  echo "BACKUP_DIRECTORY deve ser /app/backups no container" >&2
  exit 1
fi

if [ "$evidence_directory" != "/app/evidence-files" ]; then
  echo "EVIDENCE_DIRECTORY deve ser /app/evidence-files no container" >&2
  exit 1
fi

if [ "$tls_directory" != "/app/tls" ]; then
  echo "DEPLOYMENT_TLS_DIRECTORY deve ser /app/tls no container" >&2
  exit 1
fi

if [ "$pki_directory" != "/app/pki" ]; then
  echo "DEPLOYMENT_PKI_DIRECTORY deve ser /app/pki no container" >&2
  exit 1
fi

install -d -o sagep -g sagep -m 0700 "$backup_directory"
chown -R sagep:sagep /app/backups
find /app/backups -type d -exec chmod 0700 {} +
find /app/backups -type f -exec chmod 0600 {} +

install -d -o sagep -g sagep -m 0700 "$evidence_directory"
chown -R sagep:sagep /app/evidence-files
find /app/evidence-files -type d -exec chmod 0700 {} +
find /app/evidence-files -type f -exec chmod 0600 {} +

install -d -o sagep -g sagep -m 0700 "$pki_directory"
chown -R sagep:sagep /app/pki
find /app/pki -type d -exec chmod 0700 {} +
find /app/pki -type f -name '*.key' -exec chmod 0600 {} +
find /app/pki -type f ! -name '*.key' -exec chmod 0644 {} +

install -d -o sagep -g sagep -m 0700 "$tls_directory"
chown -R sagep:sagep /app/tls
find /app/tls -type d -exec chmod 0700 {} +
find /app/tls -type f -name '*.key' -exec chmod 0600 {} +
find /app/tls -type f ! -name '*.key' -exec chmod 0644 {} +

exec gosu sagep "$@"
