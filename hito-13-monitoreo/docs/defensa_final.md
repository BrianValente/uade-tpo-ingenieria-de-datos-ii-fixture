# Defensa Técnica Final ante el Comité Evaluador de la FIFA — Hito 13 (§6, §11, RF13, RF16)

## 1. Respuesta a la Pregunta Central del Hito 13 (§1.1)

> **¿Por qué esta combinación de modelos, estructuras, estrategias de distribución y mecanismos de observabilidad resulta adecuada para el Fixture Mundial 2030 bajo las condiciones planteadas?**

La arquitectura de **Persistencia Políglota** diseñada para el **Fixture Mundial FIFA 2030** es adecuada porque alinea cada patrón de acceso y ciclo de vida del dato con el motor cuyo modelo matemático y físico minimiza la complejidad y la latencia:

1. **Adecuación de Modelos y Estructuras:**
   - **MongoDB (Documental)** encapsula los agregados jerárquicos de selecciones (`equipos`) y planteles (`jugadores` con índice cubierto `{ equipoCodigo: 1, posicion: 1, dorsal: 1 }`), resolviendo lecturas de plantillas y lotes `$in` sin *joins* relacionales.
   - **Neo4j (Grafo)** modela de forma nativa la red topológica del torneo (`(:Equipo)-[:DISPUTA]->(:Partido)-[:SE_JUEGA_EN]->(:Sede)` y `(:Evento)-[:OCURRE_EN]->(:Partido)`), resolviendo traversals que en tablas relacionales o documentales requerirían múltiples saltos de aplicación.
   - **Redis (Clave-Valor en Memoria)** absorbe en sub-milisegundos (`p95 = 1,45 ms`) el estado efímero de alta frecuencia: validación de sesiones con script Lua y ventana de throttling (`O3`, reduciendo un `99,98%` las escrituras de renovación) y caché **Read-Aside (`O2`)** con hit ratio de `99,36%` bajo distribución Pareto 80/20.
   - **Cassandra (Columnar)** provee particionamiento horizontal por `partido_id` con ordenamiento físico por *clustering key* para historiales masivos de eventos y comentarios sin nodo primario único.
   - **InfluxDB 3 (Series Temporales)** ingiere y agrega por ventanas de tiempo la telemetría IoT de estadios con compresión columnar temporal.
   - **InterSystems IRIS (Multimodelo / Data Mart)** aísla las consultas analíticas OLAP sobre el esquema estrella (`HechoPartido`, `DimSede`, `DimSeleccion`, `DimTiempo`) para que los reportes ejecutivos de la FIFA nunca compitan por recursos con el tráfico OLTP en vivo.
2. **Adecuación de Distribución y Consistencia (CAP / PACELC):**
   - El sistema combina **consistencia fuerte / causal** donde la integridad del torneo lo exige (actualización de resultados oficiales, planteles y sesiones autorizadas) con **consistencia eventual controlada por TTL** en las vistas de lectura pública masiva (`15 s` para eventos en vivo, `120 s` para ficha de partido, `300 s` para equipos) y **actualización diferida por ventana ETL** en el Data Mart analítico.
3. **Adecuación de la Observabilidad (Prometheus + Grafana):**
   - La instrumentación implementada en el **Hito 13** cierra el ciclo de ingeniería: permite observar simultáneamente la salud de infraestructura (`up`, memoria RSS/Heap, `redis_memory_used_bytes`) y la telemetría de aplicación por motor (`fixture2030_db_operation_duration_ms`, `fixture2030_cache_events_total`), detectando en menos de `15 s` la caída de un exporter o de un motor políglota (`HTTP 503`) y verificando su recuperación sin pérdida de datos.

---

## 2. Trazabilidad Transversal del Proyecto (Hitos 1 a 13)

| Etapa | Hitos | Artefacto / Directorio en el Repositorio | Aporte a la Arquitectura Final |
| :--- | :---: | :--- | :--- |
| **Diseño Conceptual y Dominio** | Hitos 1–2 | [`README.md`](../../README.md), [`datamart/`](../../datamart/) | Definición del dominio FIFA 2030, entidades maestras, eventos de partido y separación OLTP vs OLAP |
| **Modelos Operativos NoSQL** | Hitos 3–6 | [`mongodb/`](../../mongodb/), [`neo4j/`](../../neo4j/), [`cassandra/`](../../cassandra/), [`redis/`](../../redis/), [`influxdb/`](../../influxdb/) | Esquemas nativos, índices, restricciones de unicidad, particionamiento y consultas por motor |
| **Analítica y Multimodelo** | Hitos 8–9 | [`datamart/`](../../datamart/), [`iris/`](../../iris/) | Diseño del Data Mart dimensional en estrella, alineación temporal UTC vs minuto de juego e implementación en IRIS |
| **Integración en Aplicación** | Hito 10 | [`hito-10-api/`](../../hito-10-api/) | API REST en Fastify 5 + TypeScript + Zod + OpenAPI 3.0 integrando autenticación en Redis y lecturas compuestas |
| **Verificación de Conectividad** | Hito 11 | [`hito-11-conectividad/`](../../hito-11-conectividad/) | Pruebas reproducibles de puertos TCP, clientes nativos sobre los 6 motores y contrato de rutas HTTP (`262` variantes) |
| **Pruebas de Carga y Optimización** | Hito 12 | [`hito-12-carga-optimizacion/`](../../hito-12-carga-optimizacion/) | Escenario determinístico (`seed=203012`), aplicación de `O1 + O2 + O3`, reducción de `p95` en `-85,81%` y aumento de throughput en `+616,53%` |
| **Monitoreo y Defensa Final** | Hito 13 | [`hito-13-monitoreo/`](../) | Stack Prometheus + Redis Exporter + Grafana, 6 reglas de alerta, prueba controlada de falla/recuperación y defensa integral |

---

## 3. Respuestas a las 14 Preguntas del Comité Evaluador de la FIFA (§6.5, RF13)

### Pregunta 1: *¿Qué parte del sistema vive en cada base y por qué no vive en otra?*
- **MongoDB:** vive el maestro de `equipos` (`64`), `jugadores` (`1.536`) y `usuarios`. No vive en Neo4j ni Redis porque son documentos ricos con atributos anidados y filtros paginados por posición y dorsal.
- **Neo4j:** vive el grafo de `Partido`, `Sede` y `Evento` con sus relaciones `:DISPUTA`, `:SE_JUEGA_EN`, `:OCURRE_EN` e `:INVOLUCRA`. No vive en MongoDB ni Cassandra porque el valor reside en navegar relaciones entre fases, sedes y actores sin *joins* manuales.
- **Redis:** viven las sesiones (`sesion:<digest>`) y la caché Read-Aside (`cache:*`). No viven en motores de disco porque se consultan en cada request HTTP y requieren latencia `~1 ms` y expiración automática `TTL`.
- **Cassandra:** viven las tablas particionadas por consulta (`eventos_por_partido`, `comentarios_por_partido`). No viven en Redis por volumen histórico ni en Neo4j cuando se requiere escritura distribuida *leaderless* por clave de partición.
- **InfluxDB 3:** viven las series temporales de sensores de estadios. No viven en MongoDB/IRIS porque requieren ingesta *append-only* de alta frecuencia y compresión columnar por ventana de tiempo.
- **InterSystems IRIS:** vive el Data Mart dimensional (`HechoPartido` y dimensiones). No vive en las bases operativas para aislar las consultas OLAP pesadas del tráfico en vivo.
- **Respaldo:** [`docs/inventario_de_componentes.md`](inventario_de_componentes.md) y [`docs/decisiones_de_arquitectura.md`](decisiones_de_arquitectura.md).

### Pregunta 2: *¿Qué consulta concreta demuestra el valor de cada modelo?*
- **MongoDB:** `db.jugadores.find({ equipoCodigo: "ARG" }, { projection: PLAYER_PROJECTION }).sort({ posicion: 1, dorsal: 1 })` (índice compuesto cubierto en [`servidor_monitoreo.ts`](../scripts/servidor_monitoreo.ts)).
- **Neo4j:** `MATCH (local:Equipo)-[:DISPUTA {condicion: 'local'}]->(p:Partido {id: $id}) MATCH (visitante:Equipo)-[:DISPUTA {condicion: 'visitante'}]->(p) MATCH (p)-[:SE_JUEGA_EN]->(s:Sede) RETURN ...` ([`neo4j/`](../../neo4j/) y [`servidor_monitoreo.ts`](../scripts/servidor_monitoreo.ts)).
- **Cassandra:** `SELECT partido_id, minuto, evento_id, tipo, detalle FROM fixture2030.eventos_por_partido WHERE partido_id = 'F2030-001' ORDER BY minuto ASC` ([`cassandra/`](../../cassandra/)).
- **Redis:** script Lua atómico `READ_AND_RENEW_SESSION_THROTTLED` (`PTTL` + `HGET` + `HGETALL` condicional) en [`servidor_monitoreo.ts`](../scripts/servidor_monitoreo.ts).
- **InfluxDB 3:** `SELECT sede_id, AVG(temperatura_c), MAX(humedad_pct) FROM telemetria_estadio WHERE time >= ... GROUP BY sede_id` ([`influxdb/`](../../influxdb/)).
- **InterSystems IRIS:** consulta agregada sobre `HechoPartido` cruzando `DimSede`, `DimFase` y `DimSeleccion` ([`iris/`](../../iris/) y [`datamart/README.md`](../../datamart/README.md)).

### Pregunta 3: *¿Cómo se relacionan los datos entre bases cuando una operación necesita más de una fuente?*
- El caso paradigmático es **`GET /partidos/:id`** (ej. `/partidos/F2030-001`), que integra **3 motores en tiempo real**:
  1. **Redis (`auth` + `cache`):** valida el token Bearer en `fixture2030:h10:h12-bench:sesion:<digest>` y verifica si existe `partido:F2030-001` en caché.
  2. **Neo4j (`grafo`):** ante *cache miss*, obtiene la estructura del partido, la sede y los códigos ISO/FIFA de las selecciones (`homeCode = "ARG"`, `awayCode = "BRA"`).
  3. **MongoDB (`documental`):** utilizando la clave canónica compartida (`codigo`), recupera en un único lote `{ codigo: { $in: ["ARG", "BRA"] } }` los perfiles completos de ambas selecciones y almacena el resultado compuesto en Redis (`TTL = 120 s`).

### Pregunta 4: *¿Cómo decidieron las claves de partición, índices, TTL o estructuras de acceso?*
- **Claves de partición:** se eligieron por el predicado de igualdad obligatorio de las consultas críticas (`partido_id` en Cassandra, `equipoCodigo` proyectado en MongoDB, `sede_id` + `time` en InfluxDB).
- **Índices:** en MongoDB se diseñó `{ equipoCodigo: 1, posicion: 1, dorsal: 1 }` para resolver filtro y ordenamiento en un solo recorrido de árbol B (`IXSCAN` sin `SORT` en memoria). En Neo4j se indexaron `Partido(id)` y `Evento(id)`.
- **TTLs en Redis:** calibrados según la frecuencia de cambio de cada entidad: `15 s` para eventos de partido en curso, `120 s` para metadatos del partido, `300 s` para planteles/equipos y `1.800 s` para sesiones con renovación diferida cuando restan `< 1.740 s`.

### Pregunta 5: *¿Qué pasa si un partido genera un pico de lecturas o escrituras?*
- **Pico de lecturas (ej. final del Mundial o clásico `ARG vs BRA`):** el patrón **Read-Aside (`O2`)** en Redis absorbe más del `99%` de las lecturas repetidas en `~1,45 ms` (`p95`), aislando a Neo4j y MongoDB (demostrado en el Hito 12 donde el throughput subió de `992,99 req/s` a `7.115,07 req/s`).
- **Pico de escrituras (comentarios en vivo o telemetría):** las escrituras de alta frecuencia se dirigen a motores diseñados para ingesta particionada (*append-only* en Cassandra por `partido_id` e InfluxDB por ventana temporal), mientras el throttling Lua (`O3`) evita que las lecturas autenticadas se conviertan en tormentas de escrituras `HSET/EXPIRE` en Redis.

### Pregunta 6: *¿Qué pasa si una base o contenedor cae o responde lento?*
- **Si responde lento (`> 3.000 ms`):** los conectores tienen configurado un timeout estricto de `3.000 ms` (`DEPENDENCY_TIMEOUT_MS`); la petición se aborta controladamente devolviendo `HTTP 504 DEPENDENCY_TIMEOUT` sin bloquear indefinidamente el event loop de Fastify (validado en [`hito-10-api/tests/integration/timeouts.test.ts`](../../hito-10-api/tests/integration/timeouts.test.ts)).
- **Si cae un motor activo (ej. Neo4j en la prueba controlada `RF10`):** la sonda `fixture2030_component_up{component="neo4j"}` pasa a `0`, los *cache misses* devuelven `HTTP 503 DEPENDENCY_UNAVAILABLE` y Prometheus dispara las alertas críticas `Fixture2030MotorPoliglotaInaccesible` y `Fixture2030TasaErroresHttp5xxAlta` en `< 15 s` ([`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md)).

### Pregunta 7: *¿Qué sacrifican en consistencia, latencia, costo o simplicidad en cada caso?*
- **En Redis Cache (`O2`):** sacrificamos consistencia instantánea por una ventana acotada de eventualidad (`15 s` en eventos, `120 s` en partido) a cambio de reducir la latencia `p95` un `85,8%`.
- **En Throttling de Sesiones (`O3`):** sacrificamos una precisión de segundo exacto en `ultima_actividad` (actualizándola cada `60 s`) a cambio de eliminar el `99,98%` de escrituras en Redis.
- **En la Arquitectura Políglota general:** sacrificamos la simplicidad operativa de tener un único motor monolítico a cambio de especialización funcional, aislamiento de fallas y escalabilidad independiente por tipo de carga.

### Pregunta 8: *¿Por qué el Data Mart está separado de las bases operativas?*
- Porque las cargas **OLTP** (miles de espectadores consultando un partido puntual en `< 5 ms`) y las cargas **OLAP** (consultas multidimensionales de negocio que escanean hechos históricos, sedes, fases y telemetría agregada) tienen perfiles de I/O opuestos. Separar el Data Mart en **InterSystems IRIS** garantiza que ningún reporte analítico de la FIFA degrade la experiencia en vivo del torneo (RF15).

### Pregunta 9: *¿Qué evidencia de Hito 11 demuestra conectividad real?*
- El reporte [`hito-11-conectividad/evidencia/resumen_ejecucion.md`](../../hito-11-conectividad/evidencia/resumen_ejecucion.md) y los JSON en `hito-11-conectividad/evidencia/` demuestran:
  1. Conectividad de sockets TCP sobre los 6 motores (`MongoDB:27017`, `Neo4j:7687`, `Cassandra:9042`, `Redis:6379`, `InfluxDB:8181`, `IRIS:1972`).
  2. Ejecución de lecturas/escrituras con los 6 drivers/clientes nativos.
  3. Verificación exhaustiva de las `262` rutas/variantes del contrato HTTP de la API.

### Pregunta 10: *¿Qué evidencia de Hito 12 demuestra comportamiento bajo carga y mejora?*
- Los artefactos [`hito-12-carga-optimizacion/resultados/linea_base.json`](../../hito-12-carga-optimizacion/resultados/linea_base.json), [`resultados/optimizado.json`](../../hito-12-carga-optimizacion/resultados/optimizado.json) y [`docs/comparacion_antes_despues.md`](../../hito-12-carga-optimizacion/docs/comparacion_antes_despues.md) muestran, sobre dos ventanas equivalentes de `~16,05 s` con `24` usuarios virtuales y `0%` de errores:
  - **Throughput:** de `992,99 req/s` (`15.971` ops) a **`7.115,07 req/s`** (`114.047` ops, **`+616,53%`**).
  - **Latencia `p95` global:** de `24,52 ms` a **`3,48 ms`** (**`-85,81%`**).
  - **Latencia `p99` global:** de `36,24 ms` a **`5,38 ms`** (**`-85,15%`**).

### Pregunta 11: *¿Qué evidencia de Hito 13 demuestra monitoreo y observabilidad?*
- Los artefactos en [`hito-13-monitoreo/evidencia/`](../evidencia/):
  - [`prometheus_targets.md`](../evidencia/prometheus_targets.md): 3 targets (`prometheus`, `fixture2030_api`, `redis_exporter`) en estado `UP (1)` y 6 reglas de alerta cargadas.
  - [`resultados_sin_secretos/consultas_promql_observadas.md`](../evidencia/resultados_sin_secretos/consultas_promql_observadas.md): 8 consultas PromQL ejecutadas contra `/api/v1/query` con datos reales.
  - [`dashboards/resumen_dashboard_observado.md`](../evidencia/dashboards/resumen_dashboard_observado.md): verificación de Grafana (`11.5.2`), datasource aprovisionado y los 9 paneles del dashboard [`fixture2030_observabilidad.json`](../grafana/dashboards/fixture2030_observabilidad.json).
  - [`prueba_de_falla.md`](../evidencia/prueba_de_falla.md): prueba controlada en 3 fases demostrando detección de caída (`up == 0`, `HTTP 503`, alertas `FIRING`) y recuperación completa (`UP`, `HTTP 200`).

### Pregunta 12: *¿Qué diferencia hay entre lo implementado en laboratorio y una arquitectura de producción para 2030?*
- En laboratorio todos los contenedores corren en un único host (`single-node`, `RF = 1`, red loopback) sobre un subconjunto canónico (`32` partidos, `64` selecciones). En producción para el Mundial 2030 (`127` partidos en 3 continentes), los mismos esquemas y patrones de acceso se despliegan en clústeres multi-región (`Replica Sets` en MongoDB, `Causal Clustering` en Neo4j, `NetworkTopologyStrategy RF=3` en Cassandra, `Redis Cluster`) con exporters dedicados por nodo y Alertmanager conectado a guardias SRE ([`docs/limitaciones_y_evidencia.md`](limitaciones_y_evidencia.md)).

### Pregunta 13: *¿Qué cambiarían si tuvieran que rehacer una decisión técnica del proyecto?*
- Incorporaríamos desde el **Hito 10** la instrumentación nativa de métricas Prometheus (`/metrics`) y las proyecciones explícitas BSON + índices compuestos (`O1` del Hito 12), en lugar de agregarlos en las etapas de optimización y monitoreo. Asimismo, implementaríamos *Request Coalescing (Singleflight)* en la capa de caché para evitar que múltiples peticiones concurrentes golpeen Neo4j simultáneamente cuando expira el TTL de un partido caliente.

### Pregunta 14: *¿Qué métrica mirarían primero durante un partido en vivo del Mundial 2030?*
- Miraríamos en primer lugar el par compuesto por:
  1. **Tasa de errores HTTP `5xx` y disponibilidad de sondas activas** (`Fixture2030TasaErroresHttp5xxAlta` y `fixture2030_component_up{monitored_mode="active_probe"}`), porque indica impacto inmediato sobre los espectadores.
  2. **Percentil 95 de latencia HTTP junto con el `Cache Hit Ratio` de Redis** (`histogram_quantile(0.95, ...)` y `Q7`), porque una caída repentina en el Hit Ratio es el indicador adelantado (*leading indicator*) de que Neo4j y MongoDB están por recibir una avalancha de lecturas directas.
