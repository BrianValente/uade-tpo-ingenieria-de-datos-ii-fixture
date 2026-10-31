# Resumen Observado del Dashboard de Grafana — Hito 13

## 1. Estado de Provisioning en Grafana (RF5, RF6, RF7)

- **Fecha UTC:** `2026-10-31T00:29:52.163Z`
- **Commit Git:** `73665cc` (`clean`)
- **Salud de Grafana (`/api/health`):** `ok` (versión `11.5.2`)
- **Datasource Provisionado:** `Prometheus Fixture 2030` (`uid: prometheus_fixture2030`, estado: `provisionado`)
- **Dashboard Provisionado:** `Fixture Mundial 2030 — Observabilidad Políglota (Hito 13)` (`uid: fixture2030-hito13-obs`, URL: `/d/fixture2030-hito13-obs/662372f`)
- **Archivo JSON Exportable:** [`grafana/dashboards/fixture2030_observabilidad.json`](../../grafana/dashboards/fixture2030_observabilidad.json)

## 2. Verificación de Consultas de los 9 Paneles contra Prometheus (RNF4)

| ID Panel | Título del Panel | Unidad | Series Activas | Muestra Observada | Expresión PromQL Principal |
| :---: | :--- | :---: | :---: | :--- | :--- |
| 1 | 1. Disponibilidad de Targets de Prometheus (up) | `short (0=DOWN, 1=UP)` | 3 | `1.000` | `up` |
| 2 | 2. Disponibilidad de Componentes Políglotas Activos (Sondas) | `short (0=CAÍDO, 1=ACTIVO)` | 4 | `1.000` | `fixture2030_component_up{monitored_mode="active_probe"}` |
| 3 | 3. Latencia HTTP API (p50, p95, p99 - Ventana 1m) | `ms` | 1 | `166.667` | `histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))` |
| 4 | 4. Comparación de Latencia p95 por Motor de Datos | `ms` | 4 | `233.125` | `histogram_quantile(0.95, sum by (le, engine) (rate(fixture2030_db_operation_duration_ms_bucket[1m])))` |
| 5 | 5. Throughput / Volumen de Peticiones HTTP por Ruta | `req/s` | 4 | `2.064` | `sum by (route, status_class) (rate(fixture2030_http_requests_total[1m]))` |
| 6 | 6. Comparación de Volumen de Operaciones por Base de Datos | `ops/s` | 8 | `0.207` | `sum by (engine, operation) (rate(fixture2030_db_operations_total[1m]))` |
| 7 | 7. Tasa de Errores HTTP (4xx/5xx) y Fallos de Dependencia | `ops/s` | 0 | `0.000` | `sum by (engine) (rate(fixture2030_db_operations_total{status="error"}[1m]))` |
| 8 | 8. Eficiencia de Caché Redis y Throttling de Sesiones | `ops/s` | 3 | `3.375` | `sum by (result) (rate(fixture2030_cache_events_total[1m]))` |
| 9 | 9. Recursos de Infraestructura: Memoria API Node.js y Redis | `bytes` | 1 | `76.68 MiB` | `process_resident_memory_bytes{job="fixture2030_api"}` |
