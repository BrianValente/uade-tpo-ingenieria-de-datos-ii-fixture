# Mapa de Dependencias — Fixture Mundial 2030

**Asignatura:** Ingeniería de Datos II  
**Hito:** 11 — Evaluación de Conectividad a los Productos del Fixture 2030  
**Fecha:** Octubre 2026  

---

## 1. Descripción General

La API integrada del Fixture 2030 coordina el acceso a seis motores de bases de datos heterogéneos (políglotas), asignando a cada tecnología el modelo de datos óptimo para cada caso de uso del torneo. 

Este documento detalla el mapa técnico de dependencias, identificando hosts, puertos, protocolos de transporte, contextos lógicos, mecanismos de autenticación y endpoints asociados.

---

## 2. Mapa Detallado de Dependencias

| Dependencia | Módulo Funcional | Proceso Origen | Host Objetivo | Puerto / Protocolo | Contexto Lógico | Mecanismo de Autenticación | Cliente / Driver | Operación Mínima de Diagnóstico | Endpoints API Asociados |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **MongoDB 7.0** | Modelo Documental: Equipos y Jugadores; Cuentas de usuarios | Proceso Node.js (API Fastify) | `MONGO_HOST` (`127.0.0.1` en notebook / `mongodb` en Docker) | `27017` / MongoDB Wire Protocol | Base `fixture2030`, authSource `admin`, colecciones `equipos`, `jugadores`, `accounts` | Usuario y contraseña SCRAM-SHA-256 (`MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`) | `mongodb` (Driver oficial Node.js v7.7.0) | `db.command({ ping: 1 })` y `findOne({ codigo: 'ARG' })` | `POST /auth/login`<br>`GET /equipos/:codigo`<br>`GET /equipos/:codigo/jugadores`<br>`GET /partidos/:id` |
| **Redis** | Sesiones de usuarios y control de acceso en memoria | Proceso Node.js (API Fastify) | `REDIS_HOST` (`127.0.0.1` / `redis`) | `6379` / RESP (REdis Serialization Protocol) | Base indexada `0`, prefijo `api:session:<token>` | Opcional (`REDIS_PASSWORD`), sin autenticación por defecto en laboratorio | `redis` (Driver oficial Node.js v6.3.0) | `client.ping()` $\rightarrow$ `PONG` y comprobación de clave ausente | `POST /auth/login`<br>`GET /auth/perfil`<br>Todas las rutas protegidas (validación de Bearer token) |
| **Neo4j** | Grafo de Partidos, Sedes y Eventos | Proceso Node.js (API Fastify) | `NEO4J_HOST` (`127.0.0.1` / `neo4j`) | `7687` / Bolt (Binario) y `7474` / HTTP (Browser) | Base de datos `neo4j` | Basic Auth con usuario `NEO4J_USERNAME` y contraseña `NEO4J_PASSWORD` | `neo4j-driver` (v6.2.0) | `RETURN 1 AS ping` y consulta parametrizada sobre etiqueta real: `MATCH (p:Partido {codigo: $codigo}) RETURN p.codigo, p.estado LIMIT 1` | `GET /partidos/:id`<br>`GET /partidos/:id/eventos` |
| **Apache Cassandra** | Comentarios masivos de partidos de alta concurrencia | Proceso Node.js (API Fastify) | `CASSANDRA_HOST` (`127.0.0.1` / `cassandra`) | `9042` / CQL (Cassandra Query Language) binario | Keyspace `fixture2030_comentarios`, Datacenter `datacenter1` | Sin credenciales en entorno local; validación por nodo local | `cassandra-driver` (DataStax v4.10.0) | `SELECT release_version FROM system.local`, verificación de tabla en metadatos y lectura preparada con partición real: `WHERE partido_id = ? AND bucket_minuto = ? AND grupo = ?` | `GET /partidos/:id/comentarios`<br>`POST /partidos/:id/comentarios` |
| **InfluxDB 3 Core** | Series temporales y métricas de partido minuto a minuto | Proceso Node.js (API Fastify) | `INFLUXDB_HOST` (`127.0.0.1` / `influxdb`) | `8181` / HTTP REST | Database `fixture2030_h8_lab_detalle` | Bearer Token de API InfluxDB 3 (`INFLUXDB_TOKEN`) | Cliente HTTP nativo (`fetch` Node.js) | `GET /health` (sin auth) y `POST /api/v3/query_sql` con consulta acotada sobre `estadisticas_equipo` | `GET /partidos/:id/estadisticas` |
| **InterSystems IRIS** | Multimodelo y persistencia orientada a objetos (Partidos extendidos) | Proceso Node.js (API Fastify) | `IRIS_HOST` (`127.0.0.1` / `iris`) | `1972` / SuperServer (Binario) y `52773` / HTTP (Portal Web) | Namespace `USER` | Credenciales de usuario y clave IRIS (`IRIS_USERNAME`, `IRIS_PASSWORD`) | `@intersystems/intersystems-iris-native` (v2.0.3) | `GET /csp/sys/UtilHome.csp` (Web), Handshake SuperServer y consulta `%SQL.Statement` sobre clase persistente `Fixture.Partido` | `GET /partidos/:codigo/detalle`<br>`PATCH /partidos/:codigo/estado`<br>`POST /partidos/:codigo/eventos` |
| **API Fastify** | Capa de servicio y fachada unificada | Clientes HTTP externos / Tests | `API_HOST` (`127.0.0.1` / `0.0.0.0`) | `8000` / HTTP | N/A (Enrutamiento HTTP) | Tokens de sesión opacos generados en login (`POST /auth/login`) | Fastify v5.12.7 + Zod Type Provider | `GET /health` | `/health`, `/docs/json`, todas las rutas del sistema |

---

## 3. Estados Esperados vs. Estados Observados

| Dependencia | Estado Esperado en Producción | Estado Observado sin Contenedores | Estado Observado con Docker Activo | Diagnóstico de Aislamiento |
|:---|:---:|:---:|:---:|:---|
| **MongoDB** | `UP` | `DOWN` (Connection Refused en :27017) | `UP` (Ping ok: 1) | La API no puede iniciar sesión sin Mongo; degrada a 503 en login. |
| **Redis** | `UP` | `DOWN` (Connection Refused en :6379) | `UP` (PONG recibido) | Sin Redis las sesiones no persisten; las rutas protegidas responden 401/503. |
| **Neo4j** | `UP` | `NOT_CONFIGURED` o `DOWN` (:7687) | `UP` (Bolt handshake exitoso) | Sin Neo4j la ficha de partido no se resuelve y responde 503/timeout. |
| **Cassandra** | `UP` | `DOWN` (Connection Refused en :9042) | `UP` (Versión CQL identificada) | El keyspace debe existir previamente para permitir lecturas. |
| **InfluxDB 3** | `UP` | `DOWN` (Fetch failed en :8181) | `UP` (/health HTTP 200) | Requiere token administrativo local para consultar métricas. |
| **IRIS** | `UP` | `NOT_CONFIGURED` o `DOWN` (:1972) | `UP` (Namespace USER alcanzado) | El usuario de prueba se genera dinámicamente o se inyecta por entorno. |
| **API Integrada** | `UP` | `UP` (Proceso HTTP en memoria / ejecutable) | `UP` | La API se ejecuta independientemente y aísla caídas por dependencia. |

---

## 4. Conclusiones del Mapeo

1. **Desacoplamiento:** Ningún motor comparte contexto con otro. Si uno cae (ej. Cassandra), las rutas independientes (ej. consulta de equipos en MongoDB o estadísticas en InfluxDB) no deben verse afectadas.
2. **Jerarquía de Falla:** Las fallas en MongoDB o Redis impactan en la autenticación general, mientras que las fallas en Neo4j, Cassandra, InfluxDB o IRIS quedan estrictamente circunscriptas a sus rutas de dominio correspondientes.
3. **No Suposición de Salud:** El mapa formaliza que cada producto requiere su propio handshake y cliente específico; un simple ping ICMP o socket TCP abierto no garantiza que la autenticación o el namespace/keyspace existan.
