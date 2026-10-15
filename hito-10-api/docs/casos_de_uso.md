# Casos de uso acordados y continuidad

Esta tabla registra el alcance conversado con Brian. Todas las operaciones de
negocio están **pendientes de implementar y probar**. Las rutas son propuestas;
no se incluyen en OpenAPI hasta que existan en el servidor.

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

## Trabajo de diseño con el equipo

Antes de implementar cada caso, completar sus entradas, respuesta de éxito,
ausencia, falla de dependencia y criterio de aceptación conforme a §5.1 del hito.

1. **Cuentas:** definir identificador único, campos de cuenta, política de seed y
   rechazo de credenciales. Comprobar que una recarga no restablezca contraseñas
   o roles de forma silenciosa.
2. **Sesiones:** definir prefijo estable para la API, transporte del identificador,
   consulta y renovación atómicas, TTL, permisos y efecto de logout repetido.
3. **Comentarios:** mantener la partición
   `(partido_id, bucket_minuto, grupo)`. Definir unión y paginación de los 16 grupos,
   clave idempotente, escrituras en dos tablas y recuperación de fallas parciales.
4. **Estadísticas:** preservar intervalo semiabierto, unidades, timestamps UTC y
   significado de `posesion_pct`, `tiros_acumulados` y `pases_intervalo`. Las fechas
   de laboratorio se desplazan al presente para respetar la retención.
5. **IRIS:** definir acceso desde Node.js, preservar IDs y relaciones, ejecutar las
   escrituras mediante métodos de objetos y comprobar `%Status`. Las proyecciones
   SQL existentes rechazan escrituras directas.
6. **Cada adaptador:** configuración sin secretos, límites, conexión, consultas
   parametrizadas, traducción de errores, logs de dependencia y cierre de recursos.
7. **Cada caso:** pruebas reales de éxito, ausencia, validación, falla de fuente y
   límites; repetición cuando haya escritura. Registrar entorno y resultado.

## Fuentes locales

- Enunciado Hito 10, §5.1–§5.13, restricciones y entregables.
- Clase 11: arquitectura por adaptadores, contrato y pruebas.
- `queries/01-read.js`: consultas documentales.
- `neo4j/queries/03-consultas-grafo.cypher`: relaciones y recorridos.
- `cassandra/scripts/00_esquema.cql`: particiones y dos vistas de comentarios.
- `redis/docs/modelo_clave_valor.md`: hashes, claves y TTL.
- `influxdb/docs/modelo_multidimensional.md`: puntos y resúmenes.
- `iris/src/Fixture.Partido.cls`: reglas, relaciones y métodos del objeto.
