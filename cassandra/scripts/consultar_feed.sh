#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  printf 'Uso: %s <partido_id> <bucket_minuto ISO-8601>\n' "$0" >&2
  exit 2
fi

partido_id="$1"
bucket_minuto="$2"
grupo=0

case "$partido_id" in
  ''|*[!A-Za-z0-9_-]*)
    printf 'El partido_id contiene caracteres invalidos\n' >&2
    exit 2
    ;;
esac

case "$bucket_minuto" in
  ''|*[!0-9TtZz:+.-]*)
    printf 'El bucket_minuto contiene caracteres invalidos\n' >&2
    exit 2
    ;;
esac

while [ "$grupo" -lt 16 ]; do
  docker compose exec -T cassandra cqlsh -e "
    SELECT creado_en, comentario_id, usuario_nombre, contenido, estado, likes
    FROM fixture2030_comentarios.comentarios_por_partido
    WHERE partido_id = '$partido_id'
      AND bucket_minuto = '$bucket_minuto'
      AND grupo = $grupo
    LIMIT 20;"
  grupo=$((grupo + 1))
done
