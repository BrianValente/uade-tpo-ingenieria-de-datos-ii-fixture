#!/bin/sh
set -eu

EVIDENCIA="cassandra/docs/evidencia/funcional-$(date -u +%Y%m%dT%H%M%SZ).txt"

{
  printf 'Fecha UTC: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'Contexto Docker: %s\n' "$(docker context show)"
  printf 'CPU disponibles: %s\n' "$(docker info --format '{{.NCPU}}')"
  printf 'Memoria Docker: %s bytes\n' "$(docker info --format '{{.MemTotal}}')"
  docker compose exec -T cassandra nodetool status
  ./scripts/run-cql.sh cassandra/scripts/00_esquema.cql
  ./scripts/run-cql.sh cassandra/scripts/01-carga_muestra.cql
  ./scripts/run-cql.sh cassandra/scripts/02_crud.cql
  ./scripts/run-cql.sh cassandra/scripts/03_consultas.cql
  ./scripts/run-cql.sh cassandra/scripts/04_verificacion.cql
} > "$EVIDENCIA" 2>&1

printf 'Evidencia guardada en %s\n' "$EVIDENCIA"
