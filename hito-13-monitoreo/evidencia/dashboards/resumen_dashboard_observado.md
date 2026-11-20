# Resumen Observado del Dashboard de Grafana — Hito 13

## 1. Estado de Provisioning en Grafana (RF5, RF6, RF7)

- **Fecha UTC:** `2026-11-06T19:57:42.169Z`
- **Commit Git:** `46af5f5` (`clean`)
- **Salud de Grafana (`/api/health`):** `ok` (versión `11.5.2`)
- **Datasource Provisionado:** `Prometheus Fixture 2030` (`uid: prometheus_fixture2030`, estado: `provisionado`)
- **Dashboard Provisionado:** `Fixture Mundial 2030 — Observabilidad Políglota (Hito 13)` (`uid: fixture2030-hito13-obs`, URL: `/d/fixture2030-hito13-obs/662372f`)
- **Archivo JSON Exportable:** [`grafana/dashboards/fixture2030_observabilidad.json`](../../grafana/dashboards/fixture2030_observabilidad.json)

## 2. Consultas habilitadas de los paneles mediante el datasource de Grafana (RNF4)

| ID Panel / Target | Título del Panel | Unidad | Series Activas | Muestra Observada | Expresión PromQL |
| :---: | :--- | :---: | :---: | :--- | :--- |
| 1 / A | 1. Disponibilidad de Targets de Prometheus (up) | `short` | 3 | `1.000` | `up` |
| 2 / A | 2. Disponibilidad de Componentes Políglotas Activos (Sondas) | `short` | 4 | `1.000` | `fixture2030_component_up{monitored_mode="active_probe"}` |
| 3 / A | 3. Latencia HTTP API (p50, p95, p99 - Ventana 1m) | `ms` | 1 | `3.340` | `histogram_quantile(0.50, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))` |
| 3 / B | 3. Latencia HTTP API (p50, p95, p99 - Ventana 1m) | `ms` | 1 | `9.108` | `histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))` |
| 3 / C | 3. Latencia HTTP API (p50, p95, p99 - Ventana 1m) | `ms` | 1 | `20.109` | `histogram_quantile(0.99, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))` |
| 4 / A | 4. Comparación de Latencia p95 por Motor de Datos (MongoDB vs Neo4j vs Redis) | `ms` | 4 | `2.295` | `histogram_quantile(0.95, sum by (le, engine) (rate(fixture2030_db_operation_duration_ms_bucket[1m])))` |
| 4 / B | 4. Comparación de Latencia p95 por Motor de Datos (MongoDB vs Neo4j vs Redis) | `ms` | 4 | `0.031` | `fixture2030_component_probe_latency_ms{monitored_mode="active_probe"}` |
| 5 / A | 5. Throughput / Volumen de Peticiones HTTP por Ruta (req/s) | `reqps` | 4 | `1.774` | `sum by (route, status_class) (rate(fixture2030_http_requests_total[1m]))` |
| 6 / A | 6. Comparación de Volumen de Operaciones por Base de Datos (ops/s) | `ops` | 8 | `0.213` | `sum by (engine, operation) (rate(fixture2030_db_operations_total[1m]))` |
| 7 / A | 7. Tasa de Errores HTTP (4xx/5xx) y Fallos de Dependencia | `ops` | 0 | `sin muestras` | `sum by (status_class, status_code) (rate(fixture2030_http_requests_total{status_class=~"4xx|5xx"}[1m]))` |
| 7 / B | 7. Tasa de Errores HTTP (4xx/5xx) y Fallos de Dependencia | `ops` | 0 | `sin muestras` | `sum by (engine) (rate(fixture2030_db_operations_total{status="error"}[1m]))` |
| 8 / A | 8. Eficiencia de Caché Redis y Throttling de Sesiones | `ops` | 3 | `3.603` | `sum by (result) (rate(fixture2030_cache_events_total[1m]))` |
| 8 / B | 8. Eficiencia de Caché Redis y Throttling de Sesiones | `ops` | 2 | `0.000` | `sum by (action) (rate(fixture2030_session_renewals_total[1m]))` |
| 9 / A | 9. Recursos de Infraestructura: Memoria API Node.js y Redis | `bytes` | 1 | `289693696.000` | `process_resident_memory_bytes{job="fixture2030_api"}` |
| 9 / B | 9. Recursos de Infraestructura: Memoria API Node.js y Redis | `bytes` | 1 | `63821064.000` | `nodejs_heap_used_bytes{job="fixture2030_api"}` |
| 9 / C | 9. Recursos de Infraestructura: Memoria API Node.js y Redis | `bytes` | 1 | `2196480.000` | `redis_memory_used_bytes` |
