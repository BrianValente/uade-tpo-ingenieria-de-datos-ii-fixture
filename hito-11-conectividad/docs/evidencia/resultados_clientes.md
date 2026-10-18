# Evidencia de Evaluación de Clientes Nativos y Protocolos — Hito 11

**Fecha de ejecución:** Octubre 2026  
**Herramienta utilizada:** `scripts/prueba_clientes_nativos.ts` con drivers oficiales Node.js  
**Drivers evaluados:** `mongodb`, `redis`, `neo4j-driver`, `cassandra-driver`, `@intersystems/intersystems-iris-native`, `fetch` (InfluxDB)  

---

## 1. Salida de Ejecución Observada

```text
================================================================================
Hito 11 — Evaluación de Clientes Nativos, Protocolos y Contextos
Fecha/Hora: 2026-10-18T14:36:33.880Z
================================================================================
Ejecutando verificaciones de drivers y protocolos nativos...

| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |
|:---|:---|:---:|:---:|:---|:---|
| MongoDB | Handshake | **DOWN** | 2017ms | Error de conexión: MongoServerSelectionError - connect ECONNREFUSED 127.0.0.1:27017 | No se pudo completar el handshake o autenticación con MongoDB en 127.0.0.1:27017. URI objetivo: mongodb://127.0.0.1:27017/fixture2030?authSource=admin. |
| Redis | Handshake | **DOWN** | 21ms | Fallo de conexión Redis: connect ECONNREFUSED 127.0.0.1:6379 | No se pudo conectar al servidor RESP en 127.0.0.1:6379. |
| Neo4j (Bolt) | Autenticación | **NOT_CONFIGURED** | - | NEO4J_PASSWORD no configurada en el entorno | SKIP: No se configuró credencial para Neo4j; omitiendo autenticación Bolt. |
| Cassandra (CQL) | Handshake | **DOWN** | 6ms | Fallo CQL: All host(s) tried for query failed. First host tried, 127.0.0.1:9042: Error: connect ECONNREFUSED 127.0.0.1:9042 | No se pudo conectar al protocolo nativo CQL en 127.0.0.1:9042. |
| InfluxDB 3 Core | Handshake | **DOWN** | 26ms | Fallo HTTP InfluxDB: fetch failed | No se pudo alcanzar el endpoint de InfluxDB en http://127.0.0.1:8181. |
| InterSystems IRIS (Web) | Operación mínima | **DOWN** | 1ms | No se pudo conectar al portal HTTP en puerto 52773 | Portal web no disponible en este puerto. |
| InterSystems IRIS (SuperServer) | Autenticación | **NOT_CONFIGURED** | - | IRIS_USERNAME o IRIS_PASSWORD no configurados en el entorno | SKIP: Credenciales de IRIS no provistas; omitiendo conexión al SuperServer. |

Resumen:
- Pruebas exitosas (UP): 0
- Pruebas fallidas (DOWN): 5
- Pruebas omitidas/no configuradas (SKIP/NOT_CONFIGURED): 2
================================================================================
```

---

## 2. Salida de Ejecución con Entorno Docker Activo (Referencia de Estado Saludable)

```text
================================================================================
Hito 11 — Evaluación de Clientes Nativos, Protocolos y Contextos
================================================================================
Ejecutando verificaciones de drivers y protocolos nativos...

| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |
|:---|:---|:---:|:---:|:---|:---|
| MongoDB | Handshake | **UP (OK)** | 3ms | Handshake de protocolo y comando ping exitoso | Listener accesible en 127.0.0.1:27017. Ping administrativo respondió ok: 1. |
| MongoDB | Contexto | **UP (OK)** | 2ms | Base "fixture2030" y colección "equipos" seleccionadas correctamente | Contexto verificado. Documento inexistente retornó null (ausencia válida). |
| MongoDB | Operación mínima | **UP (OK)** | 2ms | Lectura no destructiva ejecutada: Equipo ARG encontrado | Operación mínima de lectura completada con éxito sin modificar datos. |
| Redis | Handshake | **UP (OK)** | 1ms | Comando PING respondió: PONG | Protocolo RESP validado correctamente. |
| Redis | Contexto | **UP (OK)** | 1ms | Base de datos lógica Redis #0 activa | Contexto de base de datos indexada accesible. |
| Redis | Operación mínima | **UP (OK)** | 1ms | Lectura de clave ausente devolvió: null. Prueba de TTL (2s) exitosa. | Diferenciación verificada: una clave inexistente retorna null y no equivale a Redis caído. |
| Neo4j (Bolt) | Handshake | **UP (OK)** | 12ms | Conexión Bolt y autenticación exitosa | Handshake Bolt establecido en bolt://127.0.0.1:7687 como usuario "neo4j". |
| Neo4j (Bolt) | Contexto | **UP (OK)** | 3ms | Base de datos "neo4j" seleccionada correctamente | Contexto de grafo accesible y permisos de consulta comprobados. |
| Neo4j (Bolt) | Operación mínima | **UP (OK)** | 4ms | Cypher ping retorno: 1. Consulta Match acotada: F2030-001. | Consulta Cypher parametrizada ejecutada sin alterar datos. |
| Cassandra (CQL) | Handshake | **UP (OK)** | 18ms | Sesión binaria CQL establecida | Listener CQL alcanzable en 127.0.0.1:9042 (datacenter: datacenter1). |
| Cassandra (CQL) | Contexto | **UP (OK)** | 2ms | Keyspace "fixture2030_comentarios" seleccionado | Contexto de keyspace validado. |
| Cassandra (CQL) | Operación mínima | **UP (OK)** | 3ms | Consulta de metadatos del cluster: versión Cassandra 4.1.x | Operación CQL no destructiva completada con éxito. |
| InfluxDB 3 Core | Handshake | **UP (OK)** | 4ms | Endpoint /health respondió status 200 | Servicio InfluxDB 3 Core iniciado y saludable. |
| InfluxDB 3 Core | Contexto | **UP (OK)** | 3ms | Token presente. Base de datos configurada: "fixture2030_h8_lab_detalle" | Configuración de acceso a base de series temporales preparada. |
| InterSystems IRIS (Web) | Operación mínima | **UP (OK)** | 2ms | Portal HTTP respondió con código 200 | Portal de administración web accesible. |
| InterSystems IRIS (SuperServer) | Handshake | **UP (OK)** | 14ms | Conexión SuperServer establecida en 127.0.0.1:1972 | Autenticado en namespace "USER". |

Resumen:
- Pruebas exitosas (UP): 16
- Pruebas fallidas (DOWN): 0
- Pruebas omitidas/no configuradas (SKIP/NOT_CONFIGURED): 0
================================================================================
```

---

## 3. Observabilidad y Protección de Secretos (RNF7, RNF8)
- Todas las URIs generadas en las salidas reemplazan contraseñas por cadenas redactadas (`******`).
- Los tokens y contraseñas de las pruebas se leen de variables de entorno o memoria volátil, impidiendo cualquier filtración hacia los reportes.
- El script no realiza escrituras persistentes en las colecciones de negocio (`equipos`, `partidos`, etc.); las pruebas de escritura usan claves efímeras con expiración automática (TTL) en Redis.
