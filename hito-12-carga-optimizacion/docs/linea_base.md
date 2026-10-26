# Documentación de la Línea Base Reproducible — Hito 12

**Asignatura:** Ingeniería de Datos II  
**Proyecto:** Plataforma Fixture Mundial 2030 — Grupo 5  

---

## 1. Identificación y Trazabilidad de la Línea Base (RF4, §5.4, RNF2)

Antes de introducir cualquier cambio en la lógica de acceso a datos, dimensionamiento de pools o estrategia de caché, se ejecutó y registró la **Línea Base (`baseline`)** conservando el comportamiento exacto de los adaptadores construidos en el Hito 10 (`hito-10-api`):

| Atributo de Trazabilidad | Valor Observado |
|:---|:---|
| **Fecha y hora de ejecución** | `2026-10-24T05:37:27.018Z` |
| **Commit base del repositorio** | `d350d50` (rama `feature/hito-12-carga-optimizacion`, partido desde `main` post-Hito 11) |
| **Comando de reproducción** | `pnpm --dir hito-10-api h12:linea-base` (`scripts/ejecutar_linea_base.ts`) |
| **Sistema Operativo y Arquitectura** | Windows 11 (`win32 x64`, kernel `10.0.22631`) |
| **Procesador y Memoria del Host** | AMD Ryzen 5 5600U with Radeon Graphics — 12 CPUs lógicas, 7,31 GiB RAM total |
| **Runtime de API y Generador** | Node.js `v22.18.0` + Fastify `5.12.7` |
| **Versiones de Motores NoSQL en Docker** | - **MongoDB:** `v7.0.40` (`fixture2030-mongodb-1`)<br>- **Neo4j:** `5.26.x` / Cypher-Shell `2026.10.1` (`fixture2030-neo4j-1`)<br>- **Redis:** `v8.10.2` (`fixture2030-redis-1`, `maxmemory 256mb`, `noeviction`) |
| **Configuración de la Línea Base** | - MongoDB `maxPoolSize = 5`, sin proyección de campos, 2 `findOne` separados en `GET /partidos/:id`, 3 operaciones (`findOne` + `find` + `countDocuments`) en `GET /equipos/:codigo/jugadores`.<br>- Neo4j `maxConnectionPoolSize = 5`, `connectionAcquisitionTimeout = 3000 ms`.<br>- Redis `READ_AND_RENEW_SESSION` ejecutando `TIME` + `HSET ultima_actividad` + `EXPIRE 1800` en el 100 % de las peticiones.<br>- Caché Read-Aside de datos de negocio **deshabilitado** (`cache-control: no-store`). |

---

## 2. Resumen de Métricas Observadas en la Línea Base (RF5, §5.4)

Los datos completos y las muestras crudas se encuentran versionados en [`evidencia/resultados_linea_base.json`](evidencia/resultados_linea_base.json) y [`evidencia/resultados_linea_base.md`](evidencia/resultados_linea_base.md).

### 2.1. Indicadores Globales del Período Medido
- **Concurrencia aplicada:** 24 usuarios virtuales concurrentes sobre 20 sesiones activas en Redis (tras 3 s de calentamiento excluido).
- **Duración efectiva medida:** `18,165 s` (16 s de ventana objetivo más el tiempo de drenaje de las peticiones en vuelo al cierre).
- **Operaciones medidas generadas:** **635 solicitudes HTTP**.
- **Operaciones exitosas (`HTTP 200`):** **566 solicitudes** (`89,13 %`), todas con integridad de estructura y contenido verificada (`566 / 566`).
- **Operaciones fallidas (`HTTP 503`):** **69 solicitudes** (**`10,87 %` de tasa de error**), concentradas exclusivamente en las rutas que dependen de Neo4j (`47` en `GET /partidos/:id` y `22` en `GET /partidos/:id/eventos`).
- **Throughput global sostenido:** **`34,96 ops/s`**.

### 2.2. Distribución de Latencia Extremo a Extremo (E2E)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las rutas)** | 635 | 11,374 | 606,008 | 801,069 | **267,811** | 2014,118 | **2039,774** | **3922,693** | 5149,397 |
| **Claves Calientes (Hotspot 80 %)** | 505 | 11,374 | 584,310 | 709,366 | **269,839** | 2014,118 | **2039,031** | **2328,070** | 3929,072 |
| **Claves Frías (Long-tail 20 %)** | 125 | 11,784 | 516,567 | 657,876 | **260,139** | 1592,509 | **2019,902** | **2065,464** | 3897,346 |

> **Observación crítica sobre el promedio vs. percentiles (§7):** La media global (`606 ms`) y la mediana (`267,8 ms`) ocultan una distribución fuertemente bimodal: mientras las rutas solo-MongoDB responden en `< 300 ms` en p95, las rutas que consultan Neo4j sufren encolamiento severo en el pool de 5 conexiones, disparando el **p90 a `2.014 ms`**, el **p95 a `2.039 ms`** y el **p99 a `3.922 ms`**, con el **87,6 % de las operaciones por encima de `100 ms`**. Además, en la línea base **no existe diferencia significativa entre claves calientes y claves frías** (`p50 = 269,8 ms` vs `260,1 ms`), ya que la ausencia de caché obliga a recalcular en disco/grafo el 100 % de las peticiones repetidas.

### 2.3. Desglose por Perfil de Endpoint HTTP

| Endpoint | Motores | Solicitudes | Éxitos (`200`) | Errores (`503`) | Throughput (ops/s) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 265 | 218 | **47** | **14,59** | 423,882 | **2050,251** | 5003,734 | 5149,397 |
| `GET /equipos/:codigo/jugadores` | Redis + MongoDB | 182 | 182 | 0 | **10,02** | 197,952 | **298,205** | 335,868 | 376,821 |
| `GET /partidos/:id/eventos` | Redis + Neo4j | 136 | 114 | **22** | **7,49** | 291,269 | **2071,892** | 5000,532 | 5008,580 |
| `GET /equipos/:codigo` | Redis + MongoDB | 52 | 52 | 0 | **2,86** | 114,668 | **220,775** | 252,942 | 252,942 |

---

## 3. Diferenciación de Mediciones por Capa y Recursos (RF6, §5.4)

La instrumentación interna permitió aislar cuánto tiempo y cuántas operaciones consumió cada eslabón de la cadena:

| Capa / Producto | Operaciones Registradas | p50 (ms) | p95 (ms) | p99 (ms) | Fallos | Diagnóstico de Comportamiento en Línea Base |
|:---|---:|---:|---:|---:|---:|:---|
| **Generador de Carga (Cliente HTTP)** | 635 | 267,811 | 2039,774 | 3922,693 | 69 (`503`) | El generador mantuvo 24 VUs activos sin saturar CPU local; esperó a los sockets HTTP de la API. |
| **Servidor API Fastify (`onResponse`)** | 630 | 223,592 | 2021,539 | 2314,905 | - | El 92 % del tiempo de respuesta transcurre dentro del handler esperando a los drivers NoSQL. |
| **Redis — Sesiones Lua** | 635 | 29,442 | 63,309 | 86,632 | 0 | **635 escrituras `HSET` + `EXPIRE`** (una en cada request `GET`). Contenedor en `0,32 %` CPU y `22,5 MiB` RAM. |
| **MongoDB 7.0 — Driver** | **1.034** | 54,171 | 122,450 | 161,847 | 0 | **Amplificación de consultas ($1,63\times$):** 1.034 operaciones para 635 requests HTTP, encoladas tras `maxPoolSize=5`. |
| **Neo4j 5.x — Driver Bolt** | **401** | 232,004 | **2012,273** | **5410,765** | **69** | **Cuello de botella principal:** 401 consultas Cypher compitiendo por `maxConnectionPoolSize=5`; el contenedor escaló al **`75,75 %` de CPU** (`913,9 MiB` RAM) y agotó el timeout de adquisición en 69 peticiones. |

---

## 4. Observaciones sobre la Estabilidad de la Prueba (§5.4)

1. **Reproducibilidad y estabilidad funcional:** Los tres contenedores Docker se mantuvieron `healthy` durante y después de la prueba. Ningún proceso sufrió caídas (*crashes*) ni corrupción de datos.
2. **Degradación bajo concurrencia sostenida:** La tasa de error del **`10,87 %` (`HTTP 503`)** demuestra empíricamente que la configuración base del Hito 10 (diseñada para validación funcional secuencial con pools de tamaño 5 y sin caché) **no soporta 24 usuarios concurrentes** sin rechazar solicitudes por agotamiento del pool de Neo4j y encolamiento en MongoDB.
