# Correcciones e integración de escrituras

## Entorno y ejecución

La ejecución completa se realizó el 16 de octubre de 2026, aproximadamente a las
12:24 UTC, en la misma notebook y proyecto Compose de la evidencia inicial.
Se usaron Node.js 24.22.0, pnpm 10.34.7 y Vitest 5.0.5. Los seis servicios del
proyecto `fixture2030` estaban disponibles en el contexto `desktop-linux`.

Desde `hito-10-api/` se ejecutó:

```bash
pnpm openapi:export
pnpm validate
pnpm test:integration
```

Resultados observados:

```text
Unitarias:
Test Files  11 passed (11)
     Tests  82 passed (82)

Integración:
Test Files  6 passed (6)
     Tests  8 passed (8)
```

También se ejecutaron por separado `pnpm test:writes` y la prueba de timeout
Neo4j durante la corrección. Ambas ejecuciones terminaron aprobadas.

## Resultados por caso

| Caso                       | Resultado observado                                                                                                                                                                                                      | Tipo de prueba                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Autor de comentario        | Otro usuario recibe `409` al usar la clave existente. No aparece una fila en su historial.                                                                                                                               | Cassandra real, solicitudes HTTP mediante `Fastify.inject()`.            |
| Contenido de comentario    | El mismo autor recibe `409` si cambia el contenido para una clave ya usada.                                                                                                                                              | Cassandra real.                                                          |
| Repetición                 | La creación original y su repetición con UUID en mayúsculas devuelven `201`, sin filas adicionales.                                                                                                                      | Cassandra real.                                                          |
| Competencia por una clave  | Dos usuarios crean a la vez: un `201`, un `409`, una fila de historial solo para el ganador.                                                                                                                             | Cassandra real, dos solicitudes concurrentes.                            |
| Paginación con empates     | Cinco filas, cuatro con la misma fecha y tres en el mismo grupo, se recuperan en páginas de una fila sin duplicados ni faltantes.                                                                                        | Cassandra real.                                                          |
| Vista faltante e historial | Se crea únicamente una fila propia por partido, en un grupo histórico distinto del canónico. Repetir por la API crea la vista por usuario con siete likes y dos respuestas, sin copiar la fila por partido a otro grupo. | Estado parcial controlado en Cassandra real.                             |
| Cursores inválidos         | UUID de 36 guiones, fecha inválida y campos extra producen `400`, sin llamar al adaptador de sesiones ni al de comentarios.                                                                                              | Regresión unitaria con dependencias simuladas.                           |
| Orden UUID                 | La unión respeta versión y timestamp v1 del comparador UUID de Cassandra, además de UUID v4 y datos anteriores.                                                                                                          | Regresión unitaria, basada en `UUIDType.compareCustom()` de Cassandra 5. |
| Permisos IRIS              | El usuario recibe `403` en cambios de estado y eventos; el estado almacenado no cambia.                                                                                                                                  | IRIS real.                                                               |
| Transiciones IRIS          | Programado a Finalizado: `409`; Programado a EnJuego: `200`; repetir EnJuego: `409`.                                                                                                                                     | IRIS real, lectura posterior del objeto.                                 |
| Evento IRIS                | Crear evento: `201`; repetir el código: `409`; queda un solo evento persistido.                                                                                                                                          | IRIS real.                                                               |
| Cierre IRIS                | EnJuego a Finalizado: `200`; repetir o registrar un evento después: `409`; estado final y evento se conservan.                                                                                                           | IRIS real.                                                               |
| Límite Neo4j               | Una lectura `apoc.util.sleep(5000)` con timeout de transacción de 100 ms es rechazada por terminación de transacción.                                                                                                    | Driver y servidor Neo4j reales, sin modificar el grafo.                  |
| Configuración Neo4j        | Ambas consultas del adaptador envían timeout de transacción y el driver recibe límites de conexión y adquisición del pool.                                                                                               | Regresión unitaria con driver simulado.                                  |

La reparación de Cassandra representa una vista faltante mediante preparación
controlada de datos nuevos. No se cortó la red entre dos escrituras ni se afirma
atomicidad entre particiones. Los `IF NOT EXISTS` protegen cada fila por separado.

El cálculo de grupo vuelve a usar UUID entero módulo 16, como el Hito 6. Las
lecturas puntuales de los 16 grupos permiten conservar filas del prototipo anterior
sin migrarlas, borrarlas o crear una copia en el grupo nuevo.

## HTTP real y acceso local

Se inició el lanzador de laboratorio en un puerto HTTP local libre. Se verificaron
`200` para `/health`, login, sesión, equipo, ficha compuesta de partido, comentarios,
estadísticas e información de objetos IRIS. Se usaron `fetch()` y las bases reales,
no `Fastify.inject()`, para esta comprobación adicional del proceso HTTP.

Al enviar `SIGTERM`, el servidor terminó con código cero y el lanzador confirmó
la eliminación de su cuenta temporal IRIS. No se modificó la contraseña de
`_SYSTEM`. Las credenciales temporales estuvieron solo en memoria y en el entorno
del proceso hijo; no se imprimieron ni se guardaron en el repositorio.

La misma preparación se reproduce mediante:

```bash
pnpm dev:lab
```

El lanzador usa las conexiones existentes de Compose y el token local de InfluxDB.
Si no se proporciona una cuenta IRIS, prepara una temporal con rol `%All` para el
laboratorio. Ese acceso requiere el terminal administrativo del contenedor local;
no es una configuración de producción. Al detener normalmente el lanzador, la
cuenta se elimina. Si el proceso es terminado de forma abrupta y no puede limpiar,
la cuenta tiene vencimiento al día siguiente.

## Datos y límites

Los nuevos comentarios y agregados usan identificadores `F2030-TEST-*` y códigos
de evento nuevos. Se conservan para inspección. La limpieza automática se limita
a las sesiones propias y a la cuenta temporal marcada por el lanzador. No se
borraron colecciones, índices, volúmenes o datos de negocio existentes.

Las ocho pruebas de integración incluyen dos simulaciones TCP sin respuesta para
MongoDB y Redis; esas dos no se presentan como consultas a bases reales. Las otras
seis usan los motores reales. La lectura estadística puede devolver un conjunto
vacío válido para el intervalo de laboratorio solicitado.

El timeout de transacción Neo4j lo aplica el servidor, por lo que 100 ms no es una
medición ni una garantía de latencia HTTP. No se midieron capacidad, percentiles
de latencia ni comportamiento a escala distribuida. La prueba no demuestra una
migración de filas históricas ni transacciones entre las dos vistas Cassandra.
