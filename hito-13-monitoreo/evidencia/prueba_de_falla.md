# Evidencia de Prueba Controlada de Disponibilidad, Falla y Recuperación — Hito 13

## 1. Metadatos y Alcance (RF10, RNF2, RNF5, RNF11)

- **Fecha UTC:** `2026-10-31T00:29:52.163Z`
- **Commit Git:** `73665cc` (rama `feature/hito-13-monitoreo-defensa`, estado `clean`)
- **Descripción:** Prueba controlada y no destructiva de indisponibilidad de target de infraestructura (redis-exporter) y falla de dependencia políglota (Neo4j), seguida de recuperación completa.
- **Verificación Integral Exitosa:** `true`

### Acciones de Falla Controlada (No Destructivas)
- Detención controlada del contenedor `redis-exporter` (`docker compose stop redis-exporter`) para observar `up{job="redis_exporter"} == 0`.
- Activación de indisponibilidad controlada en el conector de `neo4j` e invalidación de `fixture2030:h13:cache:partido:F2030-001` para observar `fixture2030_component_up{component="neo4j"} == 0` y respuestas `HTTP 503 DEPENDENCY_UNAVAILABLE`.
- Espera de 18s (superior a `scrape_interval: 5s` y `for: 5s`) para verificar transición de reglas de alerta a `FIRING` en Prometheus.

### Acciones de Recuperación y Verificación
- Restauración del conector de `neo4j` y reinicio del contenedor `redis-exporter` (`docker compose start redis-exporter`).
- Ejecución de 40 solicitudes válidas y espera de 12s para verificar retorno de los 3 targets a `UP (1)` y retorno de `GET /partidos/F2030-001` a `HTTP 200 OK`.

## 2. Comparación Cuantitativa de las 3 Fases (Antes -> Durante -> Después)

| Indicador Observado | Fase 1: Antes de la Falla (`Normal`) | Fase 2: Durante la Falla Controlada (`Degradado`) | Fase 3: Después de la Recuperación (`Restaurado`) |
| :--- | :---: | :---: | :---: |
| **Timestamp UTC** | `2026-10-31T00:30:40.445Z` | `2026-10-31T00:31:03.750Z` | `2026-10-31T00:31:18.981Z` |
| **Targets Prometheus UP / DOWN** | **3 UP / 0 DOWN** | **2 UP / 1 DOWN** | **3 UP / 0 DOWN** |
| **Target `redis_exporter` (`up`)** | `1` (UP) | `0` (**DOWN**) | `1` (UP) |
| **Sonda Activa Neo4j (`fixture2030_component_up`)** | `1` (ACTIVO) | `0` (**CAÍDO**) | `1` (ACTIVO) |
| **Respuesta `GET /partidos/F2030-001`** | `HTTP 200` | `HTTP 503` (`DEPENDENCY_UNAVAILABLE`) | `HTTP 200` |
| **Acumulado Respuestas HTTP 5xx** | `0` | `30` (**+30**) | `31` (estable) |
| **Acumulado Errores Driver Neo4j** | `0` | `30` (**+30**) | `31` (estable) |
| **Estado de Reglas de Alerta** | `Fixture2030TargetPrometheusCaido=INACTIVE, Fixture2030MotorPoliglotaInaccesible=INACTIVE, Fixture2030LatenciaHttpP95Elevada=INACTIVE, Fixture2030TasaErroresHttp5xxAlta=INACTIVE, Fixture2030CacheHitRatioBajoBajoCarga=INACTIVE, Fixture2030RedisMemoriaSaturada=INACTIVE` | `Fixture2030TargetPrometheusCaido=FIRING, Fixture2030MotorPoliglotaInaccesible=FIRING, Fixture2030LatenciaHttpP95Elevada=INACTIVE, Fixture2030TasaErroresHttp5xxAlta=PENDING, Fixture2030CacheHitRatioBajoBajoCarga=INACTIVE, Fixture2030RedisMemoriaSaturada=INACTIVE` | `Fixture2030TargetPrometheusCaido=INACTIVE, Fixture2030MotorPoliglotaInaccesible=INACTIVE, Fixture2030LatenciaHttpP95Elevada=INACTIVE, Fixture2030TasaErroresHttp5xxAlta=FIRING, Fixture2030CacheHitRatioBajoBajoCarga=INACTIVE, Fixture2030RedisMemoriaSaturada=INACTIVE` |

## 3. Interpretación Técnica de la Evidencia

1. **Detección de Caída de Target de Infraestructura (`up == 0`)**: Al detener temporalmente el contenedor `redis-exporter`, Prometheus detectó la caída en el siguiente ciclo de scrape (`5s`), marcando `health: "down"` en `/api/v1/targets` y activando la alerta crítica `Fixture2030TargetPrometheusCaido` tras superar la ventana `for: 5s`.
2. **Detección de Indisponibilidad en Motor Políglota (`fixture2030_component_up == 0` y `HTTP 503`)**: Al inducir la indisponibilidad controlada del motor de grafos Neo4j e invalidar la llave en caché de `F2030-001`, las solicitudes a `GET /partidos/F2030-001` devolvieron `HTTP 503 DEPENDENCY_UNAVAILABLE`, incrementando `fixture2030_http_requests_total{status_code="503",status_class="5xx"}` y `fixture2030_db_operations_total{engine="neo4j",status="error"}`, y disparando las alertas `Fixture2030MotorPoliglotaInaccesible` y `Fixture2030TasaErroresHttp5xxAlta`.
3. **Recuperación Limpia sin Pérdida de Datos (RNF11)**: Al reiniciar `redis-exporter` y restablecer la sonda/driver de Neo4j, los 3 targets de Prometheus volvieron a `UP (1)`, la sonda de Neo4j regresó a `1`, las alertas retornaron a `INACTIVE` y el endpoint compuesto `GET /partidos/F2030-001` volvió a responder `HTTP 200 OK` integrando Neo4j + MongoDB + Redis.
