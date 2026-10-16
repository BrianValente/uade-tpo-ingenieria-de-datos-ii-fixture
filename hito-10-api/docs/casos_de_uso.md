# Casos de uso acordados y continuidad

Esta tabla registra el alcance conversado con Brian. Las operaciones están
implementadas y aparecen en OpenAPI. Las pruebas unitarias usan adaptadores
simulados. La integración real cubre lecturas de los seis motores y escrituras
de comentarios, estados y eventos. Sus límites se registran en la evidencia.

| Caso                         | Consumidor               | Operación                        | Fuente y datos existentes                                                 |
| ---------------------------- | ------------------------ | -------------------------------- | ------------------------------------------------------------------------- |
| Iniciar sesión               | Usuario de laboratorio   | `POST /auth/login`               | MongoDB para cuentas sembradas con hashes Argon2id; Redis para la sesión. |
| Consultar sesión             | Usuario autenticado      | `GET /auth/session`              | Hash Redis y TTL de 1800 segundos por inactividad.                        |
| Cerrar sesión                | Usuario autenticado      | `DELETE /auth/session`           | Invalidación de la sesión actual en Redis.                                |
| Consultar selección          | Pantalla de selección    | `GET /equipos/:codigo`           | `equipos` de MongoDB, búsqueda por código.                                |
| Consultar plantel            | Pantalla de selección    | `GET /equipos/:codigo/jugadores` | `jugadores` de MongoDB, filtro por `equipoId` y paginación.               |
| Consultar ficha del partido  | Pantalla de partido      | `GET /partidos/:id`              | Relaciones de Neo4j y fichas documentales de MongoDB.                     |
| Consultar eventos del grafo  | Pantalla de partido      | `GET /partidos/:id/eventos`      | `Evento -[:OCURRE_EN]-> Partido` de Neo4j.                                |
| Consultar comentarios        | Lector del feed          | `GET /partidos/:id/comentarios`  | Cassandra, partido, minuto y 16 grupos.                                   |
| Publicar comentario          | Usuario autenticado      | `POST /partidos/:id/comentarios` | Dos tablas Cassandra: por partido y por usuario.                          |
| Consultar estadísticas       | Pantalla de estadísticas | `GET /partidos/:id/estadisticas` | InfluxDB 3 Core, `estadisticas_equipo` y ventanas acotadas.               |
| Consultar detalle de objetos | Pantalla de detalle      | `GET /partidos/:codigo/detalle`  | `Fixture.Partido`, árbitro, técnicos y eventos en IRIS `USER`.            |
| Cambiar estado               | Administrador            | `PATCH /partidos/:codigo/estado` | Método `CambiarEstado()` del objeto IRIS y persistencia validada.         |
| Registrar evento de objetos  | Administrador            | `POST /partidos/:codigo/eventos` | Método `RegistrarEvento()` del objeto IRIS y persistencia validada.       |

## Entradas, resultados y criterio de éxito

Las filas se corresponden con el mapa anterior. Los atributos completos y sus
ejemplos ilustrativos están en OpenAPI. El criterio de éxito incluye el contenido
y el efecto de la operación, no solo recibir un código HTTP.

Salvo el login, las operaciones requieren un Bearer vigente: falta o expiración
producen `401`, y un formato incorrecto produce `400`. Las escrituras IRIS además
requieren rol `admin`; otro rol produce `403`. Los parámetros o cuerpos inválidos
producen `400`, sin consultar la fuente del caso de uso.

| Caso y tipo                                     | Entradas necesarias                                                                         | Respuesta esperada                                                                       | Ausencia de datos                                                                                                                      | Dependencia inaccesible                                              | Criterio de éxito                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Iniciar sesión — creación                       | `username` y `password` en JSON.                                                            | `200`: token opaco, duración y usuario público.                                          | Cuenta ausente o contraseña incorrecta: `401`, sin distinguir ambas causas.                                                            | MongoDB o Redis: `503`, sin entregar token.                          | Argon2 verifica la contraseña y Redis confirma la sesión con TTL antes de entregar el token.                                                                      |
| Consultar sesión — lectura                      | Bearer recibido en el login.                                                                | `200`: usuario, timestamps UTC y TTL restante.                                           | Clave ausente o expirada: `401`.                                                                                                       | Redis: `503`.                                                        | La clave existe con TTL positivo y la consulta no renueva el vencimiento.                                                                                         |
| Cerrar sesión — invalidación                    | Bearer de la sesión que se cierra.                                                          | `204`, sin cuerpo.                                                                       | Clave ya ausente o expirada: también `204`.                                                                                            | Redis: `503`; no se confirma el cierre.                              | Se elimina solo la sesión indicada. Repetir devuelve `204` sin afectar otros dispositivos.                                                                        |
| Consultar selección — lectura                   | Código de tres letras, por ejemplo `ARG`.                                                   | `200`: ficha documental proyectada.                                                      | Equipo inexistente: `404`.                                                                                                             | MongoDB: `503`.                                                      | El código de la ficha coincide con el solicitado y no se exponen campos internos innecesarios.                                                                    |
| Consultar plantel — lectura                     | Código, `page` y `limit` de 1 a 50.                                                         | `200`: `items`, `total`, `page` y `limit`.                                               | Equipo ausente: `404`. Equipo existente sin jugadores o página sin filas: `200` con `items: []`.                                       | MongoDB: `503`.                                                      | Los jugadores pertenecen al equipo y la cantidad de filas no supera el límite solicitado.                                                                         |
| Consultar ficha del partido — lectura compuesta | ID del partido, por ejemplo `F2030-001`.                                                    | `200`: partido, sede y fichas documentales local/visitante.                              | Partido ausente en Neo4j: `404`. Ficha de equipo faltante en MongoDB: `503`, sin respuesta parcial.                                    | Neo4j o MongoDB: `503`.                                              | Los códigos local/visitante del grafo coinciden con las dos fichas obtenidas de MongoDB.                                                                          |
| Consultar eventos del grafo — lectura           | ID de partido y límite de 1 a 100.                                                          | `200`: eventos conectados y límite.                                                      | Partido ausente: `404`. Partido válido sin eventos: `200` con `items: []`.                                                             | Neo4j: `503`.                                                        | Se devuelven solo eventos del partido, ordenados y dentro del límite, mediante Cypher parametrizado.                                                              |
| Consultar comentarios — lectura                 | Partido, `minute` UTC, límite de 1 a 100 y cursor opcional.                                 | `200`: `items` y `nextCursor`.                                                           | Minuto sin filas: `200`, `items: []` y cursor nulo. Cassandra no determina si ese partido existe en otro motor.                        | Cassandra: `503`, nunca una lista vacía usada para ocultar la falla. | Se consultan las particiones del minuto y la página conserva orden, autor e identificadores, sin saltos ni duplicados por empates.                                |
| Publicar comentario — creación o repetición     | Partido, `commentId`, `createdAt`, `content`; autor tomado de la sesión.                    | `201`: confirmación de la creación. Una colisión de identidad o contenido produce `409`. | Una clave nueva crea las vistas. Una vista faltante se repara mediante el reintento original; no se verifica el partido en otro motor. | Cassandra: `503`, con posible primera reserva persistida.            | Ambas vistas conservan el autor y el contenido. Repetir la creación original no duplica filas ni reinicia contadores. No se promete atomicidad entre particiones. |
| Consultar estadísticas — lectura agregada       | Partido, `start` y `end` UTC; intervalo positivo de hasta 24 horas.                         | `200`: intervalo y agregados por equipo, hasta 64 filas.                                 | Intervalo sin puntos: `200` con `teams: []`; no equivale a confirmar que el partido existe.                                            | InfluxDB: `503`.                                                     | Se respeta `[start, end)`, las dimensiones y las agregaciones documentadas; nunca se devuelve un volumen ilimitado.                                               |
| Consultar detalle de objetos — lectura          | Código de partido IRIS.                                                                     | `200`: estado, fecha, árbitro, técnicos y eventos del agregado.                          | Objeto inexistente: `404`.                                                                                                             | IRIS: `503`.                                                         | La navegación preserva código, estado y relaciones del objeto persistido.                                                                                         |
| Cambiar estado — actualización                  | Código y JSON `state`, con sesión `admin`.                                                  | `200`: agregado actualizado. Transición inválida o repetida: `409`.                      | Partido ausente: `404`.                                                                                                                | IRIS: `503`.                                                         | `CambiarEstado()` y `%Save()` terminan correctamente y una lectura posterior confirma el estado.                                                                  |
| Registrar evento de objetos — creación          | Código de partido; JSON con `code`, `type`, `minute` de 0 a 130 y `detail`; sesión `admin`. | `201`: agregado con el evento. Código repetido o partido finalizado: `409`.              | Partido ausente: `404`.                                                                                                                | IRIS: `503`.                                                         | `RegistrarEvento()` y `%Save()` persisten un solo evento. El rechazo no agrega otro evento al volver a abrir el objeto.                                           |

Los errores inesperados usan `500` seguro. Los contratos de repetición, cambios
parciales y límites de cada adaptador se amplían en [integración](integracion.md).
Las pruebas unitarias e integraciones enlazadas desde el README comprueban estos
criterios con casos simulados y reales, identificados por separado.

## Decisiones acordadas

- Usar seed de usuarios de prueba con contraseñas recibidas por configuración
  local y hashes Argon2id. La seed debe poder repetirse sin duplicar usuarios.
- Usar sesiones Redis y roles de usuario y administrador. La consulta de sesión
  y la renovación de actividad deben distinguirse en el contrato.
- Combinar Neo4j y MongoDB para la ficha del partido. Responder un error de
  dependencia si no podemos completar la ficha con ambas fuentes.
- Mantener por separado eventos de Neo4j y objetos IRIS. Los módulos actuales no
  sincronizan sus datos. Registrar un evento en IRIS no actualiza el grafo.
- Generar OpenAPI desde las rutas y esquemas, con el backend de baloncesto como
  referencia de organización.

## Contratos implementados

1. **Cuentas:** implementadas en `usuarios_api` con UUID, índice único de username,
   rol y hash Argon2id. La seed usa `$setOnInsert` y conserva cuentas existentes.
   La ejecución real de seed y login está registrada en la evidencia.
2. **Sesiones:** implementadas como hashes bajo `fixture2030:h10:<alcance>`, con
   token Bearer opaco, digest en Redis y TTL de 1800 s. `GET /auth/session` no
   renueva. Las rutas de negocio renuevan actividad y TTL solo si la clave sigue vigente.
3. **Comentarios:** conservan la partición `(partido_id, bucket_minuto, grupo)`.
   La API consulta los 16 grupos, une por fecha e ID y entrega un cursor opaco.
   `commentId` y `createdAt` forman claves repetibles. Si falla la segunda vista,
   el consumidor repite la misma solicitud para reparar la vista faltante. La
   reserva condicional conserva autor y contenido; una colisión produce `409`.
4. **Estadísticas:** preservar intervalo semiabierto, unidades, timestamps UTC y
   significado de `posesion_pct`, `tiros_acumulados` y `pases_intervalo`. Las fechas
   de laboratorio se desplazan al presente para respetar la retención.
5. **IRIS:** el SDK nativo abre `Fixture.Partido`, navega relaciones y ejecuta
   `CambiarEstado()`, `RegistrarEvento()` y `%Save()`. Cada `%Status` se comprueba.
   Las proyecciones SQL no reciben escrituras.
6. **Cada adaptador:** configuración sin secretos, límites, conexión, consultas
   parametrizadas, traducción de errores, logs de dependencia y cierre de recursos.
7. **Cada caso:** las pruebas unitarias cubren éxito, ausencia, validación, falla
   simulada, límites, repetición y permisos. Las pruebas reales verifican las dos
   vistas de comentarios, competencia por una clave, reparación y reglas IRIS.

## Fuentes locales

- Enunciado Hito 10, §5.1–§5.13, restricciones y entregables.
- Clase 11: arquitectura por adaptadores, contrato y pruebas.
- `queries/01-read.js`: consultas documentales.
- `neo4j/queries/03-consultas-grafo.cypher`: relaciones y recorridos.
- `cassandra/scripts/00_esquema.cql`: particiones y dos vistas de comentarios.
- `redis/docs/modelo_clave_valor.md`: hashes, claves y TTL.
- `influxdb/docs/modelo_multidimensional.md`: puntos y resúmenes.
- `iris/src/Fixture.Partido.cls`: reglas, relaciones y métodos del objeto.
