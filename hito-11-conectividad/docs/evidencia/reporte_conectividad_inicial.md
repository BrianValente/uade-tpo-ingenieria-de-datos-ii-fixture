# Reporte de Evaluación de Conectividad — Hito 11
**Fecha de generación:** 2026-10-23T12:10:13.548Z  
**Entorno:** win32 (x64) — Node.js v25.9.0  
**Commit base:** `f65b6ec`  
**Comando ejecutado:** `pnpm --dir hito-10-api eval:conectividad -- --all --in-process --output=../hito-11-conectividad/docs/evidencia/reporte_conectividad_inicial.md`  
**Modo API:** In-Process (`app.inject`)  
## Matriz Consolidada de Conectividad
| Producto / Dependencia | Rol en el Fixture 2030 | Estado TCP | Driver / Protocolo | Endpoint API | Estado Global | Próximo Paso Recomendado |
|:---|:---|:---:|:---:|:---:|:---:|:---|
| MongoDB 7.0 | Módulo Documental / Cuentas | DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Revisar logs del contenedor y ejecutar docker compose up -d mongodb. |
| Redis | Sesiones / Caché | DOWN | DOWN | DOWN (503) | **DOWN** | Revisar logs del contenedor y ejecutar docker compose up -d redis. |
| Neo4j (Bolt/HTTP) | Módulo Grafos / Partidos | Bolt: DOWN<br>HTTP: DOWN | NOT_CONFIGURED | REQUIERE SESIÓN | **NOT_CONFIGURED** | Configurar credenciales requeridas en el archivo .env. |
| Cassandra | Módulo Comentarios | DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Revisar logs del contenedor y ejecutar docker compose up -d cassandra. |
| InfluxDB 3 Core | Módulo Series Temporales | DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Revisar logs del contenedor y ejecutar docker compose up -d influxdb. |
| InterSystems IRIS | Módulo Multimodelo / Objetos | SuperServer: DOWN<br>HTTP: DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Revisar logs del contenedor y ejecutar docker compose up -d iris. |
| API Fastify Integrada | Capa de Servicio HTTP | UP | NO PROBADO | UP | **UP (OK)** | Servicio HTTP activo y respondiendo rutas correctamente. |
## Detalle de Conectividad TCP

| Producto / Listener | Host:Puerto | Protocolo | Estado | Latencia | Diagnóstico Técnico |
|:---|:---|:---|:---:|:---:|:---|
| MongoDB | `127.0.0.1:27017` | MongoDB Wire Protocol | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| Redis | `127.0.0.1:6379` | RESP | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| Neo4j (Bolt) | `127.0.0.1:7687` | Bolt | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| Neo4j (HTTP) | `127.0.0.1:7474` | HTTP | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| Cassandra (CQL) | `127.0.0.1:9042` | CQL | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| InfluxDB 3 Core (HTTP) | `127.0.0.1:8181` | HTTP | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| InterSystems IRIS (SuperServer) | `127.0.0.1:1972` | SuperServer | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| InterSystems IRIS (Web/Portal) | `127.0.0.1:52773` | HTTP | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| API Integrada Fixture 2030 | `127.0.0.1:8000` | HTTP | **UP (OK)** | 1ms | Existe un listener activo y accesible en el host y puerto probado. |

## Detalle de Protocolos y Clientes Nativos

| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |
|:---|:---|:---:|:---:|:---|:---|
| MongoDB | Handshake | **DOWN** | 2300ms | Fallo de conexión o handshake de protocolo: MongoServerSelectionError - connect ECONNREFUSED 127.0.0.1:27017 | Fallo de conexión o handshake de protocolo en MongoDB (127.0.0.1:27017, base "fixture2030"). URI objetivo: mongodb://127.0.0.1:27017/fixture2030?authSource=admin. Hipótesis técnica: listener inaccesible, firewall o rechazo temprano durante negociación inicial. |
| Redis | Handshake | **DOWN** | 840ms | Fallo de conexión o handshake de protocolo: connect ECONNREFUSED 127.0.0.1:6379 | Fallo de conexión o handshake de protocolo en servidor RESP (127.0.0.1:6379, db #0). |
| Neo4j (Bolt) | Autenticación | **NOT_CONFIGURED** | - | NEO4J_PASSWORD no configurada en el entorno | SKIP: No se configuró credencial para Neo4j; omitiendo autenticación Bolt. |
| Cassandra (CQL) | Handshake | **DOWN** | 5ms | Fallo de conexión o handshake de protocolo: All host(s) tried for query failed. First host tried, 127.0.0.1:9042: Error: connect ECONNREFUSED 127.0.0.1:9042 | Fallo de conexión o handshake de protocolo en protocolo nativo CQL (127.0.0.1:9042, keyspace "fixture2030_comentarios"). |
| InfluxDB 3 Core | Handshake | **DOWN** | 16ms | Fallo HTTP InfluxDB: fetch failed | No se pudo alcanzar el endpoint /health en http://127.0.0.1:8181/health. |
| InterSystems IRIS (Web) | Operación mínima | **DOWN** | 1ms | No se pudo conectar al portal HTTP en puerto 52773 | Portal web no disponible en este puerto. |
| InterSystems IRIS (SuperServer) | Autenticación | **NOT_CONFIGURED** | - | IRIS_USERNAME o IRIS_PASSWORD no configurados en el entorno | SKIP: Credenciales de IRIS no provistas; omitiendo conexión al SuperServer. |

## Detalle de Verificación desde la API

| Operación / Endpoint | Dependencia | Status HTTP | Esperado | Conforme | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 200 | SÍ | 24ms | `6c25d120...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 200 | SÍ | 22ms | `bf8962af...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB (Colección accounts) + Redis (Tokens de sesión) | **503** | 200 | NO | 2016ms | `5e85a202...` | Dependencia subyacente no disponible (503 DEPENDENCY_UNAVAILABLE). |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **401** | 200 | NO | 1ms | `457e87ae...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /equipos/ZZZ` | MongoDB | **401** | 404 | NO | 0ms | `26813c64...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400** | 400 | SÍ | 1ms | `13d13044...` | Error de validación sintáctica esperado: esquema Zod interceptó el parámetro inválido (400). |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **401** | 200 | NO | 1ms | `bb043d94...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-001` | Neo4j (Nodo Partido) + MongoDB (Equipos) | **401** | 200 | NO | 1ms | `f685f66a...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **401** | 200 | NO | 0ms | `7a778cf2...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | Cassandra (Keyspace fixture2030_comentarios) | **401** | 200 | NO | 1ms | `14a4ed72...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z` | InfluxDB 3 (Base fixture2030_h8_lab_detalle) | **401** | 200 | NO | 1ms | `6a0a6d36...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-IRIS-0011/detalle` | InterSystems IRIS (Namespace USER) | **401** | 200 | NO | 0ms | `34eca219...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |

---
*Reporte generado automáticamente por la suite de evaluación del Hito 11 (`evaluar_conectividad.ts`) sin edición manual posterior. Todas las credenciales y secretos fueron redactados.*