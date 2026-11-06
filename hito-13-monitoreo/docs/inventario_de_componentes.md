# Inventario de Componentes Monitoreados y No Monitoreados — Hito 13

## 1. Propósito y Alcance (RF1, RF3, RF4, RNF3)

Este documento registra con transparencia técnica (conforme a **RF1**, **RF3**, **RF4** y **RNF3**) qué componentes de la arquitectura políglota del **Fixture Mundial FIFA 2030** cuentan con recolección activa de métricas operativas en **Prometheus** y visualización en **Grafana**, cuáles se verifican mediante sondas de conectividad TCP desde la capa de aplicación y por qué se tomó esa decisión de ingeniería.

---

## 2. Mapa General de Componentes de la Arquitectura

| Componente | Modelo / Tipo | Puerto Host | Rol Funcional en Fixture 2030 | Estado en el Flujo Integrado (Hitos 10–13) | Mecanismo de Observabilidad en Hito 13 |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **API Fastify (`servidor_monitoreo.ts`)** | Capa de Integración HTTP REST | `8013` | Orquestador políglota (`/partidos`, `/equipos`, `/sesiones`, `/health`, `/metrics`) | **Activo bajo tráfico real** | **Instrumentación directa Prometheus** (`job="fixture2030_api"`) + métricas de proceso Node.js |
| **MongoDB (`7.0`)** | Documental | `27017` | Catálogo de 64 selecciones (`equipos`), 1.536 jugadores (`jugadores`) y cuentas (`usuarios_api`) | **Activo bajo tráfico real** | **Sonda activa de driver (`ping: 1`)** + contadores/histogramas de operaciones por colección (`fixture2030_db_*`) |
| **Neo4j (`5.x` / `2026.x`)** | Grafo de Propiedades | `7687` (`7474`) | Grafo del torneo (`Partido`, `Equipo`, `Sede`, `Evento`, `Jugador` y relaciones `DISPUTA`, `SE_JUEGA_EN`, `OCURRE_EN`, `INVOLUCRA`) | **Activo bajo tráfico real** | **Sonda activa Bolt (`RETURN 1`)** + contadores/histogramas de consultas Cypher (`fixture2030_db_*`) |
| **Redis (`7.x` / `8.x`)** | Clave-Valor en Memoria | `6379` | Sesiones autenticadas con throttling Lua (`O3`) y caché Read-Aside (`O2`) | **Activo bajo tráfico real** | **Exporter nativo (`redis_exporter:9121`, `job="redis_exporter"`)** + sonda activa `PING` + métricas de hit/miss/throttling |
| **Apache Cassandra (`5.0`)** | Columnar de Ancho Variable | `9042` | Muro de comentarios en vivo (`fixture2030_comentarios.comentarios_por_partido` con write-sharding `grupo 0..15` y `comentarios_por_usuario`) | Implementado en Hito 6 (1M+ comentarios) y contratos en Hito 10; sondeo de puerto en Hito 11 (reportado DOWN por puerto cerrado sin demonio activo); **inactivo en H12/H13** por restricción de RAM (~7,3 GiB local) | **Sonda TCP (`checkTcpPort 9042`)** expuesta en `fixture2030_component_up{component="cassandra",monitored_mode="tcp_socket_probe"}` + instrumentación de driver en `DataService` |
| **InfluxDB (`3 Core`)** | Series Temporales | `8181` | Estadísticas de partido por equipo cada 10s (`estadisticas_equipo` en `fixture2030_h8_lab_detalle`, retención `7d`) y resúmenes por minuto (`estadisticas_minuto` en `fixture2030_h8_lab_resumen`, retención `90d`) | Implementado en Hito 8 (34.560 puntos) y contratos en Hito 10; sondeo de puerto en Hito 11 (reportado DOWN por puerto cerrado sin demonio activo); **inactivo en H12/H13** por restricción de RAM (~7,3 GiB local) | **Sonda TCP (`checkTcpPort 8181`)** expuesta en `fixture2030_component_up{component="influxdb",monitored_mode="tcp_socket_probe"}` + instrumentación de driver en `DataService` |
| **InterSystems IRIS (`2024.1`)** | Multimodelo / Objetos Persistentes | `1972` (`52773`) | Objetos complejos en `USER` (`Fixture.Partido`, `Fixture.Arbitro`, `Fixture.Tecnico`, `Fixture.Evento`) con proyección SQL de solo lectura y diseño de Data Mart Kimball (Hito 12) | Implementado en Hito 9 (clases y transiciones) y contratos en Hito 10; sondeo de puerto en Hito 11 (reportado DOWN por puerto cerrado sin demonio activo); **inactivo en H12/H13** por restricción de RAM (~7,3 GiB local) | **Sonda TCP (`checkTcpPort 1972`)** expuesta en `fixture2030_component_up{component="iris",monitored_mode="tcp_socket_probe"}` + instrumentación de driver en `DataService` |
| **Prometheus (`v3.2.1`)** | TSDB de Monitoreo | `9090` | Recolección (`scrape_interval: 5s`), evaluación de reglas (`evaluation_interval: 5s`) y motor PromQL | **Activo en Hito 13** | **Auto-monitoreo nativo** (`job="prometheus"`, `localhost:9090/metrics`) |
| **Grafana (`11.5.2`)** | Visualización y Dashboards | `3000` | Tablero aprovisionado por código (`uid: fixture2030-hito13-obs`) con 9 paneles | **Activo en Hito 13** | Verificado vía API HTTP (`/api/health`, `/api/datasources`, `/api/search`) |

---

## 3. Distinción entre Métricas de Aplicación y Métricas de Infraestructura (RF4)

Conforme a **RF4**, el sistema separa explícitamente dos planos de observabilidad:

### 3.1. Métricas de Infraestructura y Exporters
Miden el estado físico o de proceso de los contenedores, motores y demonios de recolección:
- **`up{job, instance, layer, service_target}`**: métrica nativa de Prometheus que indica si el scrape HTTP contra cada target (`prometheus:9090`, `fixture2030_api:8013`, `redis-exporter:9121`) fue exitoso (`1`) o falló (`0`).
- **Métricas del proceso Node.js (`fixture2030_api`)**:
  - `process_resident_memory_bytes`: memoria física residente (RSS) del proceso API.
  - `nodejs_heap_used_bytes` y `nodejs_heap_total_bytes`: ocupación y reserva del heap V8.
  - `process_cpu_user_seconds_total` y `process_cpu_system_seconds_total`: tiempo de CPU consumido en modo usuario y kernel.
  - `process_uptime_seconds`: tiempo de actividad continua del servidor HTTP.
- **Métricas internas del motor Redis (`redis_exporter`)**:
  - `redis_up`: disponibilidad del servidor Redis visto desde el exporter.
  - `redis_memory_used_bytes` y `redis_memory_max_bytes`: consumo de RAM del motor clave-valor y tope configurado (`maxmemory`).
  - `redis_connected_clients`: conexiones TCP abiertas hacia Redis.
  - `redis_commands_processed_total`: caudal total de comandos procesados por el motor.
  - `redis_db_keys`: cantidad de llaves almacenadas por base de datos lógica (`db0`).

### 3.2. Métricas de Aplicación y Conectores Políglotas
Miden el comportamiento funcional del contrato HTTP y la interacción de la API con cada base de datos:
- **`fixture2030_component_up{component, model, role, monitored_mode}`**: disponibilidad funcional verificada cada `2s` mediante sondas de protocolo (`ping: 1` en MongoDB, `RETURN 1` en Neo4j, `PING` en Redis) y sondas de socket TCP (`9042`, `8181`, `1972`).
- **`fixture2030_component_probe_latency_ms{component, model, role, monitored_mode}`**: latencia en milisegundos de la última sonda de salud por componente.
- **`fixture2030_http_requests_total{method, route, status_code, status_class}`**: contador de solicitudes HTTP procesadas por plantilla de ruta (`/partidos/:id`, `/partidos/:id/eventos`, `/equipos/:codigo`, `/equipos/:codigo/jugadores`, `/health`, etc.) y clase de estado (`2xx`, `4xx`, `5xx`).
- **`fixture2030_http_request_duration_ms_{bucket,sum,count}{method, route, status_class}`**: histograma de latencia extremo a extremo en la capa Fastify (buckets de `0.5 ms` a `2500 ms`), utilizado para calcular `p50`, `p95` y `p99`.
- **`fixture2030_db_operations_total{engine, operation, status}`**: contador de operaciones ejecutadas sobre los drivers políglotas (`mongodb`, `neo4j`, `redis_session`, `redis_cache`, y soporte instrumentado para `cassandra`, `influxdb` e `iris`), diferenciando `status="ok"` y `status="error"`.
- **`fixture2030_db_operation_duration_ms_{bucket,sum,count}{engine, operation}`**: histograma de tiempo de respuesta por motor y operación (`match`, `events`, `team`, `players`, `matchTeamsBatch`, `readAndRenew`, `get`, `setex`, `listComments`, `statisticsSummary`, `findObjectMatch`).
- **`fixture2030_cache_events_total{entity, result}`**: eventos de la caché Read-Aside (`hit`, `miss`, `write`) desglosados por entidad (`match`, `events`, `team`, `players`).
- **`fixture2030_session_renewals_total{action}`**: evaluaciones Lua de sesión autenticada, diferenciando escrituras ejecutadas (`action="executed"`) frente a escrituras ahorradas por la ventana de throttling de 60s (`action="throttled_skip"`).

---

## 4. Justificación de Componentes con Monitoreo Parcial (`tcp_socket_probe`) (RF1, RNF3)

En un entorno doméstico de laboratorio (8 a 16 GiB de RAM en host Windows/WSL2), levantar simultáneamente los **6 motores de bases de datos** junto con **Prometheus, Grafana, Redis Exporter y la API Node.js** supera los `9 GiB` de memoria comprometida debido al heap JVM de **Cassandra** y **Neo4j**, el motor **InterSystems IRIS** y **InfluxDB 3 Core**.

Por ello, siguiendo el criterio de realismo técnico de **RNF3** y **RNF8**:
1. **Motores con monitoreo profundo activo (`active_probe` + métricas de operación + exporter)**: **MongoDB**, **Neo4j** y **Redis** conforman el flujo crítico multi-motor de lectura en vivo optimizado en el Hito 12 y sometido a carga y pruebas de falla en el Hito 13.
2. **Motores con monitoreo de disponibilidad por sonda TCP (`tcp_socket_probe`) e instrumentación de driver en `DataService`**: **Cassandra (`9042`)**, **InfluxDB (`8181`)** e **IRIS (`1972`)** fueron implementados, cargados y verificados en sus respectivos hitos (**Hito 6**, **Hito 8**, **Hito 9**) y en los contratos HTTP/drivers de los **Hitos 10 y 11**. En el Hito 13 la API monitorea continuamente el estado de sus puertos (`fixture2030_component_up{monitored_mode="tcp_socket_probe"}`) y envuelve sus repositorios (`CassandraCommentRepository`, `InfluxStatisticsRepository`, `IrisObjectRepository`) con `trackOtherEngine()`, reportando con total honestidad `up = 0` cuando dichos contenedores no están iniciados durante la corrida focalizada de carga.
