# Resultados de Prueba de Carga — Flujo Optimizado (Hito 12)

- **Modo ejecutado:** `optimized`
- **Fecha de ejecución:** `2026-10-26T21:08:10.808Z`
- **Commit Git:** `d350d50` (rama `feature/hito-12-carga-optimizacion`)
- **Hardware / SO:** win32 (x64) — AMD Ryzen 5 5600U with Radeon Graphics (12 CPUs lógicas, 7.31 GiB RAM) — Node.js `v22.18.0`
- **Versiones observadas:** MongoDB (`no-disponible`), Neo4j (`no-disponible`), Redis (`Redis server v=8.10.2 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=9afb359f90603816`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (117 ops, media 103.453 ms) |
| Rampa de incremento (Ramp-up) | 4 s |
| Período de sostenimiento (Steady-state) | 12 s |
| Duración total medida | **16.029 s** |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **4439** |
| Operaciones exitosas (`HTTP 200`) | **4439** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **4439 / 4439** |
| Throughput global sostenido | **276.94 ops/s** |
| Volumen HTTP transferido | 14333.86 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 4439 | 25.541 | 77.879 | 51.418 | **65.834** | 126.178 | **159.28** | **245.069** | 1764.444 |
| **Claves Calientes (Hotspot 80 %)** | 3546 | 25.541 | 74.548 | 35.623 | **65.001** | 116.944 | **146.464** | **216.567** | 273.819 |
| **Claves Frías (Long-tail 20 %)** | 893 | 30.148 | 91.107 | 88.792 | **68.66** | 163.435 | **211.781** | **286.513** | 1764.444 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 0 | 0.0 % |
| `5 - 10 ms` | 0 | 0.0 % |
| `10 - 25 ms` | 0 | 0.0 % |
| `25 - 50 ms` | 884 | 19.9 % |
| `50 - 100 ms` | 2773 | 62.5 % |
| `>= 100 ms` | 782 | 17.6 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 1778 | 1778 | 0 | **110.92** | 25.541 | 75.063 | **64.998** | **148.183** | **245.045** | 566.664 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 1361 | 1361 | 0 | **84.91** | 26.952 | 76.442 | **65.658** | **155.993** | **215.037** | 273.488 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 870 | 870 | 0 | **54.28** | 30.347 | 84.469 | **66.889** | **186.515** | **264.871** | 1764.444 |
| `GET /equipos/:codigo` | Redis + MongoDB | 430 | 430 | 0 | **26.83** | 29.735 | 80.738 | **66.845** | **185.188** | **262.856** | 286.513 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 4439 | 24 VUs concurrentes (`fetch`) | 77.879 | 65.834 | **159.28** | **245.069** | 1764.444 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 4439 | Zod validation + serialización | 51.058 | 39.388 | **122.905** | **207.024** | 1730.211 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 4439 | Escrituras renovación: 0 (omitidas: 4439) | 23.79 | 17.691 | **57.893** | **166.192** | 197.575 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 4439 | Activo: `true` — Hit Ratio: **96.53 %** (4285 hits / 154 misses) | 19.163 | 14.603 | **47.231** | **102.918** | 141.259 | Escrituras a caché: 154 |
| **MongoDB 7.0 (Driver)** | 118 | `maxPoolSize=25` | 29.905 | 27.553 | **56.816** | **73.187** | 135.845 | Fallos: 0 |
| **Neo4j 5.x (Driver Bolt)** | 60 | `maxConnectionPoolSize=25` | 141.194 | 86.383 | **276.867** | **1698.463** | 1698.463 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `136.41 MiB` -> `178.53 MiB`
- **Heap V8 Usado (Antes -> Después):** `59.76 MiB` -> `138.44 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `8562 ms`, System `547 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-mongodb-1` | 0.98% | 217.5MiB / 3.483GiB | 6.10% | 448kB / 2.34MB | 76.5MB / 9.04MB |
| `fixture2030-neo4j-1` | 2.38% | 913.5MiB / 3.483GiB | 25.61% | 670kB / 663kB | 122MB / 414MB |
| `fixture2030-redis-1` | 0.46% | 23.46MiB / 3.483GiB | 0.66% | 4.79MB / 16.3MB | 16.6MB / 0B |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*