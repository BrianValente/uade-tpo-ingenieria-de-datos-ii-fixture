#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Uso: %s <archivo.cql>\n' "$0" >&2
  exit 2
fi

if [ ! -f "$1" ]; then
  printf 'No existe el archivo CQL: %s\n' "$1" >&2
  exit 2
fi

docker compose exec -T cassandra cqlsh < "$1"
