# Configuración de Prometheus, Métricas y Catálogo de Consultas PromQL — Hito 13 (§5.2, RF2, RF4, RF8)

## 1. Configuración de Recolección (Scraping) en Prometheus (§5.2, RF1, RF2)

La configuración declarativa se encuentra en [`prometheus.yml`](../prometheus.yml) y [`docker-compose.yml`](../docker-compose.yml).

### 1.1. Parámetros Globales y Almacenamiento
- **Imagen Docker fijada:** `prom/prometheus:v3.2.1` (puerto local `127.0.0.1:9090`).
- **Intervalo de recolección (`scrape_interval`):** `5s` (calibrado para capturar con alta resolución las ventanas de carga y la prueba controlada de falla/recuperación de `10s–15s`).
- **Timeout de scrape (`scrape_timeout`):** `4s`.
- **Intervalo de evaluación de reglas (`evaluation_interval`):** `5s` sobre [`prometheus/reglas-o-alertas.yml`](../prometheus/reglas-o-alertas.yml).
- **Retención de series temporales (`--storage.tsdb.retention.time`):** `7d` en el volumen persistente `prometheus_data` (`/prometheus`).
- **Etiquetas externas globales (`external_labels`):**
  - `proyecto: "fixture-mundial-2030"`
  - `hito: "hito-13-monitoreo"`
  - `entorno: "laboratorio-local"`

### 1.2. Targets Configurados (`scrape_configs`)

| `job_name` | Target (`instance`) | Ruta | Etiquetas Estáticas (`labels`) | Qué recolecta |
| :--- | :--- | :---: | :--- | :--- |
| `prometheus` | `localhost:9090` | `/metrics` | `component="prometheus"`, `layer="observability"`, `role="tsdb-scraper"` | Salud interna del servidor Prometheus, series en memoria (`prometheus_tsdb_head_series`) y duración de scrapes |
| `fixture2030_api` | `host.docker.internal:8013` | `/metrics` | `component="api-fastify"`, `layer="application-and-probes"`, `role="api-rest-poliglota"` | Métricas de aplicación HTTP, histogramas de latencia por ruta y por motor (`mongodb`, `neo4j`, `redis_session`, `redis_cache`), eventos de caché/sesiones, métricas de proceso Node.js y sondas activas `fixture2030_component_up` |
| `redis_exporter` | `redis-exporter:9121` | `/metrics` | `component="redis"`, `layer="database-exporter"`, `role="key-value-session-cache"` | Telemetría interna del motor Redis (`6379`) vía `oliver006/redis_exporter:v1.67.0`: `redis_up`, `redis_memory_used_bytes`, `redis_memory_max_bytes`, `redis_connected_clients`, `redis_commands_processed_total`, `redis_db_keys` |

### 1.3. Procedimiento para Validar Targets `UP` e Investigar Targets `DOWN` (§5.2)

1. **Verificación automatizada:**
   ```bash
   pnpm --dir hito-10-api h13:verificar-targets
   ```
   Consulta `http://127.0.0.1:9090/api/v1/targets?state=active` y genera [`evidencia/prometheus_targets.md`](../evidencia/prometheus_targets.md).
2. **Validación manual rápida:**
   - En navegador: `http://127.0.0.1:9090/targets`
   - Vía CLI: `curl -s http://127.0.0.1:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health, lastError: .lastError}'`
3. **Protocolo de diagnóstico si un target figura `DOWN` (`up == 0`):**
   - **Si `fixture2030_api` está `DOWN`:** verificar que el proceso `servidor_monitoreo.ts` esté escuchando en `0.0.0.0:8013` (`curl -i http://127.0.0.1:8013/metrics`) y que `extra_hosts: ["host.docker.internal:host-gateway"]` esté presente en `docker-compose.yml`.
   - **Si `redis_exporter` está `DOWN`:** verificar estado del contenedor con `docker compose -f hito-13-monitoreo/docker-compose.yml ps redis-exporter` y logs con `docker compose -f hito-13-monitoreo/docker-compose.yml logs redis-exporter`. Si `up{job="redis_exporter"} == 1` pero `redis_up == 0`, entonces el exporter corre pero el contenedor `fixture2030-redis-1` (`:6379`) está detenido o inaccesible.

---

## 2. Catálogo de Consultas PromQL Explicadas (RF8)

Todas las consultas siguientes fueron ejecutadas contra la API real de Prometheus (`/api/v1/query`) y sus salidas sin secretos se encuentran en [`evidencia/resultados_sin_secretos/consultas_promql_observadas.md`](../evidencia/resultados_sin_secretos/consultas_promql_observadas.md).

### Q1 — Disponibilidad de targets de monitoreo
```promql
up
```
- **Qué mide:** Estado de recolección de cada target configurado en `prometheus.yml` (`1` = scrape exitoso, `0` = scrape fallido).
- **Unidad:** Estado binario (`0` o `1`).
- **Ventana:** Instantánea (actualizada cada `5s`).

### Q2 — Disponibilidad en tiempo real de los motores activos del flujo integrado
```promql
fixture2030_component_up{monitored_mode="active_probe"}
```
- **Qué mide:** Resultado de las sondas reales de driver ejecutadas por la API hacia **MongoDB** (`db.command({ ping: 1 })`), **Neo4j** (`RETURN 1 AS ok` por Bolt), **Redis** (`PING`) y el propio loop HTTP de **Fastify**.
- **Unidad:** Estado binario (`1` = activo, `0` = inaccesible).
- **Ventana:** Instantánea (`5s`).

### Q3 — Percentil 95 de latencia HTTP extremo a extremo en la API
```promql
histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))
```
- **Qué mide:** El tiempo de respuesta HTTP bajo el cual se resuelve el `95%` de las solicitudes de la API considerando todas las rutas activas (`/partidos/:id`, `/equipos/:codigo/jugadores`, `/partidos/:id/eventos`, `/equipos/:codigo`).
- **Unidad:** Milisegundos (`ms`).
- **Ventana:** Tasa móvil de `1m` (`[1m]`).

### Q4 — Comparación de latencia `p95` por motor políglota
```promql
histogram_quantile(0.95, sum by (le, engine) (rate(fixture2030_db_operation_duration_ms_bucket[1m])))
```
- **Qué mide:** El percentil 95 de latencia desglosado por etiqueta `engine` (`mongodb`, `neo4j`, `redis_session`, `redis_cache`). Permite demostrar visual y cuantitativamente cómo Redis resuelve lecturas en sub-milisegundos mientras Neo4j y MongoDB atienden los *cache misses*.
- **Unidad:** Milisegundos (`ms`).
- **Ventana:** `1m`.

### Q5 — Throughput HTTP por plantilla de ruta y clase de estado
```promql
sum by (route, status_class) (rate(fixture2030_http_requests_total[1m]))
```
- **Qué mide:** La tasa de solicitudes HTTP procesadas por segundo en cada endpoint (`route`) separando respuestas exitosas (`2xx`) de errores de cliente (`4xx`) o fallas de servidor/dependencia (`5xx`).
- **Unidad:** Solicitudes por segundo (`req/s`).
- **Ventana:** `1m`.

### Q6 — Comparación de volumen de operaciones por base de datos
```promql
sum by (engine, operation) (rate(fixture2030_db_operations_total[1m]))
```
- **Qué mide:** Cuántas operaciones por segundo ejecuta cada subsistema de persistencia (`redis_session::readAndRenew`, `redis_cache::get`, `mongodb::team`, `mongodb::players`, `neo4j::match`, `neo4j::events`).
- **Unidad:** Operaciones por segundo (`ops/s`).
- **Ventana:** `1m`.

### Q7 — Efectividad de la caché Read-Aside (`Cache Hit Ratio`)
```promql
sum(rate(fixture2030_cache_events_total{result="hit"}[1m])) / clamp_min(sum(rate(fixture2030_cache_events_total{result=~"hit|miss"}[1m])), 0.001)
```
- **Qué mide:** La fracción de lecturas de partidos, planteles y eventos servidas directamente desde Redis (`hit`) respecto del total de búsquedas en caché (`hit + miss`).
- **Unidad:** Proporción (`0.0` a `1.0`, equivalente a `0%–100%`).
- **Ventana:** `1m`.

### Q8 — Huella de memoria de infraestructura (Redis + Proceso API Node.js)
```promql
redis_memory_used_bytes or process_resident_memory_bytes{job="fixture2030_api"}
```
- **Qué mide:** Bytes de RAM consumidos por Redis (reportados por `redis_exporter`) y memoria residente RSS del servidor Node.js/Fastify.
- **Unidad:** `bytes`.
- **Ventana:** Instantánea (`5s`).
