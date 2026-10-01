#!/usr/bin/env bash
# Ejecuta comandos Redis desde la raiz del repositorio.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $# -ne 1 || ! -f "$1" ]]; then
  printf 'Uso: bash scripts/run-redis.sh archivo.redis\n' >&2
  exit 2
fi

# Omitir comentarios y lineas vacias antes de enviar comandos al cliente.
# Cada linea contiene un comando completo; no usar Lua de varias lineas aqui.
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    ''|\#*) continue ;;
  esac
  printf '%s\n' "$line"
done < "$1" | docker compose --project-directory "$ROOT" exec -T redis redis-cli -e --raw
