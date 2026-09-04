# Decisiones documentales del Fixture 2030

## Objetivo

Implementamos en MongoDB las fichas de equipos y jugadores. Esta eleccion mantiene la decision del Hito 2: MongoDB es el almacenamiento principal de estas fichas porque permite recuperar cada documento de forma directa. Tambien mantiene el criterio del Hito 3: otros motores podran relacionar las mismas entidades mediante identificadores compartidos.

## Modelo

La coleccion `equipos` guarda la identidad deportiva, la confederacion, el origen de la seleccion para el dataset y la fuente externa. La coleccion `jugadores` guarda la ficha deportiva sintetica y una referencia `equipoId` al documento de su equipo.

Guardamos tambien `equipoCodigo` en cada jugador. Este campo permite reconocer la relacion al inspeccionar datos y crear codigos como `ARG-10`. El script de verificacion comprueba que coincide con `equipos.codigo`.

| Decision | Alternativas consideradas | Eleccion | Justificacion | Impacto esperado |
| --- | --- | --- | --- | --- |
| Relacion equipo-jugador | Plantel embebido en `equipos`; colecciones separadas con referencia | Colecciones separadas; `jugadores.equipoId` referencia a `equipos._id` | El plantel tiene 24 fichas que pueden cambiar de forma independiente. La consulta de un jugador no necesita leer ni reescribir todo el equipo. | Documentos pequenos y actualizaciones independientes. La aplicacion debe comprobar la referencia porque MongoDB no ofrece una clave foranea. |
| Validacion documental | Aceptar cualquier forma; validar solo en scripts; usar `$jsonSchema` en MongoDB | Validadores estrictos con tipos, campos requeridos, rangos, patrones y valores permitidos | Los validadores rechazan fichas sin identificador, relacion, posicion u otros datos criticos. | Menos documentos incompletos. Cambiar el modelo exige actualizar el validador. |
| Estrategia de identificadores | `ObjectId`; codigo deportivo; UUID aleatorio; UUID v5 | UUID v5 como `_id` y codigo legible unico | El mismo equipo o jugador recibe siempre el mismo identificador. Este valor se puede compartir luego con Neo4j e IRIS. | La carga puede usar `upsert` sin duplicar entidades. El codigo sigue siendo util para busquedas y lectura humana. |
| Indices principales | Solo `_id`; indices simples; indice compuesto segun la consulta | Unicidad en `codigo` e indice `{ equipoId: 1, posicion: 1, dorsal: 1 }` | `codigo` identifica cada ficha. El indice compuesto responde a la consulta frecuente de un plantel filtrado por posicion y ordenado por dorsal. | Mejora la lectura del plantel. Cada indice agrega almacenamiento y trabajo durante las escrituras. |
| Carga y actualizacion | Inserciones sin control; borrar y recargar; reemplazo con `upsert` | `bulkWrite` con `replaceOne` y `upsert`, en lotes de 500 | La carga se puede repetir y corrige cada documento canonico sin eliminar datos ajenos. | No crea duplicados. Los UUID y codigos unicos protegen la identidad. Los documentos externos al dataset permanecen. |

## Seleccion de equipos y datos

El escenario academico requiere 64 equipos, pero los participantes reales de 2030 todavia no estan definidos. Usamos este conjunto reproducible:

- 48 equipos clasificados al Mundial 2026.
- 4 equipos no clasificados que participaron en el repechaje intercontinental.
- 12 equipos no clasificados que participaron en la segunda ronda de UEFA.

El segundo y tercer punto forman las 16 selecciones adicionales. El criterio toma a todos los participantes no clasificados de esas dos instancias finales. No compara como si fueran equivalentes las etapas internas de confederaciones distintas. Por este motivo, el conjunto es una decision academica y no una clasificacion deportiva global.

Usamos codigos deportivos estables de tres letras. Para Kosovo usamos `KVX`. Los codigos son una convencion del dataset y no se extraen de las dos paginas citadas.

Generamos 24 jugadores por equipo, para un total de 1.536. Sus nombres, fechas de nacimiento, posiciones, alturas y demas atributos son sinteticos. El campo `datosSinteticos` los identifica de forma explicita.

## Consultas que guian los indices

| Consulta | Campos usados | Indice |
| --- | --- | --- |
| Buscar una ficha de equipo por codigo | `equipos.codigo` | `equipos_codigo_unico` |
| Buscar una ficha de jugador por codigo | `jugadores.codigo` | `jugadores_codigo_unico` |
| Mostrar jugadores de un equipo por posicion y dorsal | `equipoId`, `posicion`, `dorsal` | `jugadores_equipo_posicion_dorsal` |

No agregamos un indice para cada campo. El volumen es pequeno y cada indice aumenta el costo de escritura. Los indices elegidos corresponden a operaciones concretas del modulo.

## Integridad

MongoDB valida la forma de cada documento, pero no garantiza que `jugadores.equipoId` exista en `equipos`. Por eso la carga ocurre primero para equipos y despues para jugadores. Finalmente, `queries/05-verify.js` comprueba:

- 64 equipos participantes;
- 1.536 jugadores asociados a esos equipos;
- cero jugadores sin equipo;
- cero diferencias entre `equipoId` y `equipoCodigo`;
- 24 jugadores en cada plantel participante.
- cero documentos que incumplen el validador actual, incluidos documentos creados antes de aplicar `collMod`.

## Vinculo con los hitos previos

- Hito 2: mantenemos MongoDB como fuente principal de fichas de equipos y jugadores.
- Hito 2: aceptamos el costo de controlar referencias fuera de una base relacional.
- Hito 3: los UUID v5 permiten identificar las mismas entidades en otras bases.
- Hito 3: esta prueba local no implementa ni demuestra replicacion entre regiones, disponibilidad o latencia distribuida.

## Limitaciones detectadas

- El conjunto de 64 equipos es academico. No representa participantes oficiales del Mundial 2030.
- Los jugadores son sinteticos. Sirven para validar volumen, consultas e integridad, pero no para analisis deportivo real.
- La integridad entre colecciones depende del orden de carga y del script de verificacion.
- La medicion de indices usa 1.536 jugadores en una instancia local. No demuestra los objetivos de escala del escenario distribuido.

## Fuentes

- Enunciado del Hito 4 y material de la Clase 4.
- Hito 2, matriz de decision del Grupo 5.
- Hito 3, arquitectura distribuida del Grupo 5.
- [2026 FIFA World Cup, revision 1371616839](https://en.wikipedia.org/w/index.php?title=2026_FIFA_World_Cup&oldid=1371616839).
- [2026 FIFA World Cup qualification, revision 1368724802](https://en.wikipedia.org/w/index.php?title=2026_FIFA_World_Cup_qualification&oldid=1368724802).
