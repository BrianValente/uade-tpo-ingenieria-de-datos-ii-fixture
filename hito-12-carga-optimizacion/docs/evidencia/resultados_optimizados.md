# Resultados de Prueba de Carga — Flujo Optimizado (Hito 12)

- **Modo ejecutado:** `optimized`
- **Fecha de ejecución:** `2026-11-06T18:44:14.293Z`
- **Commit Git:** `cd653d6` (rama `fix/hito13-complete`, estado del árbol: `clean`)
- **Hardware / SO:** linux (x64) — QEMU Virtual CPU version 2.5+ (24 CPUs lógicas, 30.76 GiB RAM) — Node.js `v24.13.0`
- **Versiones observadas:** MongoDB (`db version v7.0.45`), Neo4j Servidor (`neo4j 2026.10.1`, cliente CLI: `Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.3 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=fa199f3d245589d0`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (7498 ops, media 1.594 ms) |
| Rampa de incremento (Ramp-up) | 4 s (observada: 4 s, completada: `true`) |
| Período de sostenimiento (Steady-state) | 12 s (observado: 12.002 s, completado: `true`) |
| Duración total medida | **16.002 s** |
| Motivo de finalización de ventana | `TIME_WINDOW_COMPLETED` (tope seguridad: 500000 ops) |
| Configuración efectiva de motores | MongoDB pool=`25`, Neo4j pool=`25`, timeout=`3000 ms` |
| Política efectiva de caché y sesión | TTLs (`match=120s`, `team=300s`, `events=15s`), throttle sesión=`60s` |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **63452** |
| Operaciones exitosas (`HTTP 200`) | **63452** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **63452 / 63452** |
| Throughput global sostenido | **3965.25 ops/s** |
| Volumen HTTP transferido | 201658.06 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 63452 | 1.254 | 5.438 | 3.026 | **5.325** | 6.099 | **9.254** | **11.368** | 87.317 |
| **Claves Calientes (Hotspot 80 %)** | 50719 | 1.254 | 5.433 | 3.003 | **5.324** | 6.096 | **9.187** | **11.363** | 87.317 |
| **Claves Frías (Long-tail 20 %)** | 12733 | 1.32 | 5.459 | 3.117 | **5.329** | 6.114 | **9.406** | **11.386** | 87.174 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 1276 | 2.0 % |
| `2 - 5 ms` | 13388 | 21.1 % |
| `5 - 10 ms` | 45873 | 72.3 % |
| `10 - 25 ms` | 2832 | 4.5 % |
| `25 - 50 ms` | 11 | 0.0 % |
| `50 - 100 ms` | 72 | 0.1 % |
| `>= 100 ms` | 0 | 0.0 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 25487 | 25487 | 0 | **1592.74** | 1.254 | 5.416 | **5.296** | **8.842** | **11.316** | 87.304 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 18947 | 18947 | 0 | **1184.04** | 1.335 | 5.503 | **5.371** | **10.048** | **11.743** | 87.317 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 12636 | 12636 | 0 | **789.65** | 1.338 | 5.422 | **5.33** | **8.707** | **11.255** | 87.224 |
| `GET /equipos/:codigo` | Redis + MongoDB | 6382 | 6382 | 0 | **398.83** | 1.32 | 5.365 | **5.297** | **8.542** | **11.114** | 86.676 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 63452 | 24 VUs concurrentes (`fetch`) | 5.438 | 5.325 | **9.254** | **11.368** | 87.317 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 63452 | Zod validation + serialización | 2.19 | 1.882 | **3.557** | **7.382** | 82.246 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 63452 | Escrituras renovación: 0 (omitidas: 63452) | 0.919 | 0.708 | **1.688** | **5.967** | 65.934 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 63452 | Activo: `true` — Hit Ratio: **99.94 %** (63415 hits / 37 misses) | 0.638 | 0.347 | **1.782** | **2.838** | 28.464 | Escrituras a caché: 37 |
| **MongoDB (Driver)** | 2 | `maxPoolSize=25` | 2.55 | 2.484 | **2.616** | **2.616** | 2.616 | Fallos: 0 |
| **Neo4j (Driver Bolt)** | 35 | `maxConnectionPoolSize=25` | 5.086 | 4.842 | **10.117** | **11.127** | 11.127 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `422.88 MiB` -> `727.66 MiB`
- **Heap V8 Usado (Antes -> Después):** `189.66 MiB` -> `296.11 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `16723.26 ms`, System `1462.06 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-fix-mongodb-1` | 28.67% | 323MiB / 29.28GiB | 1.08% | 18.8MB / 120MB | 347MB / 37.4MB |
| `fixture2030-fix-neo4j-1` | 0.32% | 1.234GiB / 29.28GiB | 4.21% | 20.9MB / 33.2MB | 77.1MB / 57.4MB |
| `fixture2030-fix-redis-1` | 0.09% | 13.44MiB / 29.28GiB | 0.04% | 128MB / 540MB | 21.3MB / 40.7MB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*