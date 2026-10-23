# Reporte de Evaluación de Conectividad — Hito 11
**Fecha de generación:** 2026-10-23T00:25:00.000Z  
**Entorno:** win32 (x64) — Node.js v22.18.0  
## Matriz Consolidada de Conectividad
| Producto / Dependencia | Rol en el Fixture 2030 | Estado TCP | Driver / Protocolo | Endpoint API | Estado Global | Próximo Paso Recomendado |
|:---|:---|:---:|:---:|:---:|:---:|:---|
| MongoDB 7.0 | Módulo Documental / Cuentas | DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d mongodb. |
| Redis | Sesiones / Caché | DOWN | DOWN | DOWN / ERROR | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d redis. |
| Neo4j (Bolt/HTTP) | Módulo Grafos / Partidos | Bolt: DOWN<br>HTTP: DOWN | NOT_CONFIGURED | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d neo4j. |
| Cassandra | Módulo Comentarios | DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d cassandra. |
| InfluxDB 3 Core | Módulo Series Temporales | DOWN | DOWN | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d influxdb. |
| InterSystems IRIS | Módulo Multimodelo / Objetos | SuperServer: DOWN<br>HTTP: DOWN | NOT_CONFIGURED | REQUIERE SESIÓN | **DOWN** | Verificar puerto del contenedor y ejecutar docker compose up -d iris. |
| API Fastify Integrada | Capa de Servicio HTTP | DOWN | NO PROBADO | UP | **DEGRADED** | Revisar rutas de la API y dependencias del servicio. |

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
| API Integrada Fixture 2030 | `127.0.0.1:8000` | HTTP | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |

## Detalle de Protocolos y Clientes Nativos

| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |
|:---|:---|:---:|:---:|:---|:---|
| MongoDB | Handshake | **DOWN** | 2415ms | Error de conexión: MongoServerSelectionError - connect ECONNREFUSED 127.0.0.1:27017 | Fallo al conectar o autenticar con MongoDB en 127.0.0.1:27017. URI objetivo: mongodb://127.0.0.1:27017/fixture2030?authSource=admin. |
| Redis | Handshake | **DOWN** | 1107ms | Fallo de conexión Redis: connect ECONNREFUSED 127.0.0.1:6379 | No se pudo conectar al servidor RESP en 127.0.0.1:6379. |
| Neo4j (Bolt) | Autenticación | **NOT_CONFIGURED** | - | NEO4J_PASSWORD no configurada en el entorno | SKIP: No se configuró credencial para Neo4j; omitiendo autenticación Bolt. |
| Cassandra (CQL) | Handshake | **DOWN** | 7ms | Fallo CQL: All host(s) tried for query failed. First host tried, 127.0.0.1:9042: Error: connect ECONNREFUSED 127.0.0.1:9042 | No se pudo conectar al protocolo nativo CQL en 127.0.0.1:9042. |
| InfluxDB 3 Core | Handshake | **DOWN** | 36ms | Fallo HTTP InfluxDB: fetch failed | No se pudo alcanzar el endpoint /health en http://127.0.0.1:8181/health. |
| InterSystems IRIS (Web) | Operación mínima | **DOWN** | 1ms | No se pudo conectar al portal HTTP en puerto 52773 | Portal web no disponible en este puerto. |
| InterSystems IRIS (SuperServer) | Autenticación | **NOT_CONFIGURED** | - | IRIS_USERNAME o IRIS_PASSWORD no configurados en el entorno | SKIP: Credenciales de IRIS no provistas; omitiendo conexión al SuperServer. |

## Detalle de Verificación desde la API

| Operación / Endpoint | Dependencia | Status HTTP | Esperado | Conforme | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 200 | SÍ | 2ms | `6ffb7b41...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 200 | SÍ | 32ms | `86c3d45d...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB (Colección accounts) + Redis (Tokens de sesión) | **500** | 200 | NO | 2ms | `dc6ea054...` | Error interno del servidor API (HTTP 500). |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **401** | 200 | NO | 2ms | `5f6cdc7e...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /equipos/ZZZ` | MongoDB | **401** | 404 | NO | 0ms | `a42bbaa7...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400** | 400 | SÍ | 1ms | `a3eb32d0...` | Error de validación sintáctica esperado: esquema Zod interceptó el parámetro inválido (400). |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **401** | 200 | NO | 2ms | `842915c4...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-001` | Neo4j (Nodo Partido) + MongoDB (Equipos) | **401** | 200 | NO | 2ms | `ba1de562...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **401** | 200 | NO | 1ms | `f853e861...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | Cassandra (Keyspace fixture2030_comentarios) | **401** | 200 | NO | 1ms | `4f9890be...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z` | InfluxDB 3 (Base fixture2030_h8_lab_detalle) | **401** | 200 | NO | 1ms | `49fcff5e...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-IRIS-0011/detalle` | InterSystems IRIS (Namespace USER) | **401** | 200 | NO | 0ms | `2aff4eba...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |

---
*Reporte generado automáticamente por la suite de evaluación del Hito 11. Todas las credenciales y secretos fueron redactados.*