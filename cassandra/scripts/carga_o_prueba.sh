#!/bin/sh
set -eu

CANTIDAD="${CANTIDAD:-1000016}"
MARCA="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCIA="cassandra/docs/evidencia/carga-$MARCA.txt"
ERROR_PARTIDO="cassandra/data/generated/errores-partido-$MARCA.csv"
ERROR_USUARIO="cassandra/data/generated/errores-usuario-$MARCA.csv"

python3 cassandra/scripts/generar_carga.py --cantidad "$CANTIDAD"
docker compose up -d --wait cassandra
./scripts/run-cql.sh cassandra/scripts/00_esquema.cql

{
  printf 'Fecha UTC: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'Contexto Docker: %s\n' "$(docker context show)"
  printf 'Version Docker: %s\n' "$(docker version --format '{{.Server.Version}}')"
  printf 'CPU disponibles: %s\n' "$(docker info --format '{{.NCPU}}')"
  printf 'Memoria Docker: %s bytes\n' "$(docker info --format '{{.MemTotal}}')"
  printf 'Sistema: %s\n' "$(uname -a)"
  printf 'Comentarios generados: %s\n' "$CANTIDAD"
  printf 'Filas fisicas esperadas: %s\n' "$((CANTIDAD * 2))"
  docker compose exec -T cassandra cqlsh -e 'SHOW VERSION'
  docker compose exec -T cassandra nodetool status

  inicio=$(date +%s)
  docker compose exec -T cassandra cqlsh -e "COPY fixture2030_comentarios.comentarios_por_partido (partido_id, bucket_minuto, grupo, creado_en, comentario_id, usuario_id, usuario_nombre, contenido, estado, likes, respuestas) FROM '/workspace/cassandra/data/generated/comentarios_por_partido.csv' WITH HEADER = TRUE AND NUMPROCESSES = 4 AND CHUNKSIZE = 5000 AND MAXPARSEERRORS = 0 AND MAXINSERTERRORS = 0 AND ERRFILE = '/workspace/$ERROR_PARTIDO';"
  docker compose exec -T cassandra cqlsh -e "COPY fixture2030_comentarios.comentarios_por_usuario (usuario_id, bucket_mes, creado_en, comentario_id, partido_id, usuario_nombre, contenido, estado, likes, respuestas) FROM '/workspace/cassandra/data/generated/comentarios_por_usuario.csv' WITH HEADER = TRUE AND NUMPROCESSES = 4 AND CHUNKSIZE = 5000 AND MAXPARSEERRORS = 0 AND MAXINSERTERRORS = 0 AND ERRFILE = '/workspace/$ERROR_USUARIO';"

  fin=$(date +%s)
  duracion=$((fin - inicio))
  [ "$duracion" -gt 0 ] || duracion=1
  printf 'Duracion total de las dos cargas: %s s\n' "$duracion"
  printf 'Comentarios solicitados por segundo: %s\n' "$((CANTIDAD / duracion))"
  printf 'Escrituras fisicas solicitadas por segundo: %s\n' "$((CANTIDAD * 2 / duracion))"
  printf 'Limitacion: COPY incluye conversion CSV, cliente local y dos vistas por comentario.\n'
} > "$EVIDENCIA" 2>&1

if [ -s "$ERROR_PARTIDO" ] || [ -s "$ERROR_USUARIO" ]; then
  printf 'La carga produjo filas rechazadas. Consulte %s y %s\n' "$ERROR_PARTIDO" "$ERROR_USUARIO" >&2
  exit 1
fi

printf 'Evidencia guardada en %s\n' "$EVIDENCIA"
