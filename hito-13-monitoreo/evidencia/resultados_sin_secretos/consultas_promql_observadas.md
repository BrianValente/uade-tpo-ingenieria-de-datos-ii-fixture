# Consultas PromQL Observadas (Sin Secretos) — Hito 13

## 1. Metadatos de Ejecución (RF8, RNF2, RNF6)

- **Fecha UTC:** `2026-11-06T18:45:37.672Z`
- **Commit Git:** `cd653d6` (rama `fix/hito13-complete`, árbol `clean`)
- **Endpoint Consultado:** `http://127.0.0.1:9090/api/v1/query`

## 2. Resumen Tabular de Consultas PromQL Ejecutadas

| ID | Métrica / Consulta | Categoría | Unidad | Ventana | Series | Muestra Principal Observada |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| `Q1` | Disponibilidad de targets raspados por Prometheus | `availability` | `booleano (1 = UP, 0 = DOWN)` | `instantánea (scrape_interval = 5s)` | 3 | `1.000 {instance="host.docker.internal:8013", job="fixture2030_api", layer="application-and-probes", ...}` |
| `Q2` | Disponibilidad de componentes políglotas activos (sondas de driver) | `availability` | `booleano (1 = ACTIVO, 0 = CAÍDO)` | `instantánea (5s)` | 4 | `1.000 {component="api-fastify", instance="host.docker.internal:8013", job="fixture2030_api", ...}` |
| `Q3` | Latencia HTTP p95 global de la API en ventana móvil de 1m | `latency` | `milisegundos (ms)` | `1m (rate)` | 1 | `10.603 {}` |
| `Q4` | Comparación de latencia p95 por motor de base de datos | `latency` | `milisegundos (ms)` | `1m (rate)` | 4 | `2.345 {engine="redis_session"}` |
| `Q5` | Throughput HTTP por plantilla de ruta y clase de estado | `throughput` | `solicitudes por segundo (req/s)` | `1m (rate)` | 4 | `2.074 {route="/partidos/:id", status_class="2xx"}` |
| `Q6` | Volumen de operaciones por segundo en cada base de datos | `throughput` | `operaciones por segundo (ops/s)` | `1m (rate)` | 8 | `0.249 {engine="mongodb", operation="team"}` |
| `Q7` | Cache Hit Ratio en Redis Read-Aside | `cache` | `proporción (0.0 a 1.0)` | `1m (rate)` | 1 | `0.830 {}` |
| `Q8` | Memoria utilizada por Redis y RSS del proceso Node.js | `resources` | `bytes` | `instantánea (5s)` | 2 | `2271288.000 {instance="redis-exporter:9121", job="redis_exporter", layer="database-exporter", ...}` |

## 3. Detalle de Expresiones y Resultados Reales

### Q1 — Disponibilidad de targets raspados por Prometheus

- **Expresión PromQL:** `up`
- **Qué mide:** Mide si cada exporter o servicio objetivo (prometheus, fixture2030_api, redis_exporter) respondió exitosamente al último scrape HTTP.
- **Unidad:** `booleano (1 = UP, 0 = DOWN)` | **Ventana:** `instantánea (scrape_interval = 5s)`
- **Series devueltas por Prometheus:** `3`

| Etiquetas (`metric`) | Valor Observado |
| :--- | ---: |
| `{"__name__":"up","instance":"host.docker.internal:8013","job":"fixture2030_api","layer":"application-and-probes","service_target":"api-fastify"}` | `1.0000` |
| `{"__name__":"up","instance":"localhost:9090","job":"prometheus","layer":"observability","service_target":"prometheus"}` | `1.0000` |
| `{"__name__":"up","instance":"redis-exporter:9121","job":"redis_exporter","layer":"database-exporter","service_target":"redis"}` | `1.0000` |

### Q2 — Disponibilidad de componentes políglotas activos (sondas de driver)

- **Expresión PromQL:** `fixture2030_component_up{monitored_mode="active_probe"}`
- **Qué mide:** Verifica en tiempo real la conectividad de la API con los tres motores activos del flujo integrado (MongoDB ping:1, Neo4j RETURN 1 y Redis PING).
- **Unidad:** `booleano (1 = ACTIVO, 0 = CAÍDO)` | **Ventana:** `instantánea (5s)`
- **Series devueltas por Prometheus:** `4`

| Etiquetas (`metric`) | Valor Observado |
| :--- | ---: |
| `{"__name__":"fixture2030_component_up","component":"api-fastify","instance":"host.docker.internal:8013","job":"fixture2030_api","layer":"application-and-probes","model":"api-rest","monitored_mode":"active_probe","role":"integracion-poliglota","service_target":"api-fastify"}` | `1.0000` |
| `{"__name__":"fixture2030_component_up","component":"mongodb","instance":"host.docker.internal:8013","job":"fixture2030_api","layer":"application-and-probes","model":"documental","monitored_mode":"active_probe","role":"equipos-jugadores-auditoria","service_target":"api-fastify"}` | `1.0000` |
| `{"__name__":"fixture2030_component_up","component":"neo4j","instance":"host.docker.internal:8013","job":"fixture2030_api","layer":"application-and-probes","model":"grafo","monitored_mode":"active_probe","role":"fixture-sedes-eventos","service_target":"api-fastify"}` | `1.0000` |
| `{"__name__":"fixture2030_component_up","component":"redis","instance":"host.docker.internal:8013","job":"fixture2030_api","layer":"application-and-probes","model":"clave-valor","monitored_mode":"active_probe","role":"sesiones-y-cache","service_target":"api-fastify"}` | `1.0000` |

### Q3 — Latencia HTTP p95 global de la API en ventana móvil de 1m

- **Expresión PromQL:** `histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))`
- **Qué mide:** Calcula el percentil 95 de tiempo de respuesta HTTP extremo a extremo en la capa Fastify a partir de los buckets del histograma.
- **Unidad:** `milisegundos (ms)` | **Ventana:** `1m (rate)`
- **Series devueltas por Prometheus:** `1`

| Etiquetas (`metric`) | Valor Observado |
| :--- | ---: |
| `{}` | `10.6035` |

### Q4 — Comparación de latencia p95 por motor de base de datos

- **Expresión PromQL:** `histogram_quantile(0.95, sum by (le, engine) (rate(fixture2030_db_operation_duration_ms_bucket[1m])))`
- **Qué mide:** Compara el percentil 95 de latencia de las operaciones ejecutadas sobre MongoDB, Neo4j, Redis Session y Redis Cache.
- **Unidad:** `milisegundos (ms)` | **Ventana:** `1m (rate)`
- **Series devueltas por Prometheus:** `4`

| Etiquetas (`metric`) | Valor Observado |
| :--- | ---: |
| `{"engine":"redis_session"}` | `2.3448` |
| `{"engine":"redis_cache"}` | `2.4361` |
| `{"engine":"mongodb"}` | `20.1250` |
| `{"engine":"neo4j"}` | `4.8393` |

### Q5 — Throughput HTTP por plantilla de ruta y clase de estado

- **Expresión PromQL:** `sum by (route, status_class) (rate(fixture2030_http_requests_total[1m]))`
- **Qué mide:** Mide el volumen de tráfico procesado por cada endpoint de la API desglosado por código de estado (2xx, 4xx, 5xx).
- **Unidad:** `solicitudes por segundo (req/s)` | **Ventana:** `1m (rate)`
- **Series devueltas por Prometheus:** `4`

| Etiquetas (`metric`) | Valor Observado |
| :--- | ---: |
| `{"route":"/partidos/:id","status_class":"2xx"}` | `2.0737` |
| `{"route":"/equipos/:codigo","status_class":"2xx"}` | `0.3314` |
| `{"route":"/equipos/:codigo/jugadores","status_class":"2xx"}` | `1.3256` |
| `{"route":"/partidos/:id/eventos","status_class":"2xx"}` | `0.6628` |

### Q6 — Volumen de operaciones por segundo en cada base de datos

- **Expresión PromQL:** `sum by (engine, operation) (rate(fixture2030_db_operations_total[1m]))`
- **Qué mide:** Permite contrastar la carga de lecturas absorbida por Redis (caché y sesiones) frente a las consultas que llegan a MongoDB y Neo4j.
- **Unidad:** `operaciones por segundo (ops/s)` | **Ventana:** `1m (rate)`
- **Series devueltas por Prometheus:** `8`

| Etiquetas (`metric`) | Valor Observado |
| :--- | ---: |
| `{"engine":"mongodb","operation":"team"}` | `0.2489` |
| `{"engine":"neo4j","operation":"match"}` | `0.4148` |
| `{"engine":"redis_session","operation":"readAndRenew"}` | `4.9772` |
| `{"engine":"redis_cache","operation":"get"}` | `4.9772` |
| `{"engine":"redis_cache","operation":"setex"}` | `0.5303` |
| `{"engine":"mongodb","operation":"players"}` | `0.0994` |

### Q7 — Cache Hit Ratio en Redis Read-Aside

- **Expresión PromQL:** `sum(rate(fixture2030_cache_events_total{result="hit"}[1m])) / clamp_min(sum(rate(fixture2030_cache_events_total{result=~"hit|miss"}[1m])), 0.001)`
- **Qué mide:** Mide la proporción de lecturas de partidos, eventos y equipos resueltas directamente desde Redis sin impactar Neo4j ni MongoDB.
- **Unidad:** `proporción (0.0 a 1.0)` | **Ventana:** `1m (rate)`
- **Series devueltas por Prometheus:** `1`

| Etiquetas (`metric`) | Valor Observado |
| :--- | ---: |
| `{}` | `0.8298` |

### Q8 — Memoria utilizada por Redis y RSS del proceso Node.js

- **Expresión PromQL:** `redis_memory_used_bytes or process_resident_memory_bytes{job="fixture2030_api"}`
- **Qué mide:** Monitorea la huella de memoria de infraestructura tanto en el motor clave-valor (vía redis_exporter) como en el servidor de aplicación Node.js.
- **Unidad:** `bytes` | **Ventana:** `instantánea (5s)`
- **Series devueltas por Prometheus:** `2`

| Etiquetas (`metric`) | Valor Observado |
| :--- | ---: |
| `{"__name__":"redis_memory_used_bytes","instance":"redis-exporter:9121","job":"redis_exporter","layer":"database-exporter","service_target":"redis"}` | `2271288.0000` |
| `{"__name__":"process_resident_memory_bytes","instance":"host.docker.internal:8013","job":"fixture2030_api","layer":"application-and-probes","service_target":"api-fastify"}` | `301584384.0000` |

