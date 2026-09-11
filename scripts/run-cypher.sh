#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Uso: %s <archivo.cypher>\n' "$0" >&2
  exit 2
fi

if [ ! -f "$1" ]; then
  printf 'No existe el archivo Cypher: %s\n' "$1" >&2
  exit 2
fi

docker compose exec -T neo4j sh -c \
  'exec cypher-shell --username neo4j --password "${NEO4J_AUTH#*/}"' < "$1"
