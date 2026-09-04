#!/bin/sh
set -eu

if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  printf 'Uso: %s <archivo.js>\n' "$0" >&2
  exit 2
fi

docker compose exec -T mongodb sh -c '
  mongosh --quiet \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --file /dev/stdin
' < "$1"
