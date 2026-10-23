# Matriz de Conectividad y Diagnóstico por Capas

**Asignatura:** Ingeniería de Datos II  
**Hito:** 11 — Evaluación de Conectividad a los Productos del Fixture 2030  
**Fecha:** Octubre 2026  

---

## 1. Definición de Estados del Diagnóstico

Para garantizar honestidad experimental (RNF17) y una clasificación rigurosa (RNF9, 5.6):
- **`UP` (OK):** La prueba configurada terminó exitosamente en la capa evaluada. Existe conectividad, protocolo válido, contexto y respuesta funcional.
- **`DOWN`:** Se intentó la conexión y falló por rechazo de puerto (`ECONNREFUSED`), timeout de red (`ETIMEDOUT`), fallo de credenciales (`Autenticación`), falta de permisos (`Autorización`) o error irrecuperable.
- **`DEGRADED`:** El transporte TCP está activo, pero falla una capa superior (ej. keyspace o colección no inicializados, o solo uno de los listeners responde).
- **`NOT_CONFIGURED`:** El módulo o dependencia carece de credenciales o parámetros requeridos en el archivo `.env` del entorno evaluado.
- **`SKIP`:** Prueba no ejecutada debido a la ausencia deliberada de herramientas, prerrequisitos o etapas previas fallidas (no equivale a producto caído).
- **`UNKNOWN`:** No se dispone de información suficiente para dictaminar el estado.

---

## 2. Matriz de Especificación y Referencia de Pruebas por Producto y Capas

*(Nota: La siguiente tabla documenta la especificación técnica de las pruebas por capa y los estados esperados de referencia con servicios activos frente a contenedores detenidos. Para la matriz consolidada generada automáticamente a partir de la corrida observada en este host, véase [`docs/evidencia/reporte_conectividad_inicial.md`](./evidencia/reporte_conectividad_inicial.md)).*

| Dependencia | Capa Evaluada | Prueba Ejecutada | Estado Esperado (Activo / Detenido) | Latencia Ref. | Diagnóstico Técnico y Criterio de Clasificación |
|:---|:---|:---|:---:|:---:|:---|
| **MongoDB 7.0** | Configuración | Lectura de `MONGO_HOST`, `MONGO_PORT`, `MONGO_DATABASE` | **UP** | <1ms | Variables definidas y puerto validado sin secretos expuestos. |
| | Resolución DNS | Verificación de alcanzabilidad de `127.0.0.1` | **UP** | <1ms | Loopback local resuelto correctamente. |
| | Transporte TCP | Socket TCP a `127.0.0.1:27017` con timeout de 2000ms | **UP** / **DOWN** | ~1ms / - | `UP` con contenedor activo; `ECONNREFUSED` con contenedor detenido. |
| | Handshake Protocolo | `client.db(authSource).command({ ping: 1 })` | **UP** / **DOWN** | ~2ms | Wire protocol validado; responde `{ ok: 1 }`. |
| | Autenticación / Autorización | SCRAM-SHA-256 (`code: 18` -> `Autenticación: DOWN`; `code: 13` -> `Autorización: DOWN`) | **UP** / **DOWN** | ~15ms | Distingue fallo de credenciales (`18`) de falta de permisos (`13`) tras handshake exitoso. |
| | Contexto Lógico | Verificación de base `fixture2030` y colección `equipos` vía `listCollections` | **UP** / **DEGRADED** | ~2ms | `UP` si existe la colección `equipos`; `DEGRADED` si la base responde pero no fue sembrada. |
| | Operación Mínima | `findOne({ codigo: 'ARG' })` | **UP** / **SKIP** | ~2ms | Lectura no destructiva (`SKIP` si el contexto o la autorización fallaron previamente). |
| | Cadena API HTTP | `GET /equipos/ARG`, `GET /equipos/ZZZ` y `GET /equipos/ARG/jugadores` | **UP** / **503** | ~8ms | Status 200 OK / 404 válido con sesión; 503 `DEPENDENCY_UNAVAILABLE` si Mongo cae. |
| **Redis** | Configuración | `REDIS_HOST`, `REDIS_PORT`, `REDIS_DATABASE` | **UP** | <1ms | Parámetros cargados y validados en memoria. |
| | Transporte TCP | Socket TCP a `127.0.0.1:6379` | **UP** / **DOWN** | ~1ms / - | Listener RESP activo o `ECONNREFUSED`. |
| | Handshake Protocolo | Comando RESP `PING` | **UP** / **DOWN** | ~1ms | Responde `PONG`; el cierre usa `client.destroy()` para no bloquearse si el socket cuelga. |
| | Contexto Lógico | Selección de base indexada `#0` | **UP** | <1ms | Base lógica de sesiones seleccionada. |
| | Operación Mínima | `GET fixture2030:test:nonexistent_probe_key` (`null`) y `TTL` (`-2`) | **UP** | ~1ms | Operación de solo lectura no destructiva: clave ausente devuelve `null` y TTL `-2` sin escrituras. |
| | Cadena API HTTP | `POST /auth/login` y verificación en `GET /auth/session` | **UP** / **503** | ~12ms | Genera token opaco y valida renovación de TTL en rutas autenticadas. |
| **Neo4j** | Configuración | `NEO4J_HOST`, `NEO4J_BOLT_PORT`, `NEO4J_HTTP_PORT` | **UP** | <1ms | Configuración de puertos Bolt (7687) y HTTP (7474) validada. |
| | Transporte TCP (Bolt/HTTP) | Sockets TCP a `127.0.0.1:7687` y `127.0.0.1:7474` | **UP** / **DEGRADED** / **DOWN** | ~1ms / - | `DEGRADED` si solo uno de los listeners (Bolt o HTTP) responde. |
| | Handshake / Autenticación | `driver.verifyConnectivity()` con `NEO4J_USERNAME` y `NEO4J_PASSWORD` | **UP** / **NOT_CONF** | ~18ms | `NOT_CONFIGURED` si falta `NEO4J_PASSWORD` en el entorno. |
| | Contexto Lógico | Sesión explícita sobre base `neo4j` (`RETURN 1 AS ping`) | **UP** | ~2ms | Base de datos de grafos seleccionada. |
| | Operación Mínima | Cypher `MATCH (p:Partido {id: $id}) RETURN p.id AS id, p.fase AS fase LIMIT 1` | **UP** | ~4ms | Consulta parametrizada sobre etiqueta `:Partido` y propiedad `id` real del modelo. |
| | Cadena API HTTP | `GET /partidos/F2030-001` y `GET /partidos/F2030-001/eventos?limit=10` | **UP** / **503** | ~15ms | Ficha de partido coordinada con MongoDB y eventos de grafo (con login previo automático). |
| **Cassandra** | Configuración | `CASSANDRA_HOST`, `CASSANDRA_PORT`, `CASSANDRA_KEYSPACE` | **UP** | <1ms | Datacenter `datacenter1` y keyspace `fixture2030_comentarios` configurados. |
| | Transporte TCP | Socket TCP a `127.0.0.1:9042` | **UP** / **DOWN** | ~1ms / - | Listener nativo CQL activo. |
| | Handshake Protocolo | `client.connect()` | **UP** / **DOWN** | ~20ms | Negociación binaria CQL y descubrimiento de topología. |
| | Contexto / Autorización | `client.metadata.getTable('fixture2030_comentarios', 'comentarios_por_partido')` | **UP** / **DEGRADED** / **DOWN** | ~3ms | Carga asíncrona de metadatos (`0x2100` -> `Autorización: DOWN`; `null` -> `Contexto: DEGRADED`). |
| | Operación Mínima | Consulta preparada por `(partido_id, bucket_minuto, grupo)` con `LIMIT 1` | **UP** / **SKIP** | ~3ms | Lectura CQL con clave de partición completa sin `ALLOW FILTERING`. |
| | Cadena API HTTP | `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | **UP** / **503** | ~9ms | Consulta paginada por minuto sin full scan. |
| **InfluxDB 3** | Configuración | `INFLUXDB_URL`, `INFLUXDB_DATABASE`, `INFLUXDB_TOKEN` | **UP** | <1ms | URL HTTP `http://127.0.0.1:8181` configurada. |
| | Transporte TCP | Socket TCP a `127.0.0.1:8181` | **UP** / **DOWN** | ~1ms / - | Listener HTTP activo. |
| | Handshake Protocolo | `GET /health` | **UP** / **DOWN** | ~3ms | Verifica salud HTTP del motor de series temporales. |
| | Autenticación / Autorización | `POST /api/v3/query_sql` con `Authorization: Bearer <token>` | **UP** / **NOT_CONF** / **DOWN** | ~5ms | `NOT_CONFIGURED` sin token; `401` -> `Autenticación: DOWN`; `403` -> `Autorización: DOWN`. |
| | Operación Mínima | Consulta SQL agregada sobre `estadisticas_equipo` en rango temporal acotado | **UP** | ~6ms | Comprobación de ventana temporal válida sin mutar datos. |
| | Cadena API HTTP | `GET /partidos/F2030-001/estadisticas?start=...&end=...` | **UP** / **503** | ~10ms | Resumen estadístico por partido e intervalo. |
| **InterSystems IRIS** | Configuración | `IRIS_HOST`, `IRIS_PORT`, `IRIS_WEB_PORT`, `IRIS_NAMESPACE` | **UP** | <1ms | Namespace `USER` y puertos 1972 (SuperServer) / 52773 (Web) validados. |
| | Transporte TCP (SS / Web) | Sockets TCP a `127.0.0.1:1972` y `127.0.0.1:52773` | **UP** / **DEGRADED** / **DOWN** | ~1ms / - | Evalúa ambos listeners y reporta `DEGRADED` si solo uno responde. |
| | Handshake / Autenticación | `createConnection` hacia SuperServer 1972 | **UP** / **NOT_CONF** / **SKIP** | ~15ms | `NOT_CONFIGURED` sin credenciales; `SKIP` si el addon nativo no existe en la plataforma. |
| | Contexto y `%SQLCODE` | `%Prepare` (`%Status === 1`) + `%Execute` y `%Next` sobre `Fixture.Partido` | **UP** / **DEGRADED** | ~3ms | Valida `rows.getNumber('%SQLCODE')` (`0` o `100`) y `rows.getString('%Message')` antes y después de `%Next`. |
| | Operación Mínima | Verificación no destructiva de `F2030-IRIS-0011` | **UP** / **SKIP** | ~4ms | Distingue entidad encontrada o ausencia controlada (`100`) de error SQL (`< 0` -> `SKIP`). |
| | Cadena API HTTP | `GET /partidos/F2030-IRIS-0011/detalle` | **UP** / **503** | ~12ms | Lectura de entidad persistente y eventos asociados en IRIS. |

---

## 3. Referencia de Estados en Entorno Observado vs. Entorno Docker Activo

- **Estado real observado en este host (sin contenedores Docker activos):** Documentado y generado automáticamente por código en [`docs/evidencia/reporte_conectividad_inicial.md`](./evidencia/reporte_conectividad_inicial.md) (`MongoDB`: `DOWN`, `Redis`: `DOWN`, `Neo4j`: `NOT_CONFIGURED`, `Cassandra`: `DOWN`, `InfluxDB 3`: `DOWN`, `InterSystems IRIS`: `DOWN`, `API Fastify Integrada (In-Process)`: `UP (OK)`).
- **Simulación híbrida in-process de falla y retorno en la API:** Documentada y generada automáticamente en [`docs/evidencia/ciclo_falla_recuperacion.md`](./evidencia/ciclo_falla_recuperacion.md) y explicada en [`docs/diagnostico_de_fallas.md`](./diagnostico_de_fallas.md).
