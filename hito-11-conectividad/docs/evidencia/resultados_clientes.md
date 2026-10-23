# Evidencia de Evaluación de Clientes Nativos y Protocolos — Hito 11

**Fecha de ejecución:** `2026-10-23T12:10:13.548Z`  
**Entorno de ejecución:** `win32 (x64) — Node.js v25.9.0`  
**Commit base:** `f65b6ec`  
**Comando ejecutado:** `pnpm --dir hito-10-api eval:nativos`  
**Herramienta utilizada:** `scripts/prueba_clientes_nativos.ts` con drivers oficiales Node.js  
**Drivers evaluados:** `mongodb`, `redis`, `neo4j-driver`, `cassandra-driver`, `@intersystems/intersystems-iris-native`, `fetch` (InfluxDB)  

---

## 1. Salida Real Ejecutada en Entorno Host (Sin Contenedores Docker Activos)

```text
================================================================================
Hito 11 — Evaluación de Clientes Nativos, Protocolos y Contextos
Fecha/Hora: 2026-10-23T12:10:13.548Z
================================================================================
Ejecutando verificaciones de drivers y protocolos nativos...

| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |
|:---|:---|:---:|:---:|:---|:---|
| MongoDB | Handshake | **DOWN** | 2300ms | Fallo de conexión o handshake de protocolo: MongoServerSelectionError - connect ECONNREFUSED 127.0.0.1:27017 | Fallo de conexión o handshake de protocolo en MongoDB (127.0.0.1:27017, base "fixture2030"). URI objetivo: mongodb://127.0.0.1:27017/fixture2030?authSource=admin. Hipótesis técnica: listener inaccesible, firewall o rechazo temprano durante negociación inicial. |
| Redis | Handshake | **DOWN** | 840ms | Fallo de conexión o handshake de protocolo: connect ECONNREFUSED 127.0.0.1:6379 | Fallo de conexión o handshake de protocolo en servidor RESP (127.0.0.1:6379, db #0). |
| Neo4j (Bolt) | Autenticación | **NOT_CONFIGURED** | - | NEO4J_PASSWORD no configurada en el entorno | SKIP: No se configuró credencial para Neo4j; omitiendo autenticación Bolt. |
| Cassandra (CQL) | Handshake | **DOWN** | 5ms | Fallo de conexión o handshake de protocolo: All host(s) tried for query failed. First host tried, 127.0.0.1:9042: Error: connect ECONNREFUSED 127.0.0.1:9042 | Fallo de conexión o handshake de protocolo en protocolo nativo CQL (127.0.0.1:9042, keyspace "fixture2030_comentarios"). |
| InfluxDB 3 Core | Handshake | **DOWN** | 16ms | Fallo HTTP InfluxDB: fetch failed | No se pudo alcanzar el endpoint /health en http://127.0.0.1:8181/health. |
| InterSystems IRIS (Web) | Operación mínima | **DOWN** | 1ms | No se pudo conectar al portal HTTP en puerto 52773 | Portal web no disponible en este puerto. |
| InterSystems IRIS (SuperServer) | Autenticación | **NOT_CONFIGURED** | - | IRIS_USERNAME o IRIS_PASSWORD no configurados en el entorno | SKIP: Credenciales de IRIS no provistas; omitiendo conexión al SuperServer. |

Resumen:
- Pruebas exitosas (UP): 0
- Pruebas fallidas (DOWN): 5
- Pruebas omitidas/no configuradas (SKIP/NOT_CONFIGURED): 2
================================================================================
```

---

## 2. Salida de Referencia Teórica / Ilustrativa con Entorno Docker Activo (No Ejecutada en este Host)

*(Bloque ilustrativo de referencia no ejecutado en este host: muestra la salida esperada de `scripts/prueba_clientes_nativos.ts` tras inicializar los seis motores de base de datos con `docker compose up -d` y configurar las credenciales locales correspondientes).*

```text
================================================================================
Hito 11 — Evaluación de Clientes Nativos, Protocolos y Contextos (Referencia Ilustrativa)
================================================================================
Ejecutando verificaciones de drivers y protocolos nativos...

| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |
|:---|:---|:---:|:---:|:---|:---|
| MongoDB | Handshake | **UP (OK)** | 3ms | Handshake de protocolo y comando ping exitoso | Listener accesible en 127.0.0.1:27017. Ping administrativo respondió ok: 1. |
| MongoDB | Contexto | **UP (OK)** | 2ms | Base "fixture2030" y colección "equipos" verificadas mediante listCollections | Contexto de base y colección verificado en el catálogo de MongoDB. |
| MongoDB | Operación mínima | **UP (OK)** | 2ms | Equipo ARG encontrado en colección "equipos" | Operación mínima de lectura ejecutada de forma no destructiva. |
| Redis | Handshake | **UP (OK)** | 1ms | Comando PING respondió: PONG | Protocolo RESP validado correctamente. |
| Redis | Contexto | **UP (OK)** | 1ms | Base de datos lógica Redis #0 activa | Contexto de base de datos indexada accesible. |
| Redis | Operación mínima | **UP (OK)** | 1ms | Lectura de clave ausente devolvió: null. Consulta de TTL: -2 (clave inexistente comprobada sin escrituras). | Operación de solo lectura completada: una clave ausente retorna null y TTL -2 sin alterar el estado de Redis. |
| Neo4j (Bolt) | Handshake | **UP (OK)** | 12ms | Conexión Bolt y autenticación exitosa | Handshake Bolt establecido en bolt://127.0.0.1:7687 como usuario "neo4j". |
| Neo4j (Bolt) | Contexto | **UP (OK)** | 3ms | Base de datos "neo4j" seleccionada correctamente | Contexto de grafo accesible y permisos de consulta comprobados. |
| Neo4j (Bolt) | Operación mínima | **UP (OK)** | 4ms | Cypher ping retorno: 1. Consulta :Partido parametrizada: Partido F2030-001 encontrado. | Consulta Cypher parametrizada sobre etiqueta :Partido y propiedad id ejecutada sin alterar datos. |
| Cassandra (CQL) | Handshake | **UP (OK)** | 18ms | Sesión binaria CQL establecida | Listener CQL alcanzable en 127.0.0.1:9042 (datacenter: datacenter1). |
| Cassandra (CQL) | Contexto | **UP (OK)** | 3ms | Keyspace "fixture2030_comentarios" y tabla "comentarios_por_partido" verificados | Contexto de keyspace y tabla de comentarios validado en metadatos. |
| Cassandra (CQL) | Operación mínima | **UP (OK)** | 4ms | Lectura CQL particionada ejecutada (1 comentarios encontrados) | Consulta CQL con partición real (partido_id, bucket_minuto, grupo) ejecutada con éxito. |
| InfluxDB 3 Core | Handshake | **UP (OK)** | 4ms | Endpoint /health respondió HTTP 200 | Servicio InfluxDB 3 Core iniciado y saludable. |
| InfluxDB 3 Core | Contexto | **UP (OK)** | 5ms | Base de datos "fixture2030_h8_lab_detalle" accesible y token validado | Autenticación y contexto de base de series temporales comprobados. |
| InfluxDB 3 Core | Operación mínima | **UP (OK)** | 6ms | Consulta temporal SQL parametrizada ejecutada en estadisticas_equipo | Operación temporal mínima completada con éxito sin alterar datos. |
| InterSystems IRIS (Web) | Operación mínima | **UP (OK)** | 2ms | Portal HTTP respondió con código 200 | Portal de administración web accesible y respondiendo correctamente. |
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
