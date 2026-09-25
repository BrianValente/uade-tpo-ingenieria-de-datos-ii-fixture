.PHONY: help up mongodb neo4j cassandra status down volumes logs-mongodb logs-neo4j logs-cassandra load-neo4j verify-neo4j queries-neo4j load-cassandra verify-cassandra queries-cassandra benchmark-cassandra benchmark-cassandra-hotspot

SELECTED_ENGINES := $(filter mongodb neo4j cassandra,$(MAKECMDGOALS))
UP_ENGINES := $(if $(SELECTED_ENGINES),$(SELECTED_ENGINES),mongodb neo4j cassandra)
DOWN_VOLUMES := $(if $(filter volumes,$(MAKECMDGOALS)),--volumes,)

help:
	@printf '%s\n' \
		'make up                   Inicia MongoDB, Neo4j y Cassandra' \
		'make up mongodb            Inicia solo MongoDB' \
		'make up neo4j             Inicia solo Neo4j' \
		'make up cassandra         Inicia solo Cassandra' \
		'make status               Muestra el estado de los servicios' \
		'make logs-mongodb         Sigue los logs de MongoDB' \
		'make logs-neo4j           Sigue los logs de Neo4j' \
		'make logs-cassandra       Sigue los logs de Cassandra' \
		'make load-neo4j           Carga y verifica el subgrafo' \
		'make verify-neo4j         Verifica conteos e integridad' \
		'make queries-neo4j        Ejecuta las consultas del grafo' \
		'make load-cassandra       Crea el esquema y carga la muestra' \
		'make verify-cassandra     Verifica el modulo de comentarios' \
		'make queries-cassandra    Ejecuta las consultas de comentarios' \
		'make benchmark-cassandra  Genera y carga mas de 1M de comentarios' \
		'make benchmark-cassandra-hotspot Prueba un partido con 10.000 comentarios/s' \
		'make down                 Detiene todos los servicios' \
		'make down neo4j           Detiene solo Neo4j' \
		'make down neo4j volumes   Detiene Neo4j y borra sus datos'

up:
	docker compose up -d $(UP_ENGINES)

mongodb neo4j cassandra:
	$(if $(filter up down,$(MAKECMDGOALS)),@:,$(error Use 'make up $@' o 'make down $@'))

status:
	docker compose ps

down:
	docker compose down $(DOWN_VOLUMES) $(SELECTED_ENGINES)

volumes:
	$(if $(filter down,$(MAKECMDGOALS)),@:,$(error Use 'make down volumes'))

logs-mongodb:
	docker compose logs --follow mongodb

logs-neo4j:
	docker compose logs --follow neo4j

logs-cassandra:
	docker compose logs --follow cassandra

load-neo4j:
	./scripts/load-neo4j.sh

verify-neo4j:
	./scripts/run-cypher.sh neo4j/queries/04-verificacion.cypher

queries-neo4j:
	./scripts/run-cypher.sh neo4j/queries/03-consultas-grafo.cypher

load-cassandra:
	./scripts/load-cassandra.sh

verify-cassandra:
	./scripts/run-cql.sh cassandra/scripts/04_verificacion.cql

queries-cassandra:
	./scripts/run-cql.sh cassandra/scripts/03_consultas.cql

benchmark-cassandra:
	./cassandra/scripts/carga_o_prueba.sh

benchmark-cassandra-hotspot:
	./cassandra/scripts/prueba_partido_caliente.sh
