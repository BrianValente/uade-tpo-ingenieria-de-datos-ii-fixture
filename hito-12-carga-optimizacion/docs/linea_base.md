# Documentación de la Línea Base Reproducible — Hito 12

**Asignatura:** Ingeniería de Datos II  
**Proyecto:** Plataforma Fixture Mundial 2030 — Grupo 5  

---

## 1. Identificación y Trazabilidad de la Línea Base (RF4, §5.4, RNF2)

Antes de introducir cualquier cambio en la lógica de acceso a datos, dimensionamiento de pools o estrategia de caché, se ejecutó y registró la **Línea Base (`baseline`)** conservando el comportamiento exacto de los adaptadores construidos en el Hito 10 (`hito-10-api`):

| Atributo de Trazabilidad | Valor Observado |
|:---|:---|
| **Fecha y hora de ejecución** | `2026-10-30T14:56:01.876Z` |
| **Commit base del repositorio** | `5533d42` (rama `feature/hito-12-carga-optimizacion`, estado del árbol: `clean`) |
| **Comando de reproducción** | `pnpm --dir hito-10-api h12:linea-base` (`scripts/ejecutar_linea_base.ts`) |
| **Sistema Operativo y Arquitectura** | Windows 11 (`win32 x64`, kernel `10.0.22631`) |
| **Procesador y Memoria del Host** | AMD Ryzen 5 5600U with Radeon Graphics — 12 CPUs lógicas, 7,31 GiB RAM total |
| **Runtime de API y Generador** | Node.js `v22.18.0` + Fastify `5.12.7` |
| **Versiones de Motores NoSQL en Docker** | - **MongoDB:** `v7.0.40` (`fixture2030-mongodb-1`)<br>- **Neo4j:** servidor `neo4j 2026.10.1` / cliente CLI `Cypher-Shell 2026.10.1` (`fixture2030-neo4j-1`, imagen `neo4j:latest`)<br>- **Redis:** `v8.10.2` (`fixture2030-redis-1`, `maxmemory 256mb`, `noeviction`) |
| **Configuración Efectiva de la Línea Base** | - MongoDB `maxPoolSize = 5`, `dependencyTimeoutMs = 3000 ms`, sin proyección de campos, 2 `findOne` separados en `GET /partidos/:id`, 3 operaciones (`findOne` + `find` + `countDocuments`) en `GET /equipos/:codigo/jugadores`.<br>- Neo4j `maxConnectionPoolSize = 5`, `connectionAcquisitionTimeout = 3000 ms`.<br>- Redis `READ_AND_RENEW_SESSION` ejecutando `TIME` + `HSET ultima_actividad` + `EXPIRE 1800` en el 100 % de las peticiones (`sessionRenewThrottleSeconds = 0`).<br>- Caché Read-Aside de datos de negocio **deshabilitado** (`cacheTtlSeconds: { match: 0, team: 0, events: 0 }`). |

---

## 2. Resumen de Métricas Observadas en la Línea Base (RF5, §5.4)

Los datos completos y las muestras crudas se encuentran versionados en [`evidencia/resultados_linea_base.json`](evidencia/resultados_linea_base.json) y [`evidencia/resultados_linea_base.md`](evidencia/resultados_linea_base.md).

### 2.1. Indicadores Globales del Período Medido
- **Concurrencia aplicada:** 24 usuarios virtuales concurrentes sobre 20 sesiones activas en Redis (tras 3 s de calentamiento excluido: `261 ops`, media `45,286 ms`).
- **Duración efectiva medida:** `16,125 s` (rampa de `4 s` completada al 100 % + sostenimiento de `12,125 s` completado al 100 %, motivo de cierre: `TIME_WINDOW_COMPLETED`, tope de seguridad: `50.000 ops`).
- **Operaciones medidas generadas:** **2.009 solicitudes HTTP**.
- **Operaciones exitosas (`HTTP 200`):** **2.009 solicitudes** (`100 %`), todas con integridad de estructura y contenido verificada (`2.009 / 2.009`).
- **Operaciones fallidas:** **0 solicitudes** (`0 %` de tasa de error con `dependencyTimeoutMs = 3000 ms`).
- **Throughput global sostenido:** **`124,59 ops/s`** (`6.395,26 KiB` transferidos).

### 2.2. Distribución de Latencia Extremo a Extremo (E2E)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las rutas)** | 2009 | 14,338 | 172,950 | 90,440 | **167,838** | 247,187 | **308,750** | **532,104** | 756,323 |
| **Claves Calientes (Hotspot 80 %)** | 1595 | 14,338 | 172,872 | 90,475 | **168,013** | 247,092 | **304,542** | **531,205** | 756,323 |
| **Claves Frías (Long-tail 20 %)** | 414 | 15,880 | 173,251 | 90,305 | **166,473** | 247,284 | **340,348** | **532,979** | 652,422 |

> **Observación crítica sobre percentiles e invariancia ante hotspots (§7):** En la línea base, el **82,3 % de las operaciones (`1.654 / 2.009`) supera los `100 ms`**, con un **p95 de `308,750 ms`** y un **p99 de `532,104 ms`** (`máx = 756,323 ms`). Además, **no existe diferencia práctica en la mediana entre claves calientes y claves frías** (`p50 = 168,013 ms` en el 80 % hotspot vs. `p50 = 166,473 ms` en el 20 % long-tail), ya que la ausencia de caché obliga a recalcular en MongoDB y Neo4j el 100 % de las peticiones repetidas sobre los 4 partidos y 8 selecciones más consultados.

### 2.3. Desglose por Perfil de Endpoint HTTP

| Endpoint | Motores | Solicitudes | Éxitos (`200`) | Fallos | Throughput (ops/s) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 810 | 810 | 0 | **50,23** | 192,526 | **179,245** | **417,604** | **630,289** | 756,323 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 595 | 595 | 0 | **36,90** | 184,564 | **195,359** | **279,189** | **366,640** | 425,388 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 417 | 417 | 0 | **25,86** | 142,367 | **111,358** | **433,125** | **595,518** | 734,519 |
| `GET /equipos/:codigo` | Redis + MongoDB | 187 | 187 | 0 | **11,60** | 119,404 | **125,796** | **190,517** | **232,487** | 259,456 |

---

## 3. Diferenciación de Mediciones por Capa y Recursos (RF6, §5.4)

La instrumentación interna permitió aislar cuánto tiempo y cuántas operaciones consumió cada eslabón de la cadena:

| Capa / Producto | Operaciones Registradas | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Fallos | Diagnóstico de Comportamiento en Línea Base |
|:---|---:|---:|---:|---:|---:|---:|:---|
| **Generador de Carga (Cliente HTTP)** | 2.009 | 172,950 | 167,838 | **308,750** | **532,104** | 0 | Mantiene 24 VUs concurrentes; el tiempo transcurre esperando las respuestas HTTP de la API. |
| **Servidor API Fastify (`onResponse`)** | 2.009 | 139,642 | 133,902 | **269,601** | **513,737** | 0 | El 80,7 % del tiempo medio E2E (`139,64 / 172,95 ms`) transcurre dentro del handler esperando a los drivers NoSQL. |
| **Redis — Sesiones Lua** | 2.009 | 24,042 | 22,876 | **42,584** | **62,810** | 0 | **2.009 escrituras `HSET` + `EXPIRE`** (una en cada request `GET`, 0 omitidas). Instantánea post-prueba: `0,39 %` CPU y `28,76 MiB` RAM (`used_memory = 1,81M`). |
| **MongoDB 7.0 — Driver** | **3.592** | 62,047 | 66,024 | **109,793** | **153,885** | 0 | **Amplificación de consultas ($1,79\times$):** `3.592` operaciones de driver para `2.009` requests HTTP (`2` `findOne` por partido + `3` consultas por plantel), encoladas tras `maxPoolSize=5`. |
| **Neo4j — Driver Bolt** | **1.227** | 74,415 | 45,162 | **355,530** | **530,314** | 0 | **Contención en pool de grafos:** `1.227` consultas Cypher compitiendo por `maxConnectionPoolSize=5`, elevando el p95 del driver a `355,530 ms` y el p99 a `530,314 ms` (`máx = 668,462 ms`). |

---

## 4. Observaciones sobre la Estabilidad y Cuellos de Botella de la Prueba (§5.4)

1. **Estabilidad funcional y ventana completa:** Los tres contenedores Docker se mantuvieron `healthy` durante y después de la ventana completa de `16,125 s` (`TIME_WINDOW_COMPLETED`). El 100 % de las `2.009` respuestas verificó integridad estructural y de contenido sin caídas ni pérdidas.
2. **Cuellos de botella identificados bajo concurrencia sostenida (24 VUs):**
   - **Amplificación y serialización en pools reducidos (`pool=5`):** Para atender `2.009` requests HTTP, la API ejecutó **`4.819` llamadas a motores de disco/grafo** (`3.592` en MongoDB + `1.227` en Neo4j) más `2.009` evaluaciones con escritura en Redis (`6.828` operaciones NoSQL totales, razón de `3,40` operaciones internas por cada request HTTP).
   - **Recálculo redundante sobre el conjunto caliente (80/20):** Aunque el 80 % del tráfico (`1.595` requests) consulta reiteradamente los mismos 4 partidos y 8 selecciones, el 100 % de esas lecturas impacta contra Neo4j y MongoDB, limitando el caudal global a **`124,59 ops/s`** y manteniendo la mediana en **`167,838 ms`**.
   - *(Nota sobre sensibilidad del timeout de adquisición):* En pruebas preliminares exploratorias con el timeout por defecto del Hito 10 (`2.000 ms`) bajo picos de CPU del host, el encolamiento sobre `maxConnectionPoolSize=5` llegó a producir rechazos `HTTP 503` (`DEPENDENCY_UNAVAILABLE`) y `CLIENT_TIMEOUT`. Con el margen unificado de `dependencyTimeoutMs = 3.000 ms`, las peticiones no fallan pero sufren la penalización de cola reflejada en el p95 (`308,750 ms`) y p99 (`532,104 ms`).
