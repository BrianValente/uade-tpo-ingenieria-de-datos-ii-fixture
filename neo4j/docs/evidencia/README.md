# Evidencia tecnica del Hito 5

## Entorno

- Fecha de ejecucion: 4 de septiembre de 2026.
- Entorno: Docker Desktop en macOS.
- Imagen declarada: `neo4j:latest`.
- Version observada dentro del contenedor: Neo4j 2026.07.1.
- Estado observado: MongoDB y Neo4j en estado `healthy`.

## Carga e idempotencia

Se ejecuto `make load-neo4j` dos veces consecutivas. Ambas ejecuciones informaron los mismos resultados:

| Etiqueta | Cantidad | Cumple |
| --- | ---: | --- |
| `Equipo` | 64 | `TRUE` |
| `Jugador` | 1.536 | `TRUE` |
| `Partido` | 32 | `TRUE` |
| `Sede` | 8 | `TRUE` |
| `Evento` | 64 | `TRUE` |

| Relacion | Cantidad | Cumple |
| --- | ---: | --- |
| `PERTENECE_A` | 1.536 | `TRUE` |
| `DISPUTA` | 64 | `TRUE` |
| `SE_JUEGA_EN` | 32 | `TRUE` |
| `OCURRE_EN` | 64 | `TRUE` |
| `INVOLUCRA` | 64 | `TRUE` |

La segunda carga no modifico los conteos. Esto demuestra idempotencia para el dataset canonico del hito.

## Controles de coherencia

`make verify-neo4j` produjo:

- 0 jugadores sin equipo;
- 0 partidos con una cantidad distinta de dos equipos o una sede;
- 0 eventos con una cantidad distinta de un partido o un protagonista;
- 5 restricciones de unicidad;
- todos los indices en estado `ONLINE`.

## CRUD

Se ejecuto `02-crud.cypher` mediante `cypher-shell`. La salida mostro estas operaciones sobre `DEMO-EVENTO-001`:

1. Creacion o recuperacion idempotente en el partido `F2030-001`.
2. Lectura con el protagonista `Jugador Ficticio ARG 09`.
3. Actualizacion del minuto 88 al minuto 89.
4. Eliminacion precisa del nodo de demostracion.

Una verificacion posterior mantuvo los conteos canonicos sin cambios.

## Consultas de grafo

Resultados observados relevantes:

- El recorrido `Jugador ARG 09 -> Argentina -> F2030-001 -> Estadio Monumental` contiene tres relaciones consecutivas.
- El evento `EVT-001-01` conecta al protagonista de Argentina con el partido `F2030-001` y el rival Brasil.
- La consulta de programacion recupero 12 partidos entre el 13 y el 16 de junio de 2030, ordenados por fecha e identificador.
- La consulta de goles recupero 32 eventos, uno por partido de la muestra.
- El camino mas corto entre `Jugador Ficticio ARG 09` y `Jugador Ficticio BRA 04` contiene cuatro relaciones y atraviesa Argentina, `F2030-001` y Brasil.

## Visualizacion

La captura [neo4j-browser-f2030-001.png](neo4j-browser-f2030-001.png) muestra el subgrafo del partido `F2030-001`, sus dos equipos, cuatro jugadores seleccionados, dos eventos y la sede. Neo4j Browser informo 10 nodos y 9 relaciones para este resultado. La consulta usada fue:

```cypher
MATCH path = (j:Jugador)-[:PERTENECE_A]->(e:Equipo)-[:DISPUTA]->(p:Partido {id: 'F2030-001'})-[:SE_JUEGA_EN]->(s:Sede)
WHERE j.dorsal IN [4, 9]
OPTIONAL MATCH eventPath = (v:Evento)-[:OCURRE_EN]->(p)
RETURN path, eventPath;
```

## Limitaciones

- La evidencia corresponde a una instancia local y un volumen academico.
- Los partidos, sedes y eventos son sinteticos.
- La ejecucion no demuestra los objetivos distribuidos de latencia o disponibilidad.
