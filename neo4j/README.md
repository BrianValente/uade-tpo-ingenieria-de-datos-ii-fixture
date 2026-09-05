# Modulo de grafos del Fixture 2030

Este modulo implementa el Hito 5 en Neo4j. Reutiliza los UUID v5 de los 64 equipos y los 1.536 jugadores del modulo MongoDB. Agrega una muestra academica de 32 partidos, 8 sedes y 64 eventos deportivos.

Los datos no representan el fixture oficial del Mundial 2030. Sirven para validar el modelo, la carga y los recorridos requeridos por la catedra.

## Preparacion

Desde la raiz del repositorio:

```bash
cp .env.example .env
make up mongodb neo4j
./scripts/load-data.sh
```

La ultima instruccion prepara el modulo documental del Hito 4. En un volumen que ya tenga los 64 equipos y los 1.536 jugadores alcanza con comprobarlo mediante:

```bash
./scripts/run-mongosh.sh queries/05-verify.js
```

## Carga

```bash
make load-neo4j
```

El proceso realiza estas acciones:

1. Comprueba la integridad de los datos del Hito 4.
2. Exporta equipos y jugadores a `neo4j/import/`.
3. Crea restricciones e indices.
4. Carga nodos y relaciones mediante `MERGE`.
5. Muestra los conteos y controles de integridad.

Los archivos `equipos.csv` y `jugadores.csv` se generan localmente y no se versionan. Los archivos de sedes, partidos y eventos si forman parte del repositorio.

## Comprobacion de idempotencia

Ejecutar dos veces:

```bash
make load-neo4j
make load-neo4j
```

Ambas ejecuciones deben informar los mismos conteos y mostrar `TRUE` en todos los controles.

## Consultas

```bash
./scripts/run-cypher.sh neo4j/queries/02-crud.cypher
make queries-neo4j
make verify-neo4j
```

- `00-estructura.cypher` crea restricciones e indices.
- `01-carga.cypher` carga el subgrafo de forma idempotente.
- `02-crud.cypher` demuestra creacion, recuperacion, actualizacion y eliminacion sobre un evento temporal.
- `03-consultas-grafo.cypher` contiene patrones, filtros, ordenamiento, recorridos y el analisis de conectividad.
- `04-verificacion.cypher` comprueba conteos, relaciones, referencias, restricciones e indices.

## Conexion

- Neo4j Browser: `http://localhost:7474`
- Bolt: `neo4j://localhost:7687`
- Usuario: `neo4j`
- Contrasena: valor local de `NEO4J_PASSWORD`

## Documentacion

- [Modelo del grafo](docs/modelo-grafo.md)
- [Analisis y decisiones](docs/analisis.md)
- [Evidencia tecnica](docs/evidencia/README.md)
