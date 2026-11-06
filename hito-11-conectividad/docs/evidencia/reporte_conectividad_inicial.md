# Reporte de Evaluación de Conectividad — Hito 11
**Fecha de generación:** 2026-11-06T18:47:50.383Z

**Entorno:** linux (x64) — Node.js v24.13.0

**Commit base:** `cd653d6`

**Comando reproducible equivalente:** `pnpm --dir hito-10-api eval:conectividad -- --all --require-up --output=../hito-11-conectividad/docs/evidencia/reporte_conectividad_inicial.md`

**Modo API:** Live HTTP (`fetch`)
## Matriz Consolidada de Conectividad
| Producto / Dependencia | Rol en el Fixture 2030 | Estado TCP | Driver / Protocolo | Endpoint API | Estado Global | Próximo Paso Recomendado |
|:---|:---|:---:|:---:|:---:|:---:|:---|
| MongoDB 7.0 | Módulo Documental / Cuentas | UP | UP | UP | **UP (OK)** | Dependencia totalmente validada desde TCP hasta la API. |
| Redis | Sesiones / Caché | UP | UP | UP | **UP (OK)** | Dependencia totalmente validada desde TCP hasta la API. |
| Neo4j (Bolt/HTTP) | Módulo Grafos / Partidos | Bolt: UP<br>HTTP: UP | UP | UP | **UP (OK)** | Dependencia totalmente validada desde TCP hasta la API. |
| Cassandra | Módulo Comentarios | UP | UP | UP | **UP (OK)** | Dependencia totalmente validada desde TCP hasta la API. |
| InfluxDB 3 Core | Módulo Series Temporales | UP | UP | UP | **UP (OK)** | Dependencia totalmente validada desde TCP hasta la API. |
| InterSystems IRIS | Módulo Multimodelo / Objetos | SuperServer: UP<br>HTTP: UP | UP | UP | **UP (OK)** | Dependencia totalmente validada desde TCP hasta la API. |
| API Fastify Integrada | Capa de Servicio HTTP | UP | NO PROBADO | UP | **UP (OK)** | Servicio HTTP activo y respondiendo rutas correctamente. |
## Detalle de Conectividad TCP

| Producto / Listener | Host:Puerto | Protocolo | Estado | Latencia | Diagnóstico Técnico |
|:---|:---|:---|:---:|:---:|:---|
| MongoDB | `127.0.0.1:27017` | MongoDB Wire Protocol | **UP (OK)** | 3ms | Existe un listener activo y accesible en el host y puerto probado. |
| Redis | `127.0.0.1:6379` | RESP | **UP (OK)** | 1ms | Existe un listener activo y accesible en el host y puerto probado. |
| Neo4j (Bolt) | `127.0.0.1:7687` | Bolt | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| Neo4j (HTTP) | `127.0.0.1:7474` | HTTP | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| Cassandra (CQL) | `127.0.0.1:9042` | CQL | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| InfluxDB 3 Core (HTTP) | `127.0.0.1:8181` | HTTP | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| InterSystems IRIS (SuperServer) | `127.0.0.1:1972` | SuperServer | **UP (OK)** | 1ms | Existe un listener activo y accesible en el host y puerto probado. |
| InterSystems IRIS (Web/Portal) | `127.0.0.1:52773` | HTTP | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| API Integrada Fixture 2030 | `127.0.0.1:8000` | HTTP | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |

## Detalle de Protocolos y Clientes Nativos

| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |
|:---|:---|:---:|:---:|:---|:---|
| MongoDB | Handshake | **UP (OK)** | 133ms | Handshake de protocolo y comando ping exitoso | Listener accesible en 127.0.0.1:27017. Ping administrativo respondió ok: 1. |
| MongoDB | Contexto | **UP (OK)** | 3ms | Base "fixture2030" y colección "equipos" verificadas mediante listCollections | Contexto de base y colección verificado en el catálogo de MongoDB. |
| MongoDB | Operación mínima | **UP (OK)** | 2ms | Equipo ARG encontrado en colección "equipos" | Operación mínima de lectura ejecutada de forma no destructiva. |
| Redis | Handshake | **UP (OK)** | 214ms | Comando PING respondió: PONG | Protocolo RESP validado correctamente. |
| Redis | Contexto | **UP (OK)** | 1ms | Base de datos lógica Redis #0 activa | Contexto de base de datos indexada accesible. |
| Redis | Operación mínima | **UP (OK)** | 1ms | Lectura de clave ausente devolvió: null. Consulta de TTL: -2 (clave inexistente comprobada sin escrituras). | Operación de solo lectura completada: una clave ausente retorna null y TTL -2 sin alterar el estado de Redis. |
| Neo4j (Bolt) | Handshake | **UP (OK)** | 47ms | Conexión Bolt y autenticación exitosa | Handshake Bolt establecido en bolt://127.0.0.1:7687 como usuario "neo4j". |
| Neo4j (Bolt) | Contexto | **UP (OK)** | 7ms | Base de datos "neo4j" seleccionada correctamente | Contexto de grafo accesible y permisos de consulta comprobados. |
| Neo4j (Bolt) | Operación mínima | **UP (OK)** | 2ms | Cypher ping retorno: 1. Consulta :Partido parametrizada: Partido F2030-001 encontrado. | Consulta Cypher parametrizada sobre etiqueta :Partido y propiedad id ejecutada sin alterar datos. |
| Cassandra (CQL) | Handshake | **UP (OK)** | 15ms | Sesión binaria CQL establecida | Listener CQL alcanzable en 127.0.0.1:9042 (datacenter: datacenter1). |
| Cassandra (CQL) | Contexto | **UP (OK)** | 5ms | Keyspace "fixture2030_comentarios" y tabla "comentarios_por_partido" verificados | Contexto de keyspace y tabla de comentarios validado en metadatos. |
| Cassandra (CQL) | Operación mínima | **UP (OK)** | 2ms | Lectura CQL particionada ejecutada (0 comentarios encontrados) | Consulta CQL con partición real (partido_id, bucket_minuto, grupo) ejecutada con éxito. |
| InfluxDB 3 Core | Handshake | **UP (OK)** | 19ms | Endpoint /health respondió HTTP 200 | Servicio InfluxDB 3 Core iniciado y saludable. |
| InfluxDB 3 Core | Contexto | **UP (OK)** | 16ms | Base de datos "fixture2030_h8_lab_detalle" accesible y token validado | Autenticación y contexto de base de series temporales comprobados. |
| InfluxDB 3 Core | Operación mínima | **UP (OK)** | 16ms | Consulta temporal SQL parametrizada ejecutada en estadisticas_equipo | Operación temporal mínima completada con éxito sin alterar datos. |
| InterSystems IRIS (Web) | Operación mínima | **UP (OK)** | 20ms | Portal HTTP respondió con código 200 | Portal de administración web accesible y respondiendo correctamente. |
| InterSystems IRIS (SuperServer) | Handshake | **UP (OK)** | 191ms | Conexión SuperServer establecida en 127.0.0.1:1972 | Autenticado en namespace "USER". |
| InterSystems IRIS (SuperServer) | Contexto | **UP (OK)** | 7ms | Namespace "USER" activo y clase Fixture.Partido consultada | Contexto de objetos IRIS validado con consulta de clase persistente. |
| InterSystems IRIS (SuperServer) | Operación mínima | **UP (OK)** | 7ms | Partido F2030-IRIS-0001 recuperado mediante modelo de objetos | Operación no destructiva completada con el driver nativo IRIS. |

## Detalle de Verificación desde la API

| Operación / Endpoint | Dependencia | Status HTTP | Esperado | Conforme | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 200 | SÍ | 5ms | `7694c14f...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 200 | SÍ | 2ms | `8b3c9573...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB (Colección accounts) + Redis (Tokens de sesión) | **200 OK** | 200 | SÍ | 41ms | `b19ff685...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **200 OK** | 200 | SÍ | 4ms | `c77870b1...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /equipos/ZZZ` | MongoDB | **404** | 404 | SÍ | 3ms | `6edb8a12...` | Ausencia válida esperada: recurso inexistente retornó 404 correctamente. |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400** | 400 | SÍ | 1ms | `f0372a80...` | Error de validación sintáctica esperado: esquema Zod interceptó el parámetro inválido (400). |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **200 OK** | 200 | SÍ | 5ms | `8bf8db89...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001` | Neo4j (Nodo Partido) + MongoDB (Equipos) | **200 OK** | 200 | SÍ | 5ms | `983e9733...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **200 OK** | 200 | SÍ | 4ms | `f76816ea...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | Cassandra (Keyspace fixture2030_comentarios) | **200 OK** | 200 | SÍ | 2ms | `bcc2d223...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z` | InfluxDB 3 (Base fixture2030_h8_lab_detalle) | **200 OK** | 200 | SÍ | 23ms | `4a32a6d8...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-IRIS-0001/detalle` | InterSystems IRIS (Namespace USER) | **200 OK** | 200 | SÍ | 205ms | `f1bc342c...` | Operación completada exitosamente a través de la cadena completa. |

---
*Reporte generado automáticamente por la suite de evaluación del Hito 11 (`evaluar_conectividad.ts`) sin edición manual posterior. Todas las credenciales y secretos fueron redactados.*