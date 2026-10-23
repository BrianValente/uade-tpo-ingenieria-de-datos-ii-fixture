# Matriz de Conectividad y Diagnóstico por Capas

**Asignatura:** Ingeniería de Datos II  
**Hito:** 11 — Evaluación de Conectividad a los Productos del Fixture 2030  
**Fecha:** Octubre 2026  

---

## 1. Definición de Estados del Diagnóstico

Para garantizar honestidad experimental (RNF17) y una clasificación rigurosa (RNF9, 5.6):
- **`UP` (OK):** La prueba configurada terminó exitosamente en la capa evaluada. Existe conectividad, protocolo válido, contexto y respuesta funcional.
- **`DOWN`:** Se intentó la conexión y falló por rechazo de puerto (`ECONNREFUSED`), timeout de red (`ETIMEDOUT`) o error irrecuperable.
- **`DEGRADED`:** El transporte TCP está activo, pero falla una capa superior (ej. keyspace no inicializado, credencial errónea o endpoint degradado).
- **`NOT_CONFIGURED`:** El módulo o dependencia carece de credenciales o parámetros en el archivo `.env` del entorno evaluado.
- **`SKIP`:** Prueba no ejecutada debido a la ausencia deliberada de herramientas o configuración opcional en el laboratorio (no equivale a producto caído).
- **`UNKNOWN`:** No se dispone de información suficiente para dictaminar el estado.

---

## 2. Matriz de Conectividad Completa por Producto y Capas

| Dependencia | Capa Evaluada | Prueba Ejecutada | Estado | Latencia | Diagnóstico Técnico y Evidencia |
|:---|:---|:---|:---:|:---:|:---|
| **MongoDB 7.0** | Configuración | Lectura de `MONGO_HOST`, `MONGO_PORT`, `MONGO_DATABASE` | **UP** | <1ms | Variables definidas y validadas mediante esquema Zod sin secretos expuestos. |
| | Resolución DNS | Verificación de alcanzabilidad de `127.0.0.1` | **UP** | <1ms | Loopback local resuelto correctamente. |
| | Transporte TCP | Socket TCP a `127.0.0.1:27017` con timeout de 2000ms | **UP** / **DOWN** | ~1ms / - | `UP` con contenedor activo; `ECONNREFUSED` con contenedor detenido. |
| | Handshake Protocolo | `client.db("admin").command({ ping: 1 })` | **UP** / **DOWN** | ~2ms | Wire protocol validado; responde `{ ok: 1 }`. |
| | Autenticación | Login SCRAM-SHA-256 en authSource `admin` | **UP** / **DOWN** | ~15ms | Credenciales validadas contra base administrativa. |
| | Contexto Lógico | Selección de base `fixture2030` y colección `equipos` | **UP** | ~1ms | Espacio de nombres documental localizado. |
| | Operación Mínima | `findOne({ codigo: 'ARG' })` y `findOne({ codigo: 'ZZZ' })` | **UP** | ~2ms | Lectura no destructiva. Retorna equipo 'ARG' y `null` para 'ZZZ' (ausencia válida). |
| | Cadena API HTTP | `GET /equipos/ARG` y `GET /equipos/ARG/jugadores` | **UP** | ~8ms | Status 200 OK; correlación con header `x-request-id`. |
| **Redis** | Configuración | `REDIS_HOST`, `REDIS_PORT`, `REDIS_DATABASE` | **UP** | <1ms | Parámetros cargados en memoria. |
| | Transporte TCP | Socket TCP a `127.0.0.1:6379` | **UP** / **DOWN** | ~1ms / - | Listener RESP activo. |
| | Handshake Protocolo | Comando RESP `PING` | **UP** | <1ms | Responde `PONG`. Protocolo en memoria verificado. |
| | Contexto Lógico | Selección de base indexada `#0` y namespace `api:session` | **UP** | <1ms | Estructura de claves verificada. |
| | Operación Mínima | `GET probe_key` (null) y `TTL probe_key` (-2) | **UP** | ~1ms | Operación de solo lectura no destructiva. Clave ausente devuelve null sin alterar el estado de Redis. |
| | Cadena API HTTP | `POST /auth/login` y verificación en `GET /auth/perfil` | **UP** | ~12ms | Genera token opaco y valida renovación de TTL en rutas de negocio. |
| **Neo4j** | Configuración | `NEO4J_HOST`, `NEO4J_BOLT_PORT`, `NEO4J_HTTP_PORT` | **UP** | <1ms | Configuración de puertos Bolt y HTTP leída correctamente. |
| | Transporte TCP (Bolt) | Socket TCP a `127.0.0.1:7687` | **UP** / **DOWN** | ~1ms / - | Listener Bolt activo. |
| | Transporte TCP (HTTP) | Socket TCP a `127.0.0.1:7474` | **UP** / **DOWN** | ~1ms / - | Portal Browser HTTP alcanzable. |
| | Handshake Protocolo | `driver.verifyConnectivity()` | **UP** | ~10ms | Negociación de versión de protocolo Bolt completada. |
| | Autenticación | Basic Auth con `NEO4J_USERNAME` y `NEO4J_PASSWORD` | **UP** / **NOT_CONF** | ~18ms | `NOT_CONFIGURED` si falta contraseña en .env; `UP` con credencial válida. |
| | Contexto Lógico | Sesión explícita sobre base `neo4j` | **UP** | ~2ms | Base de datos de grafos seleccionada. |
| | Operación Mínima | Cypher `RETURN 1 AS ping` y `MATCH (p:Partido {id: $id}) RETURN p.id, p.fase LIMIT 1` | **UP** | ~4ms | Consulta acotada de lectura Cypher parametrizada sobre la entidad del modelo. |
| | Cadena API HTTP | `GET /partidos/F2030-001` y `GET /partidos/F2030-001/eventos` | **UP** | ~15ms | Ficha de partido coordinada con MongoDB y eventos de grafo. |
| **Cassandra** | Configuración | `CASSANDRA_HOST`, `CASSANDRA_PORT`, `CASSANDRA_KEYSPACE` | **UP** | <1ms | Datacenter `datacenter1` y keyspace configurados. |
| | Transporte TCP | Socket TCP a `127.0.0.1:9042` | **UP** / **DOWN** | ~1ms / - | Listener nativo CQL activo. |
| | Handshake Protocolo | `client.connect()` | **UP** | ~20ms | Negociación binaria CQL y descubrimiento de topología de nodos. |
| | Contexto Lógico | Metadatos de keyspace `fixture2030_comentarios` y tabla `comentarios_por_partido` | **UP** / **DEGRADED** | ~3ms | `UP` si el esquema de comentarios fue migrado; `DEGRADED` si no existe aún. |
| | Operación Mínima | `SELECT release_version FROM system.local` y consulta particionada preparada por `(partido_id, bucket_minuto, grupo)` | **UP** | ~3ms | Lectura CQL de comentarios con clave de partición real sin full-scan. |
| | Cadena API HTTP | `GET /partidos/F2030-001/comentarios` | **UP** | ~9ms | Consulta paginada con cursor temporal sin full scan. |
| **InfluxDB 3** | Configuración | `INFLUXDB_URL`, `INFLUXDB_DATABASE`, `INFLUXDB_TOKEN` | **UP** | <1ms | URL HTTP `http://127.0.0.1:8181` configurada. |
| | Transporte TCP | Socket TCP a `127.0.0.1:8181` | **UP** / **DOWN** | ~1ms / - | Listener HTTP activo. |
| | Handshake Protocolo | `GET /health` | **UP** | ~3ms | Responde HTTP 200 `{ "status": "pass" }` sin requerir token. |
| | Autenticación / Contexto | `Authorization: Bearer <token>` contra `/api/v3/query_sql` | **UP** / **NOT_CONF** | ~5ms | `NOT_CONFIGURED` si falta token en entorno; `UP` con token válido. |
| | Operación Mínima | Consulta SQL parametrizada sobre `estadisticas_equipo` con ventana temporal acotada | **UP** | ~6ms | Comprobación de intervalo temporal válido sin mutar datos. |
| | Cadena API HTTP | `GET /partidos/F2030-001/estadisticas` | **UP** | ~10ms | Consulta parametrizada sobre intervalo de tiempo. |
| **InterSystems IRIS** | Configuración | `IRIS_HOST`, `IRIS_PORT`, `IRIS_NAMESPACE` | **UP** | <1ms | Namespace `USER` y puertos 1972/52773 leídos. |
| | Transporte TCP (SS) | Socket TCP a `127.0.0.1:1972` | **UP** / **DOWN** | ~1ms / - | Listener SuperServer binario. |
| | Transporte TCP (Web) | Socket TCP a `127.0.0.1:52773` | **UP** / **DOWN** | ~1ms / - | Portal de administración web accesible (`/csp/sys/UtilHome.csp`). |
| | Handshake / Auth | Conexión SuperServer mediante cliente nativo | **UP** / **NOT_CONF** | ~15ms | `NOT_CONFIGURED` en entornos sin usuario de laboratorio temporal. |
| | Contexto Lógico | Namespace `USER` | **UP** | ~2ms | Espacio de clases y rutinas seleccionado. |
| | Operación Mínima | Consulta `%SQL.Statement` sobre clase persistente `Fixture.Partido` | **UP** | ~5ms | Persistencia orientada a objetos comprobada de forma no destructiva. |
| | Cadena API HTTP | `GET /partidos/F2030-IRIS-0011/detalle` | **UP** | ~12ms | Lectura de entidad persistente y eventos de partido en IRIS. |

---

## 3. Matriz Resumida de Estados del Fixture 2030

| Componente | Rol en el Fixture 2030 | Conectividad TCP | Driver Nativo | Integración API | Estado General |
|:---|:---|:---:|:---:|:---:|:---:|
| **MongoDB 7.0** | Documental / Cuentas | `UP` / `DOWN` | `UP` / `DOWN` | `UP` / `DOWN` | **UP** (con servicio activo) |
| **Redis** | Sesiones / Caché | `UP` / `DOWN` | `UP` / `DOWN` | `UP` / `DOWN` | **UP** (con servicio activo) |
| **Neo4j** | Grafos / Partidos | `UP` / `DOWN` | `UP` / `NOT_CONFIGURED` | `UP` / `DOWN` | **UP** (con servicio activo) |
| **Cassandra** | Comentarios masivos | `UP` / `DOWN` | `UP` / `DEGRADED` | `UP` / `DOWN` | **UP** (con keyspace migrado) |
| **InfluxDB 3** | Series temporales | `UP` / `DOWN` | `UP` / `NOT_CONFIGURED` | `UP` / `DOWN` | **UP** (con token activo) |
| **InterSystems IRIS** | Multimodelo / Objetos | `UP` / `DOWN` | `UP` / `NOT_CONFIGURED` | `UP` / `DOWN` | **UP** (con servicio activo) |
| **API Fastify** | Capa de Servicio REST | `UP` | `N/A` | `UP` | **UP** (proceso HTTP operativo) |
