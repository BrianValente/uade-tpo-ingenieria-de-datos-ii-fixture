# Resultados de Prueba de Carga — Línea Base (Hito 12)

- **Modo ejecutado:** `baseline`
- **Fecha de ejecución:** `2026-10-24T05:37:27.018Z`
- **Commit Git:** `d350d50` (rama `feature/hito-12-carga-optimizacion`)
- **Hardware / SO:** win32 (x64) — AMD Ryzen 5 5600U with Radeon Graphics (12 CPUs lógicas, 7.31 GiB RAM) — Node.js `v22.18.0`
- **Versiones observadas:** MongoDB (`db version v7.0.40`), Neo4j (`no-disponible`), Redis (`Redis server v=8.10.2 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=9afb359f90603816`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (5 ops, media 2367.296 ms) |
| Rampa de incremento (Ramp-up) | 4 s |
| Período de sostenimiento (Steady-state) | 12 s |
| Duración total medida | **18.165 s** |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **635** |
| Operaciones exitosas (`HTTP 200`) | **566** |
| Operaciones con error | **69** (10.87 %) |
| Respuestas con integridad de payload validada | **566 / 566** |
| Throughput global sostenido | **34.96 ops/s** |
| Volumen HTTP transferido | 1895.71 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 635 | 11.374 | 606.008 | 801.069 | **267.811** | 2014.118 | **2039.774** | **3922.693** | 5149.397 |
| **Claves Calientes (Hotspot 80 %)** | 505 | 11.374 | 584.31 | 709.366 | **269.839** | 2014.118 | **2039.031** | **2328.07** | 3929.072 |
| **Claves Frías (Long-tail 20 %)** | 125 | 11.784 | 516.567 | 657.876 | **260.139** | 1592.509 | **2019.902** | **2065.464** | 3897.346 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 0 | 0.0 % |
| `5 - 10 ms` | 0 | 0.0 % |
| `10 - 25 ms` | 27 | 4.3 % |
| `25 - 50 ms` | 22 | 3.5 % |
| `50 - 100 ms` | 30 | 4.7 % |
| `>= 100 ms` | 556 | 87.6 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 265 | 218 | 47 | **14.59** | 207.241 | 912.519 | **423.882** | **2050.251** | **5003.734** | 5149.397 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 182 | 182 | 0 | **10.02** | 18.586 | 172.43 | **197.952** | **298.205** | **335.868** | 376.821 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 136 | 114 | 22 | **7.49** | 126.633 | 779.396 | **291.269** | **2071.892** | **5000.532** | 5008.58 |
| `GET /equipos/:codigo` | Redis + MongoDB | 52 | 52 | 0 | **2.86** | 11.374 | 108.027 | **114.668** | **220.775** | **252.942** | 252.942 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 635 | 24 VUs concurrentes (`fetch`) | 606.008 | 267.811 | **2039.774** | **3922.693** | 5149.397 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 630 | Zod validation + serialización | 537.086 | 223.592 | **2021.539** | **2314.905** | 3916.198 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 635 | Escrituras renovación: 635 (omitidas: 0) | 30.667 | 29.442 | **63.309** | **86.632** | 169.832 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 0 | Activo: `false` — Hit Ratio: **0 %** (0 hits / 0 misses) | 0 | 0 | **0** | **0** | 0 | Escrituras a caché: 0 |
| **MongoDB 7.0 (Driver)** | 1034 | `maxPoolSize=5` | 56.871 | 54.171 | **122.45** | **161.847** | 206.594 | Fallos: 0 |
| **Neo4j 5.x (Driver Bolt)** | 401 | `maxConnectionPoolSize=5` | 770.355 | 232.004 | **2012.273** | **5410.765** | 5752.42 | Fallos: 69 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `154.92 MiB` -> `160.52 MiB`
- **Heap V8 Usado (Antes -> Después):** `57.21 MiB` -> `78.06 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `3265 ms`, System `266 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-mongodb-1` | 1.17% | 217.8MiB / 3.483GiB | 6.11% | 357kB / 1.77MB | 75.7MB / 7.14MB |
| `fixture2030-neo4j-1` | 75.75% | 913.9MiB / 3.483GiB | 25.62% | 520kB / 508kB | 122MB / 413MB |
| `fixture2030-redis-1` | 0.32% | 22.5MiB / 3.483GiB | 0.63% | 499kB / 266kB | 16.6MB / 0B |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*