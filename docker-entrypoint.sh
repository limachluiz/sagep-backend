#!/bin/sh
set -eu

backup_directory="${BACKUP_DIRECTORY:-/app/backups}"

if [ "$backup_directory" != "/app/backups" ]; then
  echo "BACKUP_DIRECTORY deve ser /app/backups no container" >&2
  exit 1
fi

install -d -o sagep -g sagep -m 0700 "$backup_directory"
chown -R sagep:sagep /app/backups
find /app/backups -type d -exec chmod 0700 {} +
find /app/backups -type f -exec chmod 0600 {} +

exec gosu sagep "$@"
