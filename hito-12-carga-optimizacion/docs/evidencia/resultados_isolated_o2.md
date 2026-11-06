# Resultados de Prueba de Carga — Flujo Optimizado (Hito 12)

- **Modo ejecutado:** `isolated_o2`
- **Fecha de ejecución:** `2026-11-06T18:43:48.278Z`
- **Commit Git:** `cd653d6` (rama `fix/hito13-complete`, estado del árbol: `clean`)
- **Hardware / SO:** linux (x64) — QEMU Virtual CPU version 2.5+ (24 CPUs lógicas, 30.47 GiB RAM) — Node.js `v24.13.0`
- **Versiones observadas:** MongoDB (`db version v7.0.45`), Neo4j Servidor (`neo4j 2026.10.1`, cliente CLI: `Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.3 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=fa199f3d245589d0`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (7476 ops, media 1.599 ms) |
| Rampa de incremento (Ramp-up) | 4 s (observada: 4 s, completada: `true`) |
| Período de sostenimiento (Steady-state) | 12 s (observado: 12.003 s, completado: `true`) |
| Duración total medida | **16.003 s** |
| Motivo de finalización de ventana | `TIME_WINDOW_COMPLETED` (tope seguridad: 500000 ops) |
| Configuración efectiva de motores | MongoDB pool=`5`, Neo4j pool=`5`, timeout=`3000 ms` |
| Política efectiva de caché y sesión | TTLs (`match=120s`, `team=300s`, `events=15s`), throttle sesión=`0s` |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **64462** |
| Operaciones exitosas (`HTTP 200`) | **64462** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **64462 / 64462** |
| Throughput global sostenido | **4028.12 ops/s** |
| Volumen HTTP transferido | 204923.67 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 64462 | 1.281 | 5.353 | 3.416 | **5.232** | 5.979 | **9.539** | **11.647** | 126.992 |
| **Claves Calientes (Hotspot 80 %)** | 51520 | 1.281 | 5.345 | 3.358 | **5.232** | 5.979 | **9.519** | **11.643** | 126.991 |
| **Claves Frías (Long-tail 20 %)** | 12942 | 1.32 | 5.383 | 3.639 | **5.232** | 5.978 | **9.586** | **11.67** | 126.992 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 1353 | 2.1 % |
| `2 - 5 ms` | 17009 | 26.4 % |
| `5 - 10 ms` | 43107 | 66.9 % |
| `10 - 25 ms` | 2909 | 4.5 % |
| `25 - 50 ms` | 12 | 0.0 % |
| `50 - 100 ms` | 48 | 0.1 % |
| `>= 100 ms` | 24 | 0.0 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 25890 | 25890 | 0 | **1617.82** | 1.281 | 5.314 | **5.207** | **9.146** | **11.616** | 126.991 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 19258 | 19258 | 0 | **1203.4** | 1.356 | 5.378 | **5.274** | **9.501** | **11.604** | 126.99 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 12832 | 12832 | 0 | **801.85** | 1.312 | 5.396 | **5.235** | **10.107** | **11.999** | 126.992 |
| `GET /equipos/:codigo` | Redis + MongoDB | 6482 | 6482 | 0 | **405.05** | 1.327 | 5.351 | **5.202** | **9.739** | **11.604** | 126.935 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 64462 | 24 VUs concurrentes (`fetch`) | 5.353 | 5.232 | **9.539** | **11.647** | 126.992 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 64462 | Zod validation + serialización | 2.302 | 1.935 | **3.664** | **7.821** | 122.446 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 64462 | Escrituras renovación: 64462 (omitidas: 0) | 1.014 | 0.801 | **1.569** | **6.059** | 106.937 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 64462 | Activo: `true` — Hit Ratio: **99.94 %** (64423 hits / 39 misses) | 0.71 | 0.375 | **1.888** | **2.854** | 31.628 | Escrituras a caché: 39 |
| **MongoDB (Driver)** | 2 | `maxPoolSize=5` | 4.792 | 2.528 | **7.056** | **7.056** | 7.056 | Fallos: 0 |
| **Neo4j (Driver Bolt)** | 37 | `maxConnectionPoolSize=5` | 5.211 | 4.538 | **11.47** | **11.923** | 11.923 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `399.59 MiB` -> `734.49 MiB`
- **Heap V8 Usado (Antes -> Después):** `200.56 MiB` -> `275.19 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `16500.47 ms`, System `1646.68 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-fix-mongodb-1` | 0.98% | 322.1MiB / 29.28GiB | 1.07% | 18.7MB / 119MB | 347MB / 37.3MB |
| `fixture2030-fix-neo4j-1` | 2.59% | 1.229GiB / 29.28GiB | 4.20% | 20.7MB / 33MB | 77.1MB / 57.1MB |
| `fixture2030-fix-redis-1` | 0.07% | 13.71MiB / 29.28GiB | 0.05% | 72MB / 283MB | 21.3MB / 39.9MB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*