#!/bin/sh
set -eu

CANTIDAD="${CANTIDAD_FOCAL:-1000000}"
DURACION="${DURACION_FOCAL:-100}"
MARCA="$(date -u +%Y%m%dT%H%M%SZ)"
SALIDA="cassandra/data/generated/focal"
EVIDENCIA="cassandra/docs/evidencia/focal-$MARCA.txt"
METADATA="cassandra/docs/evidencia/metadata-focal-$MARCA.json"
ERRORES="cassandra/data/generated/errores-focal-$MARCA.csv"

python3 cassandra/scripts/generar_carga.py \
  --cantidad "$CANTIDAD" \
  --partidos 1 \
  --usuarios 100000 \
  --duracion-segundos "$DURACION" \
  --partido-id F2030-HOT \
  --salida "$SALIDA"
cp "$SALIDA/metadata.json" "$METADATA"

docker compose up -d --wait cassandra
./scripts/run-cql.sh cassandra/scripts/00_esquema.cql

{
  printf 'Fecha UTC: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'Escenario: %s comentarios en %s segundos para F2030-HOT\n' "$CANTIDAD" "$DURACION"
  printf 'Tasa modelada: %s comentarios/s\n' "$((CANTIDAD / DURACION))"
  printf 'CPU disponibles: %s\n' "$(docker info --format '{{.NCPU}}')"
  printf 'Memoria Docker: %s bytes\n' "$(docker info --format '{{.MemTotal}}')"
  docker compose exec -T cassandra cqlsh -e 'SHOW VERSION'
  docker compose exec -T cassandra nodetool status

  inicio=$(date +%s)
  docker compose exec -T cassandra cqlsh -e "COPY fixture2030_comentarios.comentarios_por_partido (partido_id, bucket_minuto, grupo, creado_en, comentario_id, usuario_id, usuario_nombre, contenido, estado, likes, respuestas) FROM '/workspace/$SALIDA/comentarios_por_partido.csv' WITH HEADER = TRUE AND NUMPROCESSES = 4 AND CHUNKSIZE = 5000 AND MAXPARSEERRORS = 0 AND MAXINSERTERRORS = 0 AND ERRFILE = '/workspace/$ERRORES';"
  fin=$(date +%s)
  duracion_real=$((fin - inicio))
  [ "$duracion_real" -gt 0 ] || duracion_real=1
  printf 'Duracion de carga: %s s\n' "$duracion_real"
  printf 'Escrituras solicitadas por segundo: %s\n' "$((CANTIDAD / duracion_real))"
} > "$EVIDENCIA" 2>&1

if [ -s "$ERRORES" ]; then
  printf 'La carga produjo filas rechazadas. Consulte %s\n' "$ERRORES" >&2
  exit 1
fi

printf 'Evidencia guardada en %s\n' "$EVIDENCIA"
printf 'Metadata guardada en %s\n' "$METADATA"
