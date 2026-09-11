#!/bin/sh
set -eu

docker compose up -d --wait mongodb
./scripts/run-mongosh.sh queries/05-verify.js

docker compose exec -T mongodb sh -c '
  exec mongoexport --quiet \
    --db "$MONGO_INITDB_DATABASE" \
    --collection equipos \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --type csv \
    --fields _id,codigo,nombre,confederacion,participaFixture2030
' > neo4j/import/equipos.csv

docker compose exec -T mongodb sh -c '
  exec mongoexport --quiet \
    --db "$MONGO_INITDB_DATABASE" \
    --collection jugadores \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --type csv \
    --fields _id,equipoId,equipoCodigo,nombre,apellido,posicion,dorsal
' > neo4j/import/jugadores.csv

docker compose up -d --wait --force-recreate neo4j
./scripts/run-cypher.sh neo4j/queries/00-estructura.cypher
./scripts/run-cypher.sh neo4j/queries/01-carga.cypher
./scripts/run-cypher.sh neo4j/queries/04-verificacion.cypher
