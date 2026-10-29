# Resultados de Prueba de Carga — Línea Base (Hito 12)

- **Modo ejecutado:** `baseline`
- **Fecha de ejecución:** `2026-10-29T23:25:34.080Z`
- **Commit Git:** `abaec7c` (rama `feature/hito-12-carga-optimizacion`, estado del árbol: `clean`)
- **Hardware / SO:** win32 (x64) — AMD Ryzen 5 5600U with Radeon Graphics (12 CPUs lógicas, 7.31 GiB RAM) — Node.js `v22.18.0`
- **Versiones observadas:** MongoDB (`db version v7.0.40`), Neo4j (`Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.2 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=9afb359f90603816`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (291 ops, media 41.065 ms) |
| Rampa de incremento (Ramp-up) | 4 s |
| Período de sostenimiento (Steady-state) | 12 s |
| Duración total medida | **16.155 s** |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **3584** |
| Operaciones exitosas (`HTTP 200`) | **3584** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **3584 / 3584** |
| Throughput global sostenido | **221.85 ops/s** |
| Volumen HTTP transferido | 11496.80 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 3584 | 8.066 | 96.701 | 70.494 | **79.224** | 164.868 | **231.733** | **423.238** | 587.841 |
| **Claves Calientes (Hotspot 80 %)** | 2848 | 8.066 | 95.867 | 69.926 | **78.999** | 162.205 | **229.864** | **422.329** | 587.841 |
| **Claves Frías (Long-tail 20 %)** | 736 | 12.261 | 99.926 | 72.559 | **80.873** | 176.909 | **240.029** | **437.832** | 587.557 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 0 | 0.0 % |
| `5 - 10 ms` | 1 | 0.0 % |
| `10 - 25 ms` | 98 | 2.7 % |
| `25 - 50 ms` | 579 | 16.2 % |
| `50 - 100 ms` | 1779 | 49.6 % |
| `>= 100 ms` | 1127 | 31.4 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 1435 | 1435 | 0 | **88.83** | 19.09 | 103.056 | **85.771** | **236.94** | **422.329** | 530.928 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 1082 | 1082 | 0 | **66.98** | 12.439 | 115.805 | **95.927** | **296.273** | **490.29** | 587.841 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 721 | 721 | 0 | **44.63** | 16.888 | 67.134 | **53.918** | **168.794** | **263.477** | 357.417 |
| `GET /equipos/:codigo` | Redis + MongoDB | 346 | 346 | 0 | **21.42** | 8.066 | 72.212 | **61.558** | **163.065** | **281.01** | 320.948 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 3584 | 24 VUs concurrentes (`fetch`) | 96.701 | 79.224 | **231.733** | **423.238** | 587.841 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 3584 | Zod validation + serialización | 78.59 | 63.513 | **203.312** | **350.016** | 525.169 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 3584 | Escrituras renovación: 3584 (omitidas: 0) | 16.77 | 11.654 | **46.026** | **119.094** | 214.584 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 0 | Activo: `false` — Hit Ratio: **0 %** (0 hits / 0 misses) | 0 | 0 | **0** | **0** | 0 | Escrituras a caché: 0 |
| **MongoDB 7.0 (Driver)** | 6462 | `maxPoolSize=5` | 38.412 | 31.643 | **97.895** | **196.568** | 283.255 | Fallos: 0 |
| **Neo4j 5.x (Driver Bolt)** | 2156 | `maxConnectionPoolSize=5` | 29.878 | 22.213 | **77.987** | **136.831** | 216.376 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `157.63 MiB` -> `259.21 MiB`
- **Heap V8 Usado (Antes -> Después):** `75.03 MiB` -> `166.34 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `4812 ms`, System `671 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-mongodb-1` | 0.88% | 238.3MiB / 3.483GiB | 6.68% | 2.03MB / 12.5MB | 744MB / 41.6MB |
| `fixture2030-neo4j-1` | 38.89% | 644.6MiB / 3.483GiB | 18.07% | 2.12MB / 3.23MB | 574MB / 212MB |
| `fixture2030-redis-1` | 0.39% | 32.36MiB / 3.483GiB | 0.91% | 2.4MB / 1.52MB | 123MB / 541kB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*