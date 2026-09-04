.PHONY: help up mongodb neo4j status down volumes logs-mongodb logs-neo4j

SELECTED_ENGINES := $(filter mongodb neo4j,$(MAKECMDGOALS))
UP_ENGINES := $(if $(SELECTED_ENGINES),$(SELECTED_ENGINES),mongodb neo4j)
DOWN_VOLUMES := $(if $(filter volumes,$(MAKECMDGOALS)),--volumes,)

help:
	@printf '%s\n' \
		'make up                   Inicia MongoDB y Neo4j' \
		'make up mongodb            Inicia solo MongoDB' \
		'make up neo4j             Inicia solo Neo4j' \
		'make status               Muestra el estado de los servicios' \
		'make logs-mongodb         Sigue los logs de MongoDB' \
		'make logs-neo4j           Sigue los logs de Neo4j' \
		'make down                 Detiene todos los servicios' \
		'make down neo4j           Detiene solo Neo4j' \
		'make down neo4j volumes   Detiene Neo4j y borra sus datos'

up:
	docker compose up -d $(UP_ENGINES)

mongodb neo4j:
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
