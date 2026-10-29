# Resultados de Prueba de Carga — Flujo Optimizado (Hito 12)

- **Modo ejecutado:** `optimized`
- **Fecha de ejecución:** `2026-10-29T23:36:26.920Z`
- **Commit Git:** `abaec7c` (rama `feature/hito-12-carga-optimizacion`, estado del árbol: `modified`)
- **Hardware / SO:** win32 (x64) — AMD Ryzen 5 5600U with Radeon Graphics (12 CPUs lógicas, 7.31 GiB RAM) — Node.js `v22.18.0`
- **Versiones observadas:** MongoDB (`db version v7.0.40`), Neo4j (`Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.2 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=9afb359f90603816`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (1312 ops, media 9.075 ms) |
| Rampa de incremento (Ramp-up) | 4 s |
| Período de sostenimiento (Steady-state) | 12 s |
| Duración total medida | **5.95 s** |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **5000** |
| Operaciones exitosas (`HTTP 200`) | **5000** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **5000 / 5000** |
| Throughput global sostenido | **840.34 ops/s** |
| Volumen HTTP transferido | 15943.78 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 5000 | 6.473 | 20.864 | 17.731 | **17.64** | 24.352 | **33.982** | **96.889** | 423.174 |
| **Claves Calientes (Hotspot 80 %)** | 3996 | 6.473 | 20.457 | 16.184 | **17.561** | 23.836 | **29.443** | **84.936** | 184.352 |
| **Claves Frías (Long-tail 20 %)** | 1004 | 7.222 | 22.485 | 22.803 | **18.041** | 27.239 | **37.892** | **131.818** | 423.174 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 0 | 0.0 % |
| `5 - 10 ms` | 123 | 2.5 % |
| `10 - 25 ms` | 4425 | 88.5 % |
| `25 - 50 ms` | 301 | 6.0 % |
| `50 - 100 ms` | 101 | 2.0 % |
| `>= 100 ms` | 50 | 1.0 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 2020 | 2020 | 0 | **339.5** | 6.473 | 20.564 | **17.626** | **28.154** | **131.777** | 184.316 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 1504 | 1504 | 0 | **252.77** | 7.096 | 20.893 | **17.74** | **32.561** | **85.31** | 184.352 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 983 | 983 | 0 | **165.21** | 6.918 | 21.498 | **17.574** | **37.759** | **134.332** | 423.174 |
| `GET /equipos/:codigo` | Redis + MongoDB | 493 | 493 | 0 | **82.86** | 7.148 | 20.742 | **17.547** | **34.8** | **84.563** | 190.417 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 5000 | 24 VUs concurrentes (`fetch`) | 20.864 | 17.64 | **33.982** | **96.889** | 423.174 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 5000 | Zod validation + serialización | 10.859 | 7.573 | **19.965** | **88.561** | 417.59 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 5000 | Escrituras renovación: 0 (omitidas: 5000) | 6.164 | 3.771 | **8.162** | **70.576** | 170.588 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 5000 | Activo: `true` — Hit Ratio: **98.96 %** (4948 hits / 52 misses) | 3.029 | 2.375 | **4.635** | **27.15** | 78.183 | Escrituras a caché: 52 |
| **MongoDB 7.0 (Driver)** | 38 | `maxPoolSize=25` | 9.681 | 9.428 | **16.385** | **18.625** | 18.625 | Fallos: 0 |
| **Neo4j 5.x (Driver Bolt)** | 15 | `maxConnectionPoolSize=25` | 53.52 | 16.245 | **325.788** | **325.788** | 325.788 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `177 MiB` -> `271.14 MiB`
- **Heap V8 Usado (Antes -> Después):** `97.35 MiB` -> `112.37 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `1219 ms`, System `94 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-mongodb-1` | 0.59% | 235.6MiB / 3.483GiB | 6.61% | 2.21MB / 15.2MB | 745MB / 44.7MB |
| `fixture2030-neo4j-1` | 2.25% | 648.7MiB / 3.483GiB | 18.19% | 2.42MB / 3.58MB | 576MB / 218MB |
| `fixture2030-redis-1` | 3.40% | 31.18MiB / 3.483GiB | 0.87% | 13.2MB / 44.4MB | 123MB / 569kB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*