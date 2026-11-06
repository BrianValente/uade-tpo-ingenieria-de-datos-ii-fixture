# Hito 11 — Resultados clientes

Fecha: 2026-11-06T18:47:50.383Z. Código: `cd653d6`. Modo: live-http.

Node24.13 y Ubuntu24.04 x64, SDK IRIS oficial sin modificar. Motores reales: Mongo7 e Influx3 bajo QEMU user-mode; IRIS2026.2 en VM Linux QEMU TCG. Emulacion sin AVX fisico; no certifica rendimiento de produccion.

Desglose de los mismos registros del [consolidado](reporte_conectividad_inicial.json), no una ejecución independiente.

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
