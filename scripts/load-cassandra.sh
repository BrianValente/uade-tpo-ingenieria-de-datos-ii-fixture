#!/bin/sh
set -eu

docker compose up -d --wait cassandra
./scripts/run-cql.sh cassandra/scripts/00_esquema.cql
./scripts/run-cql.sh cassandra/scripts/01-carga_muestra.cql
./scripts/run-cql.sh cassandra/scripts/04_verificacion.cql
