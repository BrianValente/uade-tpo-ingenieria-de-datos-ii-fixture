# Hito 5 - Modulo de grafos del Fixture 2030

**Grupo 5**

- Brian Valente
- Tomas Bravo
- Julian Curi

## 1. Problema relacional

En el Hito 4 guardamos las fichas de equipos y jugadores en MongoDB. Esos documentos permiten recuperar una ficha por identificador, pero no expresan de forma directa los recorridos entre un jugador, su equipo, los partidos programados, las sedes y los eventos deportivos.

Elegimos orientar el grafo a estas preguntas:

- ¿En que partidos y sedes puede participar un jugador por pertenecer a su equipo?
- ¿Que eventos de un equipo ocurrieron en un partido y contra que rival?
- ¿Como se conecta un jugador con otro jugador rival mediante el partido que comparten?

Estas preguntas atraviesan varias entidades. Neo4j permite expresarlas como patrones de relaciones sin reemplazar las fichas documentales.

## 2. Modelo propuesto

Usamos cinco etiquetas: `Equipo`, `Jugador`, `Partido`, `Sede` y `Evento`. Las relaciones son `PERTENECE_A`, `DISPUTA`, `SE_JUEGA_EN`, `OCURRE_EN` e `INVOLUCRA`.

El archivo [modelo-grafo.md](modelo-grafo.md) contiene el diagrama, las propiedades, las direcciones y las cardinalidades completas.

El recorrido principal es:

```text
Jugador -> Equipo -> Partido -> Sede
                    ^
Evento -------------|
Evento -> Jugador
```

## 3. Decisiones de diseno

### Identidad compartida

Conservamos los UUID v5 de equipos y jugadores usados como `_id` en MongoDB. En Neo4j se guardan como la propiedad `id`. De esta forma, ambos modulos reconocen a la misma entidad sin integrar las bases mediante una API.

### Alcance de las fichas

MongoDB conserva la ficha completa. En Neo4j copiamos solo identidad y propiedades necesarias para consultar o mostrar el recorrido. Esta decision evita duplicar sin control atributos que no participan en el grafo.

### Eventos como nodos

Elegimos `Evento` como nodo, no como una propiedad del partido. Un evento necesita identidad, tipo, minuto y relaciones propias con el partido y el jugador protagonista. El costo es crear mas nodos, pero el beneficio es poder recorrer y ampliar sus conexiones.

### Participacion como relacion

La participacion de un equipo se modela con `DISPUTA`. La propiedad `condicion` indica si actua como local o visitante. Una alternativa era usar dos tipos distintos de relacion. Elegimos un solo tipo porque la pregunta principal trata a ambos como participantes y usa la condicion solo al presentar el fixture.

### Continuidad

- Hito 2: mantenemos Neo4j para partidos, eventos y relaciones deportivas.
- Hito 3: mantenemos al partido como centro de sus eventos y usamos identificadores compartidos entre motores.
- Hito 4: MongoDB conserva las fichas principales y sus UUID v5.

La prueba local no implementa replicacion ni demuestra disponibilidad o latencia distribuida.

## 4. Datos cargados

El subgrafo contiene:

- 64 equipos del conjunto academico del Hito 4;
- 1.536 jugadores sinteticos, 24 por equipo;
- 32 partidos sinteticos, con una participacion por cada equipo;
- 8 sedes academicas de America del Sur, Europa y Africa;
- 64 eventos sinteticos, dos por partido.

Los equipos y jugadores se exportan desde MongoDB para conservar sus UUID. Los partidos, sedes y eventos provienen de archivos CSV versionados en `neo4j/import/`. No representan el fixture oficial ni hechos deportivos reales.

La carga usa `MERGE` sobre identificadores unicos para nodos y sobre extremos identificados para relaciones. Una segunda ejecucion actualiza el mismo subgrafo y no agrega duplicados.

## 5. Consultas

`02-crud.cypher` crea, recupera, modifica y elimina un nodo `EventoDemo`. La eliminacion queda limitada por etiqueta e identificador y no afecta los datos canonicos.

`03-consultas-grafo.cypher` incluye:

1. Un recorrido de tres relaciones desde un jugador hasta la sede de su partido.
2. Un recorrido desde un equipo hasta sus eventos, protagonistas, partidos y rivales.
3. La programacion filtrada por rango de fechas y ordenada por fecha.
4. Los goles ordenados por partido y minuto.
5. El camino mas corto entre dos jugadores rivales.

Las primeras dos consultas cumplen el requisito de recorrer dos o mas relaciones consecutivas.

## 6. Integridad y rendimiento

Las cinco restricciones de unicidad evitan identificadores repetidos. Los indices de jugador por equipo y dorsal, partido por fecha y evento por tipo responden a filtros usados durante la carga y las consultas.

`04-verificacion.cypher` comprueba:

- conteos por etiqueta y tipo de relacion;
- ausencia de jugadores sin equipo;
- exactamente dos equipos y una sede por partido;
- exactamente un partido y un protagonista por evento;
- restricciones existentes;
- indices en estado `ONLINE`.

La ultima sentencia termina con error si alguno de estos controles o conteos no coincide con el resultado esperado.

Esta validacion comprueba coherencia funcional sobre un volumen academico. No es una prueba de rendimiento a escala distribuida.

## 7. Analisis relacional

La consulta elegida calcula el camino mas corto entre el jugador con dorsal 9 de Argentina y el jugador con dorsal 4 de Brasil. El resultado observado contiene cuatro relaciones:

```text
Jugador ARG -> Equipo ARG -> Partido F2030-001 <- Equipo BRA <- Jugador BRA
```

El camino muestra por que ambos jugadores quedan conectados dentro del fixture: pertenecen a equipos que disputan el mismo partido. En una coleccion aislada habria que recuperar y combinar por separado jugadores, equipos y partido. En el grafo, la conexion forma parte del modelo y se puede devolver como un recorrido visual.

## Fuentes

- Enunciado del Hito 5: Modulo de Grafos del Fixture 2030.
- Material de la Clase 5: Neo4j y Cypher.
- Entregas de los Hitos 2, 3 y 4 del Grupo 5.
- [Manual de Cypher](https://neo4j.com/docs/cypher-manual/current/).
- [Neo4j Operations Manual](https://neo4j.com/docs/operations-manual/current/docker/).
