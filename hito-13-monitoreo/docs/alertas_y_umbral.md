# Reglas de Alerta, Umbrales y Respuesta Operativa — Hito 13

## 1. Diseño de Alertas Orientado a Operación Real (RF9, §5.4)

Las reglas de alerta se encuentran codificadas en [`hito-13-monitoreo/prometheus/reglas-o-alertas.yml`](../prometheus/reglas-o-alertas.yml) y son evaluadas automáticamente por Prometheus cada `5s`. Cada regla cumple los 8 campos exigidos en la sección **5.4** y el requisito **RF9** (incluyendo explícitamente **quién debería atenderla**).

---

## 2. Matriz Completa de Reglas de Alerta (RF9)

| Nombre de la Alerta | Métrica o Expresión PromQL | Condición / Umbral | Ventana (`for`) | Severidad | Componente Afectado | Posible Impacto en el Sistema | Quién Debería Atenderla (Rol Responsable) | Acción Inicial de Diagnóstico (Runbook) |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| **`Fixture2030TargetPrometheusCaido`** | `up == 0` | `== 0` | `5s` | `critical` | Infraestructura / Target de Scrape (`fixture2030_api`, `redis_exporter`, `prometheus`) | Pérdida de telemetría del componente o caída total del proceso HTTP/exporter. | **Ingeniero de Confiabilidad (SRE) / Guardia de Infraestructura y Observabilidad** | Ejecutar `docker compose -f hito-13-monitoreo/docker-compose.yml ps` y `pnpm --dir hito-10-api h13:verificar-targets`; revisar logs del contenedor o proceso caído. |
| **`Fixture2030MotorPoliglotaInaccesible`** | `fixture2030_component_up{monitored_mode="active_probe"} == 0` | `== 0` | `5s` | `critical` | Base de datos activa (`mongodb`, `neo4j`, `redis`) o `api-fastify` | Respuestas `HTTP 503 DEPENDENCY_UNAVAILABLE` en lecturas de partidos/equipos (cuando expira la caché) o en validación de sesiones. | **DBA On-Call de Persistencia Políglota (NoSQL) + SRE de Plataforma** | Identificar la etiqueta `component` en la alerta activa; ejecutar `docker compose ps <motor>`, revisar logs del motor y probar ping nativo (`mongosh`, `cypher-shell`, `redis-cli`). |
| **`Fixture2030LatenciaHttpP95Elevada`** | `histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m]))) > 250` | `> 250 ms` | `30s` | `warning` | Capa API REST (`fixture2030_api`) y conectores de datos | Degradación perceptible en clientes web/móviles y riesgo de agotamiento de pools de conexión bajo ráfagas de goles. | **Equipo de Ingeniería Backend (API Fastify) + DBA Políglota** | Inspeccionar Panel 4 de Grafana (`fixture2030_db_operation_duration_ms_bucket` por `engine`) para aislar el motor lento y revisar el Hit Ratio de Redis en el Panel 8. |
| **`Fixture2030TasaErroresHttp5xxAlta`** | `(sum(rate(fixture2030_http_requests_total{status_class="5xx"}[1m])) / clamp_min(sum(rate(fixture2030_http_requests_total[1m])), 0.001)) > 0.01` | `> 1%` (`0.01`) | `10s` | `critical` | Capa API REST (`fixture2030_api`) | Más del 1% de las solicitudes de usuarios fallan con `503 DEPENDENCY_UNAVAILABLE`, `503 REQUEST_TIMEOUT` o `500 INTERNAL_ERROR`. | **Líder Técnico de Guardia (Backend API) + SRE en turno** | Consultar Panel 7 (`fixture2030_db_operations_total{status="error"}`) para identificar qué dependencia originó el fallo y verificar estado de sondas en Panel 2. |
| **`Fixture2030CacheHitRatioBajoBajoCarga`** | `(sum(rate(fixture2030_cache_events_total{result="hit"}[1m])) / clamp_min(sum(rate(fixture2030_cache_events_total{result=~"hit|miss"}[1m])), 0.001)) < 0.70 and sum(rate(fixture2030_cache_events_total{result=~"hit|miss"}[1m])) > 1` | `< 70%` con `> 1 req/s` | `30s` | `warning` | Capa de Caché Read-Aside (`redis_cache`) | Incremento abrupto de lecturas directas sobre MongoDB y Neo4j, elevando la latencia `p95` hacia valores de línea base no optimizada. | **Especialista en Caché / Ingeniería de Performance Backend** | Verificar si hubo un reinicio o `FLUSHDB` en Redis, expiración simultánea de TTLs (`cache stampede`) o cambio en el patrón de claves consultadas. |
| **`Fixture2030RedisMemoriaSaturada`** | `(redis_memory_used_bytes / clamp_min(redis_memory_max_bytes, 1)) > 0.85 and redis_memory_max_bytes > 0` | `> 85%` de `maxmemory` | `30s` | `warning` | Motor Clave-Valor (`redis`) | Riesgo de desalojo prematuro (`eviction`) de llaves calientes de caché o rechazo de nuevas sesiones (`OOM`) según la directiva `maxmemory-policy`. | **DBA Redis / Ingeniero de Infraestructura en Memoria** | Inspeccionar `redis_db_keys`, proporción de llaves `sesion:*` vs `cache:*` y evaluar incremento de `maxmemory` o ajuste de TTLs. |

---

## 3. Justificación Empírica de los Umbrales Elegidos (RF9, RF11)

Los umbrales no fueron elegidos arbitrariamente; se derivan directamente de las mediciones experimentales obtenidas en el **Hito 12** ([`hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md`](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md)) y en el **Hito 13** ([`evidencia/resultados_sin_secretos/consultas_promql_observadas.md`](../evidencia/resultados_sin_secretos/consultas_promql_observadas.md)):

1. **Umbral de Latencia HTTP `p95 > 250 ms` (`for: 30s`)**:
   - En el **Hito 12**, la **línea base sin optimizar** registró una latencia global `p95 = 308,75 ms` (`417,604 ms` en el endpoint compuesto `GET /partidos/:id`), mientras que la **arquitectura optimizada** redujo el `p95` global a **`65,572 ms`** (`59,855 ms` en `GET /partidos/:id`) y en el arranque en frío del **Hito 13** (`Q3`) se ubicó en **`166,67 ms`**.
   - Por lo tanto, fijar el umbral de advertencia (`warning`) en **`250 ms`** durante `30s` detecta con precisión cuándo el sistema pierde el beneficio de la optimización y se acerca al régimen degradado pre-Hito 12 (`308,75 ms`), sin disparar falsos positivos durante el calentamiento inicial de la caché (`166,67 ms`).
2. **Umbral de Tasa de Errores `5xx > 1%` (`for: 10s`)**:
   - En condiciones normales (tanto en las `8.249 ops` del Hito 12 como en la Fase 1 y Fase 3 del Hito 13), la tasa de errores `5xx` es exactamente **`0%`**. Superar el `1%` durante `10s` confirma una falla real de dependencia (`503 DEPENDENCY_UNAVAILABLE` o `503 REQUEST_TIMEOUT`) que requiere intervención inmediata del equipo de guardia.
3. **Umbral de Cache Hit Ratio `< 70%` con tráfico activo (`> 1 ops/s`, `for: 30s`)**:
   - Con distribución Pareto 80/20 sobre el fixture, el Hit Ratio medido en régimen estacionario en el Hito 12 fue de **`98,57%`** (`8.131 hits` / `118 misses`) y en la corrida corta de calentamiento del Hito 13 (`Q7`) fue de **`85,27%`**. Caer por debajo del `70%` bajo tráfico activo indica pérdida de efectividad de la capa Read-Aside.

---

## 4. Comportamiento Observado Durante la Prueba Controlada (RF10)

Durante la ejecución de [`scripts/ejecutar_prueba_controlada.ts`](../scripts/ejecutar_prueba_controlada.ts) (documentada en [`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md) y [`evidencia/prueba_de_falla.json`](../evidencia/prueba_de_falla.json)):
- **Fase 1 (Antes de la falla)**: las 6 reglas de alerta se observaron en estado **`INACTIVE`**.
- **Fase 2 (Durante la falla controlada)**: tras detener `redis-exporter` e inducir la indisponibilidad de `neo4j` invalidando la caché de `F2030-001`, las reglas críticas **`Fixture2030TargetPrometheusCaido`** y **`Fixture2030MotorPoliglotaInaccesible`** transicionaron a **`FIRING`** (superada su ventana `for: 5s`), mientras que **`Fixture2030TasaErroresHttp5xxAlta`** entró en **`PENDING`** (evaluando su ventana `for: 10s`).
- **Fase 3 (Después de la recuperación)**: tras reiniciar `redis-exporter` y restaurar `neo4j`, las alertas de disponibilidad (**`Fixture2030TargetPrometheusCaido`** y **`Fixture2030MotorPoliglotaInaccesible`**) regresaron inmediatamente a **`INACTIVE`** y el endpoint `GET /partidos/F2030-001` volvió a devolver `HTTP 200 OK` (con `0` errores nuevos en la Fase 3). La regla `Fixture2030TasaErroresHttp5xxAlta` se observó en `FIRING` durante los segundos posteriores debido a que su expresión PromQL utiliza una ventana deslizante `rate(...[1m])` de 60 segundos que aún contenía las 30 respuestas `HTTP 503` generadas en la Fase 2, retornando a `INACTIVE` al deslizarse fuera de la ventana de 1 minuto.
