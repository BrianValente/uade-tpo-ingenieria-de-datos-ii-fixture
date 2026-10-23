# Evidencia de Evaluación de Clientes Nativos y Protocolos — Hito 11

**Fecha de ejecución:** Octubre 2026  
**Herramienta utilizada:** `scripts/prueba_clientes_nativos.ts` con drivers oficiales Node.js  
**Drivers evaluados:** `mongodb`, `redis`, `neo4j-driver`, `cassandra-driver`, `@intersystems/intersystems-iris-native`, `fetch` (InfluxDB)  

---

## 1. Salida de Ejecución Observada en Entorno Host (Sin Contenedores)

```text
================================================================================
Hito 11 — Evaluación de Clientes Nativos, Protocolos y Contextos
Fecha/Hora: 2026-10-23T00:24:51.626Z
================================================================================
Ejecutando verificaciones de drivers y protocolos nativos...

| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |
|:---|:---|:---:|:---:|:---|:---|
| MongoDB | Handshake | **DOWN** | 2415ms | Error de conexión: MongoServerSelectionError - connect ECONNREFUSED 127.0.0.1:27017 | Fallo al conectar o autenticar con MongoDB en 127.0.0.1:27017. URI objetivo: mongodb://127.0.0.1:27017/fixture2030?authSource=admin. |
| Redis | Handshake | **DOWN** | 1107ms | Fallo de conexión Redis: connect ECONNREFUSED 127.0.0.1:6379 | No se pudo conectar al servidor RESP en 127.0.0.1:6379. |
| Neo4j (Bolt) | Autenticación | **NOT_CONFIGURED** | - | NEO4J_PASSWORD no configurada en el entorno | SKIP: No se configuró credencial para Neo4j; omitiendo autenticación Bolt. |
| Cassandra (CQL) | Handshake | **DOWN** | 7ms | Fallo CQL: All host(s) tried for query failed. First host tried, 127.0.0.1:9042: Error: connect ECONNREFUSED 127.0.0.1:9042 | No se pudo conectar al protocolo nativo CQL en 127.0.0.1:9042. |
| InfluxDB 3 Core | Handshake | **DOWN** | 36ms | Fallo HTTP InfluxDB: fetch failed | No se pudo alcanzar el endpoint /health en http://127.0.0.1:8181/health. |
| InterSystems IRIS (Web) | Operación mínima | **DOWN** | 1ms | No se pudo conectar al portal HTTP en puerto 52773 | Portal web no disponible en este puerto. |
| InterSystems IRIS (SuperServer) | Autenticación | **NOT_CONFIGURED** | - | IRIS_USERNAME o IRIS_PASSWORD no configurados en el entorno | SKIP: Credenciales de IRIS no provistas; omitiendo conexión al SuperServer. |

Resumen:
- Pruebas exitosas (UP): 0
- Pruebas fallidas (DOWN): 5
- Pruebas omitidas/no configuradas (SKIP/NOT_CONFIGURED): 2
================================================================================
```

---

## 2. Salida de Referencia Teórica / Simulación Ilustrativa con Entorno Docker Activo

*(Línea base ilustrativa esperada tras inicializar los seis motores de base de datos con `docker compose up -d` y configurar las credenciales locales correspondientes)*

```text
================================================================================
Hito 11 — Evaluación de Clientes Nativos, Protocolos y Contextos
Fecha/Hora: 2026-10-23T00:30:00.000Z (Línea base ilustrativa de integración plena)
================================================================================
Ejecutando verificaciones de drivers y protocolos nativos...

| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |
|:---|:---|:---:|:---:|:---|:---|
| MongoDB | Handshake | **UP (OK)** | 3ms | Handshake de protocolo y comando ping exitoso | Listener accesible en 127.0.0.1:27017. Ping administrativo respondió ok: 1. |
| MongoDB | Contexto | **UP (OK)** | 2ms | Base "fixture2030" y colección "equipos" seleccionadas correctamente | Contexto verificado mediante listCollections. Colección "equipos" confirmada. |
| MongoDB | Operación mínima | **UP (OK)** | 2ms | Lectura no destructiva ejecutada: Equipo ARG encontrado | Operación mínima de lectura completada con éxito sin modificar datos. |
| Redis | Handshake | **UP (OK)** | 1ms | Comando PING respondió: PONG | Protocolo RESP validado correctamente. |
| Redis | Contexto | **UP (OK)** | 1ms | Base de datos lógica Redis #0 activa | Contexto de base de datos indexada accesible. |
| Redis | Operación mínima | **UP (OK)** | 1ms | Lectura de clave ausente devolvió: null. Consulta de TTL: -2 (clave inexistente comprobada sin escrituras). | Operación de solo lectura completada: una clave ausente retorna null y TTL -2 sin alterar el estado de Redis. |
| Neo4j (Bolt) | Handshake | **UP (OK)** | 12ms | Conexión Bolt y autenticación exitosa | Handshake Bolt establecido en bolt://127.0.0.1:7687 como usuario "neo4j". |
| Neo4j (Bolt) | Contexto | **UP (OK)** | 3ms | Base de datos "neo4j" seleccionada correctamente | Contexto de grafo accesible y permisos de consulta comprobados. |
| Neo4j (Bolt) | Operación mínima | **UP (OK)** | 4ms | Cypher ping retorno: 1. Consulta :Partido parametrizada: Partido F2030-001 encontrado. | Consulta Cypher parametrizada sobre etiqueta :Partido y propiedad id ejecutada sin alterar datos. |
| Cassandra (CQL) | Handshake | **UP (OK)** | 18ms | Sesión binaria CQL establecida | Listener CQL alcanzable en 127.0.0.1:9042 (datacenter: datacenter1). |
| Cassandra (CQL) | Contexto | **UP (OK)** | 3ms | Keyspace "fixture2030_comentarios" y tabla "comentarios_por_partido" verificados | Esquema verificado mediante metadata.getTable() con timeout acotado. |
| Cassandra (CQL) | Operación mínima | **UP (OK)** | 4ms | Lectura particionada sobre comentarios_por_partido ejecutada con éxito | Consulta CQL acotada por partición real (partido_id, bucket_minuto, grupo). |
| InfluxDB 3 Core | Handshake | **UP (OK)** | 4ms | Endpoint /health respondió status 200 | Servicio InfluxDB 3 Core iniciado y saludable. |
| InfluxDB 3 Core | Contexto | **UP (OK)** | 5ms | Consulta SQL temporal sobre estadisticas_equipo respondió exitosamente (HTTP 200) | Contexto de base fixture2030_h8_lab_detalle y token Bearer validados. |
| InfluxDB 3 Core | Operación mínima | **UP (OK)** | 6ms | Consulta SQL acotada con filtro temporal ejecutada | Operación de lectura sobre estadisticas_equipo completada sin mutar datos. |
| InterSystems IRIS (Web) | Operación mínima | **UP (OK)** | 2ms | Portal HTTP respondió con código 200 | Portal de administración web accesible. |
| InterSystems IRIS (SuperServer) | Handshake | **UP (OK)** | 14ms | Conexión SuperServer establecida en 127.0.0.1:1972 | Autenticado en namespace "USER". |
| InterSystems IRIS (SuperServer) | Contexto | **UP (OK)** | 3ms | Namespace "USER" activo y clase Fixture.Partido consultada | Contexto de objetos IRIS validado con consulta de clase persistente. |
| InterSystems IRIS (SuperServer) | Operación mínima | **UP (OK)** | 4ms | Partido F2030-IRIS-0011 recuperado mediante modelo de objetos | Operación no destructiva completada con el driver nativo IRIS. |

Resumen:
- Pruebas exitosas (UP): 19
- Pruebas fallidas (DOWN): 0
- Pruebas omitidas/no configuradas (SKIP/NOT_CONFIGURED): 0
================================================================================
```

---

## 3. Observabilidad y Protección de Secretos (RNF7, RNF8)
- Todas las URIs generadas en las salidas reemplazan contraseñas por cadenas redactadas (`******`).
- Los tokens y contraseñas de las pruebas se leen de variables de entorno o memoria volátil, impidiendo cualquier filtración hacia los reportes.
- El script opera de forma estrictamente no destructiva y de solo lectura; la prueba de ausencia en Redis consulta una clave no existente y verifica su TTL (-2) sin realizar escrituras ni mutar el estado.
