# Resultados de Prueba de Carga — Flujo Optimizado (Hito 12)

- **Modo ejecutado:** `isolated_o1`
- **Fecha de ejecución:** `2026-11-06T18:43:22.515Z`
- **Commit Git:** `cd653d6` (rama `fix/hito13-complete`, estado del árbol: `clean`)
- **Hardware / SO:** linux (x64) — QEMU Virtual CPU version 2.5+ (24 CPUs lógicas, 30.18 GiB RAM) — Node.js `v24.13.0`
- **Versiones observadas:** MongoDB (`db version v7.0.45`), Neo4j Servidor (`neo4j 2026.10.1`, cliente CLI: `Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.3 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=fa199f3d245589d0`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (2258 ops, media 5.298 ms) |
| Rampa de incremento (Ramp-up) | 4 s (observada: 4 s, completada: `true`) |
| Período de sostenimiento (Steady-state) | 12 s (observado: 12.011 s, completado: `true`) |
| Duración total medida | **16.011 s** |
| Motivo de finalización de ventana | `TIME_WINDOW_COMPLETED` (tope seguridad: 500000 ops) |
| Configuración efectiva de motores | MongoDB pool=`25`, Neo4j pool=`25`, timeout=`3000 ms` |
| Política efectiva de caché y sesión | TTLs (`match=0s`, `team=0s`, `events=0s`), throttle sesión=`0s` |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **20398** |
| Operaciones exitosas (`HTTP 200`) | **20398** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **20398 / 20398** |
| Throughput global sostenido | **1274 ops/s** |
| Volumen HTTP transferido | 64890.41 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 20398 | 1.513 | 16.949 | 5.311 | **17.327** | 22.789 | **24.791** | **29.052** | 80.033 |
| **Claves Calientes (Hotspot 80 %)** | 16352 | 1.513 | 16.962 | 5.301 | **17.307** | 22.815 | **24.846** | **29.045** | 80.033 |
| **Claves Frías (Long-tail 20 %)** | 4046 | 2.023 | 16.898 | 5.352 | **17.389** | 22.722 | **24.582** | **29.07** | 79.587 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 9 | 0.0 % |
| `2 - 5 ms` | 449 | 2.2 % |
| `5 - 10 ms` | 1292 | 6.3 % |
| `10 - 25 ms` | 17725 | 86.9 % |
| `25 - 50 ms` | 909 | 4.5 % |
| `50 - 100 ms` | 14 | 0.1 % |
| `>= 100 ms` | 0 | 0.0 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 8214 | 8214 | 0 | **513.02** | 2.426 | 17.692 | **17.989** | **24.846** | **29.07** | 80.033 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 6108 | 6108 | 0 | **381.49** | 7.285 | 19.438 | **19.357** | **26.203** | **29.919** | 54.338 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 4035 | 4035 | 0 | **252.01** | 1.537 | 13.844 | **14.102** | **20.362** | **23.931** | 67.481 |
| `GET /equipos/:codigo` | Redis + MongoDB | 2041 | 2041 | 0 | **127.47** | 1.513 | 12.648 | **12.558** | **18.468** | **21.431** | 43.308 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 20398 | 24 VUs concurrentes (`fetch`) | 16.949 | 17.327 | **24.791** | **29.052** | 80.033 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 20398 | Zod validation + serialización | 11.176 | 11.484 | **17.512** | **20.866** | 74.544 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 20398 | Escrituras renovación: 20398 (omitidas: 0) | 2.466 | 2.422 | **4.743** | **8.519** | 25.832 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 0 | Activo: `false` — Hit Ratio: **0 %** (0 hits / 0 misses) | 0 | 0 | **0** | **0** | 0 | Escrituras a caché: 0 |
| **MongoDB (Driver)** | 16363 | `maxPoolSize=25` | 6.64 | 4.692 | **12.789** | **16.315** | 45.773 | Fallos: 0 |
| **Neo4j (Driver Bolt)** | 12249 | `maxConnectionPoolSize=25` | 5.14 | 5.029 | **7.998** | **11.684** | 66.079 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `380.13 MiB` -> `559.96 MiB`
- **Heap V8 Usado (Antes -> Después):** `167.27 MiB` -> `294.18 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `17648.69 ms`, System `1560.6 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-fix-mongodb-1` | 35.40% | 324.1MiB / 29.28GiB | 1.08% | 18.6MB / 119MB | 347MB / 37.2MB |
| `fixture2030-fix-neo4j-1` | 0.34% | 1.211GiB / 29.28GiB | 4.14% | 20.6MB / 32.8MB | 77.1MB / 56.8MB |
| `fixture2030-fix-redis-1` | 0.17% | 13.77MiB / 29.28GiB | 0.05% | 25.3MB / 22.3MB | 21.2MB / 14.6MB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*