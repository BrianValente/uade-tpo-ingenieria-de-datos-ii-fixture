# Resultados de Prueba de Carga — Flujo Optimizado (Hito 12)

- **Modo ejecutado:** `optimized`
- **Fecha de ejecución:** `2026-10-30T14:56:55.226Z`
- **Commit Git:** `5533d42` (rama `feature/hito-12-carga-optimizacion`, estado del árbol: `clean`)
- **Hardware / SO:** win32 (x64) — AMD Ryzen 5 5600U with Radeon Graphics (12 CPUs lógicas, 7.31 GiB RAM) — Node.js `v22.18.0`
- **Versiones observadas:** MongoDB (`db version v7.0.40`), Neo4j Servidor (`neo4j 2026.10.1`, cliente CLI: `Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.2 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=9afb359f90603816`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (550 ops, media 21.471 ms) |
| Rampa de incremento (Ramp-up) | 4 s (observada: 4 s, completada: `true`) |
| Período de sostenimiento (Steady-state) | 12 s (observado: 12.018 s, completado: `true`) |
| Duración total medida | **16.018 s** |
| Motivo de finalización de ventana | `TIME_WINDOW_COMPLETED` (tope seguridad: 50000 ops) |
| Configuración efectiva de motores | MongoDB pool=`25`, Neo4j pool=`25`, timeout=`3000 ms` |
| Política efectiva de caché y sesión | TTLs (`match=120s`, `team=300s`, `events=15s`), throttle sesión=`60s` |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **8249** |
| Operaciones exitosas (`HTTP 200`) | **8249** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **8249 / 8249** |
| Throughput global sostenido | **514.98 ops/s** |
| Volumen HTTP transferido | 26140.63 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 8249 | 12.551 | 41.892 | 13.39 | **39.298** | 54.375 | **65.572** | **83.586** | 254.803 |
| **Claves Calientes (Hotspot 80 %)** | 6631 | 12.551 | 41.358 | 12.083 | **39.162** | 53.407 | **61.587** | **79.789** | 199.018 |
| **Claves Frías (Long-tail 20 %)** | 1618 | 13.854 | 44.079 | 17.601 | **39.988** | 59.51 | **72.343** | **98.668** | 254.803 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 0 | 0.0 % |
| `5 - 10 ms` | 0 | 0.0 % |
| `10 - 25 ms` | 138 | 1.7 % |
| `25 - 50 ms` | 6883 | 83.4 % |
| `50 - 100 ms` | 1195 | 14.5 % |
| `>= 100 ms` | 33 | 0.4 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 3340 | 3340 | 0 | **208.52** | 12.832 | 41.229 | **39.011** | **59.855** | **79.499** | 199.018 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 2454 | 2454 | 0 | **153.2** | 14.165 | 42.519 | **39.648** | **67.092** | **86.379** | 254.803 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 1636 | 1636 | 0 | **102.14** | 12.551 | 42.258 | **39.44** | **67.185** | **89.053** | 229.072 |
| `GET /equipos/:codigo` | Redis + MongoDB | 819 | 819 | 0 | **51.13** | 13.16 | 41.982 | **39.021** | **67.616** | **84.42** | 178.981 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 8249 | 24 VUs concurrentes (`fetch`) | 41.892 | 39.298 | **65.572** | **83.586** | 254.803 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 8249 | Zod validation + serialización | 21.659 | 17.924 | **41.317** | **66.515** | 226.914 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 8249 | Escrituras renovación: 0 (omitidas: 8249) | 9.411 | 7.338 | **21.348** | **39.054** | 159.511 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 8249 | Activo: `true` — Hit Ratio: **98.57 %** (8131 hits / 118 misses) | 8.628 | 6.89 | **18.879** | **33.771** | 169.871 | Escrituras a caché: 118 |
| **MongoDB (Driver)** | 83 | `maxPoolSize=25` | 21.024 | 19.153 | **33.85** | **176.65** | 176.65 | Fallos: 0 |
| **Neo4j (Driver Bolt)** | 43 | `maxConnectionPoolSize=25` | 32.62 | 30.051 | **48.454** | **96.102** | 96.102 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `150.53 MiB` -> `327.32 MiB`
- **Heap V8 Usado (Antes -> Después):** `71.17 MiB` -> `242.28 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `5859 ms`, System `515 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-mongodb-1` | 0.83% | 249.6MiB / 3.483GiB | 7.00% | 6.68MB / 42.5MB | 759MB / 80.6MB |
| `fixture2030-neo4j-1` | 1.74% | 724.2MiB / 3.483GiB | 20.30% | 7.47MB / 10.9MB | 613MB / 231MB |
| `fixture2030-redis-1` | 0.46% | 29.25MiB / 3.483GiB | 0.82% | 43.4MB / 150MB | 123MB / 754kB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*