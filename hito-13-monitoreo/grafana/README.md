# Provisioning y Dashboards de Grafana — Hito 13

Este directorio contiene la configuración declarativa y el tablero exportable de **Grafana (`11.5.2`)** para el monitoreo de la arquitectura políglota del **Fixture Mundial FIFA 2030**.

## Estructura de archivos

- [`provisioning/datasources/prometheus.yml`](provisioning/datasources/prometheus.yml): aprovisiona automáticamente la fuente de datos `Prometheus Fixture 2030` (`uid: prometheus_fixture2030`) apuntando a `http://prometheus:9090` con intervalo base de `5s`.
- [`provisioning/dashboards/dashboards.yml`](provisioning/dashboards/dashboards.yml): aprovisiona automáticamente los tableros JSON ubicados en `/var/lib/grafana/dashboards` dentro de la carpeta `Fixture Mundial 2030`.
- [`dashboards/fixture2030_observabilidad.json`](dashboards/fixture2030_observabilidad.json): dashboard exportable (`uid: fixture2030-hito13-obs`) configurado como tablero de inicio (`GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH`).

## Paneles incluidos (cumplimiento de RF6, RF7 y RNF4)

1. **Disponibilidad de Targets de Prometheus (`up`)**: estado `UP (1)` / `DOWN (0)` de `prometheus`, `fixture2030_api` y `redis_exporter`.
2. **Disponibilidad de Componentes Políglotas Activos (Sondas)**: estado en tiempo real (`fixture2030_component_up{monitored_mode="active_probe"}`) de `mongodb`, `neo4j`, `redis` y `api-fastify`.
3. **Latencia HTTP API (`p50`, `p95`, `p99` - Ventana `1m`)**: cuantiles calculados sobre `fixture2030_http_request_duration_ms_bucket` con unidad `ms` y línea de umbral en `250 ms`.
4. **Comparación de Latencia `p95` por Motor de Datos**: comparación entre `mongodb`, `neo4j`, `redis_session` y `redis_cache` (`ms`).
5. **Throughput / Volumen de Peticiones HTTP por Ruta**: tasa `req/s` desglosada por plantilla de ruta y clase de estado HTTP (`2xx`, `4xx`, `5xx`).
6. **Comparación de Volumen de Operaciones por Base de Datos**: tasa `ops/s` ejecutada sobre cada motor políglota (`mongodb`, `neo4j`, `redis_session`, `redis_cache`).
7. **Tasa de Errores HTTP (`4xx/5xx`) y Fallos de Dependencia**: seguimiento de errores `503 DEPENDENCY_UNAVAILABLE`, `504 DEPENDENCY_TIMEOUT` y fallos de driver.
8. **Eficiencia de Caché Redis y Throttling de Sesiones**: tasa de `hit`, `miss`, `write` y renovaciones de sesión ejecutadas vs omitidas por ventana de throttling.
9. **Recursos de Infraestructura (Memoria API Node.js y Redis)**: memoria RSS/Heap del proceso Node.js y `redis_memory_used_bytes` reportado por `redis_exporter` (`bytes`).

## Cómo importar o verificar el dashboard

Al levantar el stack con `docker compose -f hito-13-monitoreo/docker-compose.yml up -d` (o `pnpm --dir hito-10-api h13:iniciar`), Grafana carga el datasource y el dashboard sin intervención manual en `http://127.0.0.1:3000/d/fixture2030-hito13-obs` (acceso de lectura anónimo habilitado para laboratorio local).
