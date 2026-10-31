# Defensa de Decisiones de Arquitectura Políglota y Análisis Transversal — Hito 13 (§6.4, RF11, RF12, RF14, RF15)

## 1. Por Qué una Única Base de Datos No Resuelve Adecuadamente el Fixture Mundial 2030 (RF12)

El **Fixture Mundial FIFA 2030** combina cargas de trabajo con patrones de acceso, frecuencias de mutación, estructuras de datos y requisitos de latencia radicalmente distintos:

1. **Entidades jerárquicas semiestructuradas** (selecciones, planteles de 24 jugadores, cuerpos técnicos, comentarios anidados y bitácoras de acceso).
2. **Relaciones altamente conectadas** (cruces de grupos y llaves eliminatorias, sedes en múltiples países/continentes, arbitrajes y trazabilidad de qué jugador de qué selección protagonizó cada evento en qué partido).
3. **Escrituras y lecturas masivas particionadas por clave conocida** (timeline cronológico de eventos por partido o historial por equipo sin joins costosos).
4. **Estado efímero de ultra-baja latencia** (validación de sesión con renovación deslizable en cada request HTTP y caché Read-Aside para absorber el 80% de tráfico concentrado en los partidos calientes).
5. **Flujos continuos de telemetría temporal** (sensores ambientales de estadios, humedad de césped y biometría por ventana de tiempo con agregaciones `MEAN/MAX/P95`).
6. **Consultas analíticas multidimensionales (OLAP/BI)** (cubos de rendimiento, asistencia por sede/fase y KPIs históricos sobre esquema estrella sin degradar la operación transaccional en vivo).

Forzar estas seis responsabilidades dentro de un único motor (por ejemplo, solo un motor documental o solo un motor relacional/columnar) introduce **anti-patrones severos**:
- Usar **MongoDB** o **Cassandra** para recorrer caminos de relaciones entre fases, sedes, partidos y eventos obliga a ejecutar múltiples *joins* en capa de aplicación o duplicar desmesuradamente datos mutables.
- Usar **Neo4j** o **MongoDB** para validar y renovar el TTL de sesión en cada petición HTTP multiplica la latencia por `10x–30x` y satura el disco con escrituras efímeras (como se demostró en la línea base del Hito 12).
- Ejecutar agregaciones **OLAP** de negocio sobre los motores **OLTP** durante el transcurso de un partido compite por memoria y CPU con las lecturas de millones de espectadores.

---

## 2. Defensa Individual de los 6 Modelos de Base de Datos (§6.4 — 10 Puntos por Motor, RF11)

### 2.1. MongoDB (`7.0`) — Modelo Documental

1. **Responsabilidades que absorbe:** Maestro de selecciones (`equipos`), planteles completos de jugadores (`jugadores`), cuentas de usuario (`usuarios`) y documentos de comentarios/auditoría.
2. **Por qué el modelo documental es adecuado:** Los perfiles de selecciones y jugadores poseen atributos jerárquicos naturales (datos de confederación, clasificación, atributos físicos y técnicos) que se leen como un agregado cohesivo en formato JSON/BSON sin requerir desarme en múltiples tablas relacionales.
3. **Estructuras principales diseñadas:**
   - Colección `equipos` (`64` documentos en laboratorio; clave única en `codigo`, ej. `ARG`, `ESP`, `MAR`).
   - Colección `jugadores` (`1.536` documentos, `24` por selección; índice compuesto en `{ equipoCodigo: 1, posicion: 1, dorsal: 1 }` creado en [`hito-12-carga-optimizacion/scripts/preparar_datos.ts`](../../hito-12-carga-optimizacion/scripts/preparar_datos.ts)).
4. **Consultas principales que resuelve:**
   - `GET /equipos/:codigo`: búsqueda puntual por `codigo` con proyección explícita (`TEAM_PROJECTION`).
   - `GET /equipos/:codigo/jugadores`: listado paginado y ordenado por posición y dorsal usando el índice cubierto `{ equipoCodigo: 1, posicion: 1, dorsal: 1 }`.
   - Enriquecimiento por lote (`{ codigo: { $in: [homeCode, awayCode] } }`) en la lectura compuesta `GET /partidos/:id`.
5. **Decisión de particionamiento / distribución (Sharding):**
   - **Proyección a escala Mundial 2030:** Sharding por `equipoCodigo` (para `jugadores`) y por `partidoId` (para bitácoras/comentarios), garantizando que toda la plantilla de una selección resida en el mismo shard (*targeted query* sin *scatter-gather*).
6. **Estrategia de replicación, consistencia y trade-off (CAP/PACELC):**
   - Replica Set de 3 nodos (`Primary-Secondary-Secondary`) con `writeConcern: "majority"` para actualizaciones oficiales de planteles y `readPreference: "secondaryPreferred"` para absorber lecturas globales. Trade-off: eventualidad de milisegundos en réplicas secundarias a cambio de alta disponibilidad de lectura.
7. **Evidencia concreta del repositorio:**
   - Diseño e ingesta en [`mongodb/`](../../mongodb/), conector en [`hito-10-api/src/modules/fixture/`](../../hito-10-api/src/modules/fixture/), validación en [`hito-11-conectividad/scripts/prueba_clientes_nativos.ts`](../../hito-11-conectividad/scripts/prueba_clientes_nativos.ts) y optimización `O1` en [`hito-12-carga-optimizacion/docs/optimizaciones_aplicadas.md`](../../hito-12-carga-optimizacion/docs/optimizaciones_aplicadas.md).
8. **Métricas observadas (Hitos 11, 12 y 13):**
   - **Hito 11:** latencia nativa de consulta documental `~2,1 ms`.
   - **Hito 12:** la optimización `O1` (consulta por lote `$in`, eliminación de lookup redundante y proyección BSON) + `O2` (caché Redis) redujo las operaciones a MongoDB de `27.107` a `192` (`-99,29%`) y bajó su latencia `p95` de `12,48 ms` a `5,15 ms`.
   - **Hito 13:** monitoreado en vivo vía `fixture2030_db_operation_duration_ms{engine="mongodb"}` y `fixture2030_component_up{component="mongodb"}`.
9. **Debilidad, costo o limitación:** Sin proyecciones explícitas ni índices compuestos, el tamaño de los documentos BSON encarece la serialización y el ancho de banda; además, no es eficiente para traversals profundos de relaciones entre partidos y llaves del torneo.
10. **Por qué otra base del proyecto no sería mejor:** En **Redis** almacenar 1.536 perfiles ricos con filtros secundarios por posición y paginación requeriría mantener múltiples índices manuales en memoria; en **Cassandra** la evolución flexible del documento de jugador/equipo y los filtros ad-hoc son rígidos.

---

### 2.2. Neo4j (`5.26.24`) — Modelo de Grafo de Propiedades

1. **Responsabilidades que absorbe:** Estructura topológica del torneo: partidos (`:Partido`), sedes (`:Sede`), equipos participantes (`:Equipo`), jugadores (`:Jugador`) y eventos del partido (`:Evento`) vinculados mediante relaciones dirigidas.
2. **Por qué el modelo de grafo es adecuado:** El fixture de un mundial es intrínsecamente un grafo conexo donde interesan las relaciones semánticas (`(:Equipo)-[:DISPUTA {condicion: 'local'|'visitante'}]->(:Partido)-[:SE_JUEGA_EN]->(:Sede)` y `(:Evento)-[:OCURRE_EN]->(:Partido)` + `(:Evento)-[:INVOLUCRA]->(:Jugador)`).
3. **Estructuras principales diseñadas:**
   - Nodos `:Partido` (`32` partidos canónicos `F2030-001` a `F2030-032`), `:Sede` (`8` sedes), `:Equipo` (`64`), `:Jugador` y `:Evento` (`512` eventos en pruebas de carga).
   - Unicidad e índices sobre `Partido(id)`, `Sede(id)`, `Equipo(codigo)` y `Evento(id)`.
4. **Consultas principales que resuelve:**
   - `MATCH_QUERY`: recupera en un único patrón Cypher el partido, los códigos de selección local y visitante y todos los metadatos geográficos de la sede (`GET /partidos/:id`).
   - `EVENTS_QUERY`: recorre `(:Partido)<-[:OCURRE_EN]-(:Evento)-[:INVOLUCRA]->(:Jugador)` ordenado por `e.minuto, e.id` con `LIMIT` (`GET /partidos/:id/eventos`).
5. **Decisión de particionamiento / distribución:**
   - El grafo del torneo (`127` partidos en diseño final) tiene un tamaño compacto que cabe íntegramente en la memoria caché de página (*page cache*) de cada instancia Neo4j, evitando particionar el grafo (lo que introduciría *distributed graph traversals* de alta latencia). Se escala horizontalmente mediante réplicas de lectura completas (*Read Replicas*).
6. **Estrategia de replicación, consistencia y trade-off:**
   - **Neo4j Causal Clustering** (3 servidores primarios Raft + múltiples *Read Replicas* por región). Las escrituras de eventos oficiales usan *causal chaining* (bookmarks) y las lecturas masivas del público se distribuyen en las réplicas de solo lectura.
7. **Evidencia concreta del repositorio:**
   - Scripts Cypher en [`neo4j/`](../../neo4j/), servicio en [`hito-10-api/`](../../hito-10-api/), pruebas de conectividad Bolt en [`hito-11-conectividad/`](../../hito-11-conectividad/) y prueba controlada de falla/recuperación del motor de grafo en [`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md).
8. **Métricas observadas (Hitos 11, 12 y 13):**
   - **Hito 12 (Línea Base):** Neo4j fue el cuello de botella primario bajo concurrencia (`p95 = 21,98 ms`, `p99 = 34,90 ms` sobre `9.546` consultas Cypher en `16 s`).
   - **Hito 12 (Optimizado):** al proteger Neo4j con la caché Read-Aside en Redis (`O2`) y ajustar el pool de conexiones (`25`), las consultas a Neo4j bajaron de `9.546` a `332` (`-96,52%`) y su latencia `p95` bajó a `8,27 ms` (`-62,37%`).
   - **Hito 13:** la prueba controlada (`RF10`) demuestra que ante la caída de Neo4j (`fixture2030_component_up{component="neo4j"} == 0`), la API responde determinísticamente con `HTTP 503 DEPENDENCY_UNAVAILABLE` y dispara `Fixture2030MotorPoliglotaInaccesible` en Prometheus.
9. **Debilidad, costo o limitación:** Mayor costo de CPU y latencia por operación individual frente a motores clave-valor o documentales simples cuando se somete a miles de lecturas repetitivas por segundo sobre el mismo nodo caliente.
10. **Por qué otra base del proyecto no sería mejor:** Representar traversals de múltiples saltos (camino de clasificación de una selección, sedes compartidas, cruces de llaves y actores involucrados en eventos) en **Cassandra** o **Redis** exigiría mantener múltiples tablas desnormalizadas sincronizadas manualmente.

---

### 2.3. Apache Cassandra (`5.0`) — Modelo Columnar Distribuido (`Wide-Column`)

1. **Responsabilidades que absorbe:** Almacenamiento y consulta particionada de alta velocidad de escritura/lectura para eventos de partidos por clave de partición (`eventos_por_partido`), historial de partidos por selección (`partidos_por_equipo`) y comentarios paginados por partido (`comentarios_por_partido`).
2. **Por qué el modelo columnar es adecuado:** Modela tablas orientadas exactamente a cada patrón de consulta (*query-driven modeling*), garantizando que todos los eventos o comentarios de un partido se almacenen contiguos en disco ordenados por su *clustering key* (`minuto`, `evento_id`, `fecha_creacion`).
3. **Estructuras principales diseñadas:**
   - Keyspace `fixture2030` en [`cassandra/`](../../cassandra/).
   - Tablas con `PARTITION KEY (partido_id)` y `CLUSTERING KEY (minuto ASC, evento_id ASC)` o `(fecha_creacion DESC, comentario_id ASC)` para lecturas secuenciales en una sola partición.
4. **Consultas principales que resuelve:**
   - Lectura lineal de la cronología de un partido (`SELECT ... FROM eventos_por_partido WHERE partido_id = ?`).
   - Paginación eficiente por cursor sobre comentarios o eventos de un partido sin `OFFSET` costoso.
5. **Decisión de particionamiento / distribución:**
   - Particionamiento por `partido_id` (y por `(partido_id, bucket_hora)` en comentarios de partidos con millones de interacciones para evitar *wide partitions* excesivas), distribuido mediante *consistent hashing* (`Murmur3Partitioner`) a lo largo del anillo.
6. **Estrategia de replicación, consistencia y trade-off:**
   - En producción multi-región: `NetworkTopologyStrategy` con factor de replicación `RF = 3` por datacenter, operando con `LOCAL_QUORUM` en lectura y escritura (`R + W > RF`), logrando consistencia fuerte local sin pagar latencia intercontinental en cada escritura. En laboratorio local (`compose.yaml`): `SimpleStrategy` con `RF = 1`.
7. **Evidencia concreta del repositorio:**
   - Esquema CQL y consultas en [`cassandra/`](../../cassandra/), adaptador en [`hito-10-api/`](../../hito-10-api/) y validación nativa con `cassandra-driver` en [`hito-11-conectividad/scripts/prueba_clientes_nativos.ts`](../../hito-11-conectividad/scripts/prueba_clientes_nativos.ts).
8. **Métricas observadas (Hitos 11, 12 y 13):**
   - **Hito 11:** validación exitosa de puerto TCP `9042` y consultas CQL nativas.
   - **Hito 13:** monitoreado mediante sonda TCP informativa (`fixture2030_component_up{component="cassandra",monitored_mode="tcp_socket_probe"}`), documentando honestamente que el contenedor permanece detenido por defecto en las corridas locales de Hito 12/13 debido a su huella base de RAM JVM (`~1,8 GiB`).
9. **Debilidad, costo o limitación:** Elevado consumo base de memoria JVM en entornos locales y prohibición de consultas ad-hoc sin `PARTITION KEY` (`ALLOW FILTERING` es un anti-patrón en producción).
10. **Por qué otra base del proyecto no sería mejor:** Para ingesta masiva de comentarios o eventos particionados con replicación maestro-a-maestro (*leaderless*) entre continentes, **MongoDB** y **Neo4j** tienen un único nodo primario de escritura por partición/grafo, mientras que **Cassandra** acepta escrituras en cualquier nodo coordinador sin punto único de fallo.

---

### 2.4. Redis (`7.2`) — Modelo Clave-Valor en Memoria

1. **Responsabilidades que absorbe:**
   - Gestión de sesiones autenticadas (`HASH` con renovación atómica Lua y ventana de throttling `O3`).
   - Caché **Read-Aside (`O2`)** de lecturas frecuentes de partidos (`partido:<id>`), planteles (`plantel:<codigo>:<page>:<limit>`) y eventos (`eventos:<id>:<limit>`).
2. **Por qué el modelo clave-valor en memoria es adecuado:** Ambas responsabilidades requieren complejidad algorítmica $O(1)$, latencia sub-milisegundo en RAM y expiración automática nativa por clave (`TTL` / `PTTL` / `EXPIRE`).
3. **Estructuras principales diseñadas:**
   - **Sesiones (`HASH`):** clave `fixture2030:h10:<scope>:sesion:<tokenDigest>` con campos `sesion_id`, `usuario_id`, `username`, `rol`, `estado_acceso`, `creada_en`, `ultima_actividad` y TTL de `1.800 s`.
   - **Caché Read-Aside (`STRING` JSON con `EX`):** claves prefijadas `fixture2030:h12:cache:*` / `fixture2030:h13:cache:*` con TTLs diferenciados según volatilidad (`120 s` partidos, `300 s` equipos/planteles, `15 s` eventos en vivo).
4. **Consultas principales que resuelve:**
   - Script Lua atómico `READ_AND_RENEW_SESSION_THROTTLED` (`EVAL`) ejecutado en el hook de autenticación de cada solicitud protegida.
   - `GET` y `SET ... EX` en el flujo Read-Aside antes de consultar Neo4j o MongoDB.
5. **Decisión de particionamiento / distribución:**
   - En producción: **Redis Cluster** con `16.384` *hash slots* distribuidos entre shards primarios, separando lógicamente el clúster de sesiones (sin desalojo, `noeviction`) del clúster de caché (`allkeys-lru`).
6. **Estrategia de replicación, consistencia y trade-off:**
   - Replicación asíncrona Primario-Réplica con **Redis Sentinel / Cluster failover**. Trade-off: ante caída abrupta del primario podría perderse una ventana de milisegundos de renovaciones de TTL o entradas de caché, lo cual es perfectamente tolerable porque la caché se reconstruye desde Neo4j/MongoDB y la sesión tiene ventana de `30 min`.
7. **Evidencia concreta del repositorio:**
   - Diseño en [`redis/`](../../redis/), pruebas de expiración de sesión en [`hito-10-api/tests/integration/redis-session.test.ts`](../../hito-10-api/tests/integration/redis-session.test.ts), optimizaciones `O2` y `O3` en [`hito-12-carga-optimizacion/scripts/servidor_optimizado.ts`](../../hito-12-carga-optimizacion/scripts/servidor_optimizado.ts) y exporter en [`hito-13-monitoreo/docker-compose.yml`](../docker-compose.yml).
8. **Métricas observadas (Hitos 11, 12 y 13):**
   - **Hito 12:** el `Cache Hit Ratio` alcanzó **`99,36%`** (`113.261` hits sobre `113.994` lecturas) con latencia `p95 = 1,45 ms`; el throttling de sesiones (`O3`) ahorró **`113.974` escrituras (`99,98%`)** en Redis (`HSET + EXPIRE`).
   - **Hito 13:** monitoreado simultáneamente mediante `redis_exporter` (`redis_memory_used_bytes`, `redis_connected_clients`) y métricas de aplicación (`fixture2030_cache_events_total`, `fixture2030_session_renewals_total`).
9. **Debilidad, costo o limitación:** El almacenamiento reside en RAM (mayor costo por GiB) y no ofrece consultas relacionales ni traversals de grafos; si los TTLs se configuran demasiado largos en eventos en vivo, el usuario vería datos desactualizados (*stale data*).
10. **Por qué otra base del proyecto no sería mejor:** Ningún motor basado en disco (**MongoDB**, **Neo4j**, **Cassandra**, **IRIS**) puede igualar el tiempo de respuesta en memoria de **Redis** (`~0,5–1,4 ms` `p95`) ni absorber `> 7.000 req/s` en un único hilo sin contención de I/O.

---

### 2.5. InfluxDB 3 Core (`3.x`) — Modelo de Series Temporales (`TSDB`)

1. **Responsabilidades que absorbe:** Ingesta y agregación temporal de telemetría IoT de estadios (temperatura ambiente, humedad del césped, ruido en decibeles, consumo energético y métricas biométricas/ambientales durante los partidos).
2. **Por qué el modelo de series temporales es adecuado:** Los datos de sensores llegan ordenados por `timestamp` de forma continua (*append-only*) y se consultan casi exclusivamente por rangos de tiempo (`WHERE time >= ... AND time <= ...`) agrupados por intervalos (`DATE_BIN` / ventanas de 1m, 5m, 15m).
3. **Estructuras principales diseñadas:**
   - Base de datos `fixture2030` en [`influxdb/`](../../influxdb/).
   - Mediciones (*measurements*) con **tags** indexados de baja cardinalidad (`sede_id`, `partido_id`, `tipo_sensor`) y **fields** numéricos (`temperatura_c`, `humedad_pct`, `ruido_db`, `indice_calor`).
4. **Consultas principales que resuelve:**
   - Agregaciones por ventana temporal (promedio, máximo y mínimo de temperatura/humedad por estadio durante un partido) mediante SQL/Flight en InfluxDB 3 (`/api/v3/query_sql`).
5. **Decisión de particionamiento / distribución:**
   - Particionamiento nativo por **intervalos de tiempo (chunks/parquet files por día)** y por etiqueta `sede_id`, permitiendo comprimir en formato columnar Apache Parquet los datos históricos y descartar bloques antiguos mediante políticas de retención (*Retention Policies*).
6. **Estrategia de replicación, consistencia y trade-off:**
   - Escritura desacoplada por lotes (*batching*) sobre almacenamiento de objetos replicado, priorizando disponibilidad de ingesta (`AP`) y compresión columnar sobre transacciones puntuales `ACID`.
7. **Evidencia concreta del repositorio:**
   - Scripts de ingesta Line Protocol y consultas en [`influxdb/`](../../influxdb/) y verificación nativa HTTP/SQL en [`hito-11-conectividad/scripts/prueba_clientes_nativos.ts`](../../hito-11-conectividad/scripts/prueba_clientes_nativos.ts).
8. **Métricas observadas (Hitos 11, 12 y 13):**
   - **Hito 11:** validación funcional del endpoint `/health` y consultas SQL sobre series temporales en el puerto `8181`.
   - **Hito 13:** sonda TCP informativa `fixture2030_component_up{component="influxdb",monitored_mode="tcp_socket_probe"}`.
9. **Debilidad, costo o limitación:** No está diseñado para actualizar registros individuales por clave primaria ni para modelar relaciones complejas entre entidades del torneo; alta cardinalidad en *tags* degrada el índice en memoria.
10. **Por qué otra base del proyecto no sería mejor:** Almacenar millones de muestras de sensores por segundo en **Neo4j** o **MongoDB** inflaría los índices B-Tree y carecería de la compresión columnar temporal y funciones nativas de *downsampling* de **InfluxDB 3**.

---

### 2.6. InterSystems IRIS (`Community`) — Modelo Multimodelo y Data Mart Analítico (OLAP / BI)

1. **Responsabilidades que absorbe:**
   - Persistencia multimodelo (objetos/documentos/SQL) para cambios de estado auditados.
   - **Data Mart Analítico del Torneo (Hito 8 y Hito 9):** modelo dimensional en estrella (`HechoPartido`, `HechoEventoMinuto`, `DimTiempo`, `DimSede`, `DimSeleccion`, `DimFase`) para reportes ejecutivos de la FIFA y tableros BI.
2. **Por qué el modelo multimodelo/analítico es adecuado:** Permite combinar el acceso transaccional de objetos (globals jerárquicos) con consultas SQL analíticas complejas (`GROUP BY CUBE/ROLLUP`, funciones de ventana, cruces entre múltiples dimensiones) sin impactar las bases operativas en vivo.
3. **Estructuras principales diseñadas:**
   - Esquema dimensional documentado en [`iris/`](../../iris/) y [`datamart/`](../../datamart/) con regla explícita de alineación temporal entre el reloj UTC (`DimTiempo`) y el minuto oficial de juego (`minuto_juego` + `minuto_adicion` por período `1T`, `2T`, `ET1`, `ET2`, `PEN`) para evitar *fan-out* al cruzar eventos deportivos con telemetría de sensores.
4. **Consultas principales que resuelve:**
   - Consultas BI multidimensionales: promedio de goles y tarjetas por confederación y fase, asistencia y condiciones climáticas promedio por sede, y comparativas históricas entre fases del torneo.
5. **Decisión de particionamiento / distribución:**
   - Separación física entre los nodos operativos (OLTP) y el servidor analítico IRIS (OLAP), alimentado mediante procesos **ETL/ELT por lotes al cierre de cada ventana o partido**, evitando contención en tiempo real.
6. **Estrategia de replicación, consistencia y trade-off:**
   - *IRIS Mirroring* (par Primario-Backup síncrono/asíncrono para alta disponibilidad del Data Mart) con **consistencia eventual diferida** respecto de los motores operativos (ventana de actualización ETL parametrizada), privilegiando la estabilidad de las consultas analíticas pesadas.
7. **Evidencia concreta del repositorio:**
   - Modelos y consultas en [`iris/`](../../iris/) y [`datamart/README.md`](../../datamart/README.md), conector nativo en [`hito-10-api/`](../../hito-10-api/) y prueba nativa en [`hito-11-conectividad/scripts/prueba_clientes_nativos.ts`](../../hito-11-conectividad/scripts/prueba_clientes_nativos.ts).
8. **Métricas observadas (Hitos 11, 12 y 13):**
   - **Hito 11:** validación del SuperServer (`:1972`) y operaciones nativas con `@intersystems/intersystems-iris-native`.
   - **Hito 13:** sonda TCP informativa `fixture2030_component_up{component="iris",monitored_mode="tcp_socket_probe"}`.
9. **Debilidad, costo o limitación:** Mayor complejidad de administración e integración de driver propietario; mantener el contenedor activo consume recursos significativos de disco y memoria en un entorno portátil.
10. **Por qué otra base del proyecto no sería mejor:** Ni **Redis**, ni **Cassandra**, ni **InfluxDB** soportan *joins* multidimensionales arbitrarios en estrella (`Fact` $\bowtie$ `DimSede` $\bowtie$ `DimSeleccion` $\bowtie$ `DimTiempo`) con semántica SQL analítica completa como **InterSystems IRIS**.

---

## 3. Relación entre los Modelos Operativos (OLTP) y el Data Mart Analítico (OLAP) (RF15)

La arquitectura separa estrictamente el **plano operativo en tiempo real (OLTP)** del **plano analítico (OLAP / Data Mart)**:

```
[ Usuarios / Apps FIFA 2030 ]
             │
             ▼ (HTTP / REST)
     [ API Fastify 5 ] ◄───► [ Prometheus + Grafana (Hito 13) ]
       /     │     \
      ▼      ▼      ▼
  [Redis] [Neo4j] [MongoDB]   (+ [Cassandra] eventos/comentarios, [InfluxDB] sensores IoT)
  (Caché/ (Grafo  (Equipos/
  Sesión) Torneo) Jugadores)
      \      │      /
       \     │     /  Extracción desacoplada (ETL / CDC por ventana de minuto UTC y minuto de juego)
        ▼    ▼    ▼
   [ InterSystems IRIS — Data Mart Dimensional (Hitos 8 y 9) ]
     (HechoPartido, DimSede, DimSeleccion, DimTiempo, BI / Reportes FIFA)
```

- **Por qué no se consulta el Data Mart desde el tráfico público en vivo:** Las consultas de los espectadores (`GET /partidos/:id`, `GET /equipos/:codigo/jugadores`) exigen latencias `p95 < 10 ms` y alta concurrencia, resueltas por **Redis + Neo4j + MongoDB**.
- **Por qué no se ejecutan reportes BI sobre Neo4j/MongoDB en vivo:** Un reporte analítico que cruce los 127 partidos con estadísticas agregadas de jugadores y promedios climáticos de InfluxDB escanearía colecciones completas, degradando el `p95` de los espectadores. El Data Mart en **IRIS** consolida e indexa esas dimensiones fuera del camino crítico.

---

## 4. Propuestas de Mejora Basadas en la Evidencia Recolectada (RF14)

A partir de las mediciones reales de los **Hitos 11, 12 y 13**, se proponen **4 mejoras técnicas concretas** para la evolución productiva del sistema:

1. **Coalescencia de Peticiones Concurrentes (*Singleflight / Request Coalescing*) ante *Cache Miss*:**
   - **Evidencia que la motiva:** En el Hito 12 (`O2`) y en la Fase 2 del Hito 13, cuando expira o se invalida la llave de un partido caliente (`partido:F2030-001`), múltiples workers concurrentes detectan el *cache miss* simultáneamente y disparan consultas idénticas a Neo4j.
   - **Mejora propuesta:** Implementar un mapa en memoria de promesas en vuelo (`inFlightRequests: Map<string, Promise<unknown>>`) en la capa de caché de la API para que solo 1 petición consulte Neo4j/MongoDB y las demás esperen la misma promesa.
2. **Invalidación Dirigida por Eventos (*Write-Through / PubSub Invalidation*) para Eventos de Partido:**
   - **Evidencia que la motiva:** Actualmente `eventos:<id>:<limit>` utiliza un TTL corto de `15 s` para equilibrar frescura y carga sobre Neo4j (`Q7` en Hito 13).
   - **Mejora propuesta:** Cuando se inserte un nuevo gol o tarjeta en un partido en vivo, publicar un evento en un canal `REDIS PUB/SUB` (`fixture2030:invalidation`) que invalide inmediatamente la clave `eventos:<partidoId>:*`, permitiendo elevar el TTL seguro de `15 s` a `120 s`.
3. **Circuit Breaker Automático por Motor Políglota con Degradación Parcial (*Graceful Degradation*):**
   - **Evidencia que la motiva:** En la prueba controlada del Hito 13 (`RF10`), la caída de Neo4j provoca respuestas `HTTP 503` inmediatas en los *cache misses*.
   - **Mejora propuesta:** Incorporar un patrón *Circuit Breaker* con caché de respaldo de larga duración (*Stale-While-Revalidate* / *Stale-If-Error* en Redis) para que, si `fixture2030_component_up{component="neo4j"} == 0`, la API pueda servir la última versión conocida del partido con una cabecera `Warning: 110 - "Response is Stale"` en lugar de fallar con `503`.
4. **Exporters Dedicados para Motores Adicionales en Despliegue en Nube:**
   - **Evidencia que la motiva:** En el inventario del Hito 13 (`§5.1`), Redis cuenta con telemetría profunda de motor vía `redis_exporter`, mientras que MongoDB y Neo4j se observan mediante sondas activas e instrumentación de driver en la API.
   - **Mejora propuesta:** En un entorno de clúster dedicado (Kubernetes / Cloud), añadir `percona/mongodb_exporter` para observar métricas internas de WiredTiger y activar el endpoint Prometheus de **Neo4j Enterprise** para monitorear *page cache hits/misses* del grafo.
