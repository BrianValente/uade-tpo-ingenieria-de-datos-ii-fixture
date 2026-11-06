# Evidencia de Targets y Reglas de Prometheus — Hito 13

## 1. Metadatos de Ejecución Reproducible (RNF2)

- **Fecha UTC:** `2026-10-31T00:29:52.163Z`
- **Commit Git:** `73665cc` (rama `feature/hito-13-monitoreo-defensa`, estado `clean`)
- **Versión Prometheus:** `3.2.1`
- **Intervalo de Scrape / Evaluación:** `5s` / `5s`
- **Targets Totales / UP / DOWN:** `3` / `3` / `0`

## 2. Targets Activos en `/api/v1/targets` (RF1, RF2)

| Job | Instance | Scrape URL | Estado | Duración Scrape (ms) | Capa (`layer`) | Último Error |
| :--- | :--- | :--- | :---: | ---: | :--- | :--- |
| `fixture2030_api` | `host.docker.internal:8013` | `http://host.docker.internal:8013/metrics` | **UP** | 173.98 | `application-and-probes` | Ninguno |
| `prometheus` | `localhost:9090` | `http://localhost:9090/metrics` | **UP** | 196.05 | `observability` | Ninguno |
| `redis_exporter` | `redis-exporter:9121` | `http://redis-exporter:9121/metrics` | **UP** | 274.55 | `database-exporter` | Ninguno |

## 3. Componentes de la Arquitectura Políglota (`fixture2030_component_up`) (RF3, §5.1)

| Componente | Modelo de Datos | Rol en el Fixture 2030 | Mecanismo de Observabilidad | Estado (`up`) | Latencia Sonda (ms) | Detalle Observado |
| :--- | :--- | :--- | :--- | :---: | ---: | :--- |
| `api-fastify` | `api-rest` | `integracion-poliglota` | Sonda activa de driver en tiempo real (`active_probe`) | **1 (ACTIVO)** | 0.15 | Fastify event loop active |
| `mongodb` | `documental` | `equipos-jugadores-auditoria` | Sonda activa de driver en tiempo real (`active_probe`) | **1 (ACTIVO)** | 16.43 | MongoDB ping:1 ok |
| `neo4j` | `grafo` | `fixture-sedes-eventos` | Sonda activa de driver en tiempo real (`active_probe`) | **1 (ACTIVO)** | 61.68 | Neo4j Bolt RETURN 1 ok |
| `redis` | `clave-valor` | `sesiones-y-cache` | Sonda activa de driver en tiempo real (`active_probe`) | **1 (ACTIVO)** | 10.96 | Redis PING PONG ok |
| `cassandra` | `columnar` | `eventos-y-consultas-por-particion` | Sonda TCP informativa de laboratorio (`tcp_socket_probe`) | 0 (Contenedor detenido bajo demanda) | 1.91 | TCP 127.0.0.1:9042 connect ECONNREFUSED 127.0.0.1:9042 |
| `influxdb` | `series-temporales` | `telemetria-iot-sensores` | Sonda TCP informativa de laboratorio (`tcp_socket_probe`) | 0 (Contenedor detenido bajo demanda) | 1.98 | TCP 127.0.0.1:8181 connect ECONNREFUSED 127.0.0.1:8181 |
| `iris` | `multimodelo` | `datamart-analitico-bi` | Sonda TCP informativa de laboratorio (`tcp_socket_probe`) | 0 (Contenedor detenido bajo demanda) | 2.23 | TCP 127.0.0.1:1972 connect ECONNREFUSED 127.0.0.1:1972 |

## 4. Reglas de Alerta Cargadas en `/api/v1/rules` (RF9)

| Regla de Alerta | Severidad | Capa (`tier`) | Ventana `for` | Estado Actual | Expresión PromQL |
| :--- | :---: | :--- | :---: | :---: | :--- |
| `Fixture2030TargetPrometheusCaido` | `critical` | `infrastructure` | `5s` | **INACTIVE** | `up == 0` |
| `Fixture2030MotorPoliglotaInaccesible` | `critical` | `database` | `5s` | **INACTIVE** | `fixture2030_component_up{monitored_mode="active_probe"} == 0` |
| `Fixture2030LatenciaHttpP95Elevada` | `warning` | `application` | `30s` | **INACTIVE** | `histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m]))) > 250` |
| `Fixture2030TasaErroresHttp5xxAlta` | `critical` | `application` | `10s` | **INACTIVE** | `(sum(rate(fixture2030_http_requests_total{status_class="5xx"}[1m])) / clamp_min(sum(rate(fixture2030_http_requests_total[1m])), 0.001)) > 0.01` |
| `Fixture2030CacheHitRatioBajoBajoCarga` | `warning` | `cache` | `30s` | **INACTIVE** | `(sum(rate(fixture2030_cache_events_total{result="hit"}[1m])) / clamp_min(sum(rate(fixture2030_cache_events_total{result=~"hit|miss"}[1m])), 0.001)) < 0.7 and sum(rate(fixture2030_cache_events_total{result=~"hit|miss"}[1m])) > 1` |
| `Fixture2030RedisMemoriaSaturada` | `warning` | `database` | `30s` | **INACTIVE** | `(redis_memory_used_bytes / clamp_min(redis_memory_max_bytes, 1)) > 0.85 and redis_memory_max_bytes > 0` |
