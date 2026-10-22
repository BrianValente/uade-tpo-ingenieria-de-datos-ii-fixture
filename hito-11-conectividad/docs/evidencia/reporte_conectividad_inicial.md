# Reporte de Evaluación de Conectividad — Hito 11
**Fecha de generación:** 2026-10-18T14:36:36.901Z  
**Entorno:** win32 (x64) — Node.js v25.9.0  
## Matriz Consolidada de Conectividad
| Producto / Dependencia | Rol en el Fixture 2030 | Estado TCP | Driver / Protocolo | Endpoint API | Estado Global | Próximo Paso Recomendado |
|:---|:---|:---:|:---:|:---:|:---:|:---|
| MongoDB 7.0 | Módulo Documental / Cuentas | DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d mongodb. |
| Redis | Sesiones / Caché | DOWN | DOWN | DOWN / ERROR | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d redis. |
| Neo4j (Bolt/HTTP) | Módulo Grafos / Partidos | DOWN | NOT_CONFIGURED | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d neo4j. |
| Cassandra | Módulo Comentarios | DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d cassandra. |
| InfluxDB 3 Core | Módulo Series Temporales | DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d influxdb. |
| InterSystems IRIS | Módulo Multimodelo / Objetos | DOWN | NOT_CONFIGURED | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d iris. |
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
| MongoDB | Handshake | **DOWN** | 2017ms | Error de conexión: MongoServerSelectionError - connect ECONNREFUSED 127.0.0.1:27017 | No se pudo completar el handshake o autenticación con MongoDB en 127.0.0.1:27017. URI objetivo: mongodb://127.0.0.1:27017/fixture2030?authSource=admin. |
| Redis | Handshake | **DOWN** | 21ms | Fallo de conexión Redis: connect ECONNREFUSED 127.0.0.1:6379 | No se pudo conectar al servidor RESP en 127.0.0.1:6379. |
| Neo4j (Bolt) | Autenticación | **NOT_CONFIGURED** | - | NEO4J_PASSWORD no configurada en el entorno | SKIP: No se configuró credencial para Neo4j; omitiendo autenticación Bolt. |
| Cassandra (CQL) | Handshake | **DOWN** | 6ms | Fallo CQL: All host(s) tried for query failed. First host tried, 127.0.0.1:9042: Error: connect ECONNREFUSED 127.0.0.1:9042 | No se pudo conectar al protocolo nativo CQL en 127.0.0.1:9042. |
| InfluxDB 3 Core | Handshake | **DOWN** | 26ms | Fallo HTTP InfluxDB: fetch failed | No se pudo alcanzar el endpoint de InfluxDB en http://127.0.0.1:8181. |
| InterSystems IRIS (Web) | Operación mínima | **DOWN** | 1ms | No se pudo conectar al portal HTTP en puerto 52773 | Portal web no disponible en este puerto. |
| InterSystems IRIS (SuperServer) | Autenticación | **NOT_CONFIGURED** | - | IRIS_USERNAME o IRIS_PASSWORD no configurados en el entorno | SKIP: Credenciales de IRIS no provistas; omitiendo conexión al SuperServer. |

## Detalle de Verificación desde la API

| Operación / Endpoint | Dependencia Evaluada | Status HTTP | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 25ms | `2ad5cd5a...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 20ms | `5d03ebef...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB (Colección accounts) + Redis (Tokens de sesión) | **503** | 2011ms | `848a953c...` | Dependencia subyacente no disponible (503 Service Unavailable). |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **401 (Auth requerida)** | 1ms | `7ec77589...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /equipos/ZZZ` | MongoDB | **401 (Auth requerida)** | 1ms | `74292fe3...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400 (Validación)** | 1ms | `c2a44033...` | Error de validación sintáctica/esquema Zod interceptado por la API. |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **401 (Auth requerida)** | 1ms | `e5dc426b...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-001` | Neo4j (Nodo Partido) + MongoDB (Equipos) | **401 (Auth requerida)** | 1ms | `d7695986...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **401 (Auth requerida)** | 1ms | `7f9435a8...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | Cassandra (Keyspace fixture2030_comentarios) | **401 (Auth requerida)** | 3ms | `cd3088a6...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z` | InfluxDB 3 (Base fixture2030_h8_lab_detalle) | **401 (Auth requerida)** | 1ms | `e1b150f9...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-IRIS-0011/detalle` | InterSystems IRIS (Namespace USER) | **401 (Auth requerida)** | 0ms | `62657864...` | Petición rechazada por falta de sesión o token no suministrado. |

---
*Reporte generado automáticamente por la suite de evaluación del Hito 11. Todas las credenciales y secretos fueron redactados.*