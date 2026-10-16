# Casos de uso acordados y continuidad

Esta tabla registra el alcance conversado con Brian. Las operaciones están
implementadas y aparecen en OpenAPI. Las pruebas unitarias usan adaptadores
simulados. La evidencia real existente de autenticación cubre MongoDB y Redis.

| Caso                         | Consumidor               | Operación propuesta              | Fuente y datos existentes                                                 |
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
   `comentarioId` y `creadoEn` forman claves repetibles. Si falla la segunda vista,
   el consumidor repite la misma solicitud para completar ambas mediante upsert.
4. **Estadísticas:** preservar intervalo semiabierto, unidades, timestamps UTC y
   significado de `posesion_pct`, `tiros_acumulados` y `pases_intervalo`. Las fechas
   de laboratorio se desplazan al presente para respetar la retención.
5. **IRIS:** el SDK nativo abre `Fixture.Partido`, navega relaciones y ejecuta
   `CambiarEstado()`, `RegistrarEvento()` y `%Save()`. Cada `%Status` se comprueba.
   Las proyecciones SQL no reciben escrituras.
6. **Cada adaptador:** configuración sin secretos, límites, conexión, consultas
   parametrizadas, traducción de errores, logs de dependencia y cierre de recursos.
7. **Cada caso:** las pruebas unitarias cubren éxito, ausencia, validación, falla
   simulada, límites, repetición y permisos. No sustituyen una ejecución real.

## Fuentes locales

- Enunciado Hito 10, §5.1–§5.13, restricciones y entregables.
- Clase 11: arquitectura por adaptadores, contrato y pruebas.
- `queries/01-read.js`: consultas documentales.
- `neo4j/queries/03-consultas-grafo.cypher`: relaciones y recorridos.
- `cassandra/scripts/00_esquema.cql`: particiones y dos vistas de comentarios.
- `redis/docs/modelo_clave_valor.md`: hashes, claves y TTL.
- `influxdb/docs/modelo_multidimensional.md`: puntos y resúmenes.
- `iris/src/Fixture.Partido.cls`: reglas, relaciones y métodos del objeto.
