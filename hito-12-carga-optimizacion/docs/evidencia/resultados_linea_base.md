# Resultados de Prueba de Carga — Línea Base (Hito 12)

- **Modo ejecutado:** `baseline`
- **Fecha de ejecución:** `2026-11-06T18:42:56.624Z`
- **Commit Git:** `cd653d6` (rama `fix/hito13-complete`, estado del árbol: `clean`)
- **Hardware / SO:** linux (x64) — QEMU Virtual CPU version 2.5+ (24 CPUs lógicas, 29.98 GiB RAM) — Node.js `v24.13.0`
- **Versiones observadas:** MongoDB (`db version v7.0.45`), Neo4j Servidor (`neo4j 2026.10.1`, cliente CLI: `Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.3 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=fa199f3d245589d0`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (2208 ops, media 5.418 ms) |
| Rampa de incremento (Ramp-up) | 4 s (observada: 4 s, completada: `true`) |
| Período de sostenimiento (Steady-state) | 12 s (observado: 12.012 s, completado: `true`) |
| Duración total medida | **16.012 s** |
| Motivo de finalización de ventana | `TIME_WINDOW_COMPLETED` (tope seguridad: 500000 ops) |
| Configuración efectiva de motores | MongoDB pool=`5`, Neo4j pool=`5`, timeout=`3000 ms` |
| Política efectiva de caché y sesión | TTLs (`match=0s`, `team=0s`, `events=0s`), throttle sesión=`0s` |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **17669** |
| Operaciones exitosas (`HTTP 200`) | **17669** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **17669 / 17669** |
| Throughput global sostenido | **1103.48 ops/s** |
| Volumen HTTP transferido | 56196.92 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 17669 | 2.228 | 19.57 | 7.449 | **19.573** | 28.929 | **31.381** | **36.682** | 61.851 |
| **Claves Calientes (Hotspot 80 %)** | 14211 | 2.502 | 19.606 | 7.489 | **19.633** | 28.953 | **31.497** | **36.745** | 61.851 |
| **Claves Frías (Long-tail 20 %)** | 3458 | 2.228 | 19.422 | 7.281 | **19.36** | 28.722 | **30.767** | **36.283** | 57.834 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 182 | 1.0 % |
| `5 - 10 ms` | 1823 | 10.3 % |
| `10 - 25 ms` | 11523 | 65.2 % |
| `25 - 50 ms` | 4107 | 23.2 % |
| `50 - 100 ms` | 34 | 0.2 % |
| `>= 100 ms` | 0 | 0.0 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 7152 | 7152 | 0 | **446.67** | 3.997 | 20.005 | **20.122** | **27.838** | **32.726** | 60.397 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 5290 | 5290 | 0 | **330.38** | 4.383 | 25.27 | **26.22** | **34.881** | **39.065** | 61.851 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 3487 | 3487 | 0 | **217.77** | 2.228 | 11.698 | **11.357** | **18.382** | **23.212** | 43.976 |
| `GET /equipos/:codigo` | Redis + MongoDB | 1740 | 1740 | 0 | **108.67** | 2.502 | 16.23 | **16.432** | **22.717** | **26.607** | 49.438 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 17669 | 24 VUs concurrentes (`fetch`) | 19.57 | 19.573 | **31.381** | **36.682** | 61.851 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 17669 | Zod validation + serialización | 14.476 | 14.395 | **26.19** | **31.258** | 54.394 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 17669 | Escrituras renovación: 17669 (omitidas: 0) | 2.128 | 1.754 | **4.296** | **7.617** | 25.374 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 0 | Activo: `false` — Hit Ratio: **0 %** (0 hits / 0 misses) | 0 | 0 | **0** | **0** | 0 | Escrituras a caché: 0 |
| **MongoDB (Driver)** | 31914 | `maxPoolSize=5` | 8.436 | 8.472 | **14.259** | **17.377** | 39.127 | Fallos: 0 |
| **Neo4j (Driver Bolt)** | 10639 | `maxConnectionPoolSize=5` | 4.119 | 3.803 | **7.867** | **10.965** | 49.27 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `387.84 MiB` -> `550.25 MiB`
- **Heap V8 Usado (Antes -> Después):** `180.96 MiB` -> `254.8 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `17427.58 ms`, System `1661.11 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-fix-mongodb-1` | 0.87% | 314.4MiB / 29.28GiB | 1.05% | 10.2MB / 58.5MB | 347MB / 36.9MB |
| `fixture2030-fix-neo4j-1` | 0.28% | 1.172GiB / 29.28GiB | 4.00% | 9.73MB / 15.4MB | 77.1MB / 56.5MB |
| `fixture2030-fix-redis-1` | 0.16% | 12.64MiB / 29.28GiB | 0.04% | 12.1MB / 13.6MB | 21.1MB / 6.83MB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*