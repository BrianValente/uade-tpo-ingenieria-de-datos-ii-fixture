# Configuración de Prometheus, Targets y Catálogo de Consultas PromQL — Hito 13

## 1. Configuración de Recolección en Prometheus (RF2, RF3)

El archivo [`hito-13-monitoreo/prometheus.yml`](../prometheus.yml) define una topología de recolección de alta frecuencia adaptada a pruebas de laboratorio e inyección controlada de fallas:

- **`global.scrape_interval: 5s`**: Prometheus raspa cada target cada 5 segundos, permitiendo detectar caídas y recuperaciones con granularidad fina.
- **`global.scrape_timeout: 4s`**: evita solapamiento entre raspados si un endpoint tarda en responder.
- **`global.evaluation_interval: 5s`**: evalúa las 6 reglas de alerta de [`prometheus/reglas-o-alertas.yml`](../prometheus/reglas-o-alertas.yml) cada 5 segundos.

### Jobs configurados en `scrape_configs`

| Job (`job_name`) | Target (`targets`) | Ruta | Etiquetas Fijas (`labels`) | Propósito Técnico |
| :--- | :--- | :---: | :--- | :--- |
| `prometheus` | `localhost:9090` | `/metrics` | `service_target="prometheus"`, `layer="observability"` | Salud interna del motor TSDB de Prometheus |
| `fixture2030_api` | `host.docker.internal:8013` | `/metrics` | `service_target="api-fastify"`, `layer="application-and-probes"` | Métricas HTTP, histogramas por motor (`mongodb`, `neo4j`, `redis_*`), caché, sesiones, proceso Node.js y sondas `fixture2030_component_up` |
| `redis_exporter` | `redis-exporter:9121` | `/metrics` | `service_target="redis"`, `layer="database-exporter"` | Telemetría interna del contenedor `fixture-redis` (`6379`) mediante `oliver006/redis_exporter:v1.67.0` |

---

## 2. Protocolo de Verificación de Targets `UP` y `DOWN` (RF2, RF3, RF10)

El script [`scripts/verificar_targets.ts`](../scripts/verificar_targets.ts) consulta la API HTTP de Prometheus (`/api/v1/targets`, `/api/v1/rules` y `/api/v1/query`) y genera evidencia estructurada en [`evidencia/prometheus_targets.json`](../evidencia/prometheus_targets.json) y [`evidencia/prometheus_targets.md`](../evidencia/prometheus_targets.md):

1. **Estado Normal (`UP`)**: los 3 jobs (`fixture2030_api`, `prometheus`, `redis_exporter`) reportan `health: "up"` (`up == 1`) y las 4 sondas activas (`api-fastify`, `mongodb`, `neo4j`, `redis`) reportan `fixture2030_component_up == 1`.
2. **Estado Degradado (`DOWN`)**: durante la prueba controlada ([`scripts/ejecutar_prueba_controlada.ts`](../scripts/ejecutar_prueba_controlada.ts)), se detiene temporalmente `redis-exporter` y se activa la indisponibilidad controlada de `neo4j`, verificando que Prometheus marque `up{job="redis_exporter"} == 0` (`health: "down"`) y `fixture2030_component_up{component="neo4j"} == 0`.
3. **Recuperación (`UP`)**: al reiniciar `redis-exporter` y restaurar el conector de `neo4j`, ambos indicadores regresan a `1` sin pérdida de datos.

---

## 3. Catálogo de Consultas PromQL Explicadas (RF4, RF8, RNF9)

Se documentan y ejecutan **8 consultas PromQL** (superando el mínimo de 5 exigido por **RF8**), cubriendo disponibilidad, latencia, throughput, eficiencia de caché y recursos de infraestructura. Los resultados observados sin secretos se encuentran en [`evidencia/resultados_sin_secretos/consultas_promql_observadas.md`](../evidencia/resultados_sin_secretos/consultas_promql_observadas.md).

### `Q1` — Disponibilidad de targets raspados por Prometheus
- **Expresión PromQL:**
  ```promql
  up
  ```
- **Qué mide:** estado booleano de recolección de cada target configurado en `prometheus.yml`.
- **Unidad:** booleano (`1 = UP`, `0 = DOWN`).
- **Ventana temporal:** instantánea (actualizada cada `scrape_interval = 5s`).
- **Interpretación operativa:** cualquier serie con valor `0` indica que el proceso o exporter dejó de responder HTTP o rechazó la conexión TCP. En la corrida observada, los 3 targets (`fixture2030_api`, `redis_exporter`, `prometheus`) devolvieron `1.0000`.

### `Q2` — Disponibilidad de componentes políglotas activos (sondas de driver)
- **Expresión PromQL:**
  ```promql
  fixture2030_component_up{monitored_mode="active_probe"}
  ```
- **Qué mide:** conectividad real extremo a extremo entre la API Fastify y los motores del flujo crítico (`mongodb`, `neo4j`, `redis` y `api-fastify`).
- **Unidad:** booleano (`1 = ACTIVO`, `0 = CAÍDO`).
- **Ventana temporal:** instantánea (sonda ejecutada cada `2s`, raspada cada `5s`).
- **Interpretación operativa:** permite detectar fallas de autenticación, caída de contenedor o bloqueo del protocolo Bolt/Wire/RESP incluso si el proceso Node.js de la API sigue vivo (`up{job="fixture2030_api"} == 1`).

### `Q3` — Latencia HTTP `p95` global de la API en ventana móvil de 1 minuto
- **Expresión PromQL:**
  ```promql
  histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))
  ```
- **Qué mide:** el percentil 95 de duración de las solicitudes HTTP procesadas por Fastify.
- **Unidad:** milisegundos (`ms`).
- **Ventana temporal:** tasa móvil de `1m`.
- **Interpretación operativa:** resume la experiencia del 95% de las peticiones sin distorsión por valores atípicos aislados. Durante la rafaga inicial de calentamiento (`cold start` + poblamiento de caché) se observó `166,67 ms` (por debajo del umbral de alerta de `250 ms`), convergiendo a `< 70 ms` una vez caliente la caché Read-Aside (consistente con los `65,572 ms` medidos bajo carga sostenida en el Hito 12).

### `Q4` — Comparación de latencia `p95` por motor de base de datos
- **Expresión PromQL:**
  ```promql
  histogram_quantile(0.95, sum by (le, engine) (rate(fixture2030_db_operation_duration_ms_bucket[1m])))
  ```
- **Qué mide:** el percentil 95 de latencia de las operaciones de driver agrupadas por motor (`mongodb`, `neo4j`, `redis_session`, `redis_cache`).
- **Unidad:** milisegundos (`ms`).
- **Ventana temporal:** tasa móvil de `1m`.
- **Interpretación operativa:** demuestra cuantitativamente por qué Redis actúa como acelerador frontal: mientras `redis_cache` (`23,51 ms` en ventana de arranque) y `redis_session` (`50,00 ms`) operan en memoria, las lecturas de `miss` inicial a disco/red en `mongodb` (`231,25 ms`) y `neo4j` (`233,13 ms`) tienen un costo un orden de magnitud mayor.

### `Q5` — Throughput HTTP por plantilla de ruta y clase de estado
- **Expresión PromQL:**
  ```promql
  sum by (route, status_class) (rate(fixture2030_http_requests_total[1m]))
  ```
- **Qué mide:** la tasa de solicitudes por segundo (`req/s`) atendidas por cada endpoint (`/partidos/:id`, `/partidos/:id/eventos`, `/equipos/:codigo`, `/equipos/:codigo/jugadores`) separando respuestas exitosas (`2xx`), errores de cliente (`4xx`) y fallos de servidor/dependencia (`5xx`).
- **Unidad:** solicitudes por segundo (`req/s`).
- **Ventana temporal:** tasa móvil de `1m`.
- **Interpretación operativa:** refleja la distribución Pareto del tráfico del torneo (donde `/partidos/:id` y `/equipos/:codigo/jugadores` concentran la mayor demanda) y permite identificar inmediatamente qué ruta sufre degradación (`status_class="5xx"`).

### `Q6` — Volumen de operaciones por segundo en cada base de datos
- **Expresión PromQL:**
  ```promql
  sum by (engine, operation) (rate(fixture2030_db_operations_total[1m]))
  ```
- **Qué mide:** el caudal de operaciones por segundo (`ops/s`) ejecutadas sobre cada motor y tipo de operación (`readAndRenew`, `get`, `setex`, `match`, `events`, `team`, `players`, `matchTeamsBatch`).
- **Unidad:** operaciones por segundo (`ops/s`).
- **Ventana temporal:** tasa móvil de `1m`.
- **Interpretación operativa:** evidencia el efecto de escudo de Redis (`4,73 ops/s` en `redis_cache::get` y `4,73 ops/s` en `redis_session::readAndRenew`) frente a la fracción mínima de tráfico que llega a Neo4j (`0,37 ops/s` en `match`) y MongoDB (`0,20 ops/s` en `team` y `0,15 ops/s` en `matchTeamsBatch`).

### `Q7` — Cache Hit Ratio en Redis Read-Aside
- **Expresión PromQL:**
  ```promql
  sum(rate(fixture2030_cache_events_total{result="hit"}[1m])) / clamp_min(sum(rate(fixture2030_cache_events_total{result=~"hit|miss"}[1m])), 0.001)
  ```
- **Qué mide:** la proporción de lecturas de negocio resueltas directamente desde Redis (`hit / (hit + miss)`). El uso de `clamp_min(..., 0.001)` evita divisiones por cero (`NaN`) cuando no hay tráfico.
- **Unidad:** proporción (`0.0` a `1.0`, equivalente a `0%–100%`).
- **Ventana temporal:** tasa móvil de `1m`.
- **Interpretación operativa:** en la captura de calentamiento inicial de 120 peticiones alcanzó `0.8527` (`85,27%`, superando holgadamente el umbral mínimo de alerta de `0.70`), y bajo régimen estacionario en el benchmark del Hito 12 alcanzó `98,57%`.

### `Q8` — Memoria utilizada por Redis y RSS del proceso Node.js
- **Expresión PromQL:**
  ```promql
  redis_memory_used_bytes or process_resident_memory_bytes{job="fixture2030_api"}
  ```
- **Qué mide:** combina en una vista de infraestructura los bytes de RAM consumidos por Redis (reportados por `redis_exporter`) y la memoria física residente (RSS) del servidor Fastify.
- **Unidad:** `bytes`.
- **Ventana temporal:** instantánea (`5s`).
- **Interpretación operativa:** verifica la estabilidad de memoria durante las pruebas (`2,23 MB` en Redis y `80,40 MB` RSS en Node.js), descartando fugas de memoria (`memory leaks`) o saturación del buffer de caché.
