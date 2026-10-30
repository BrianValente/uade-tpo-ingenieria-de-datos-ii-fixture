# Resultados de Prueba de Carga — Línea Base (Hito 12)

- **Modo ejecutado:** `baseline`
- **Fecha de ejecución:** `2026-10-30T12:58:10.366Z`
- **Commit Git:** `acb8fc0` (rama `feature/hito-12-carga-optimizacion`, estado del árbol: `clean`)
- **Hardware / SO:** win32 (x64) — AMD Ryzen 5 5600U with Radeon Graphics (12 CPUs lógicas, 7.31 GiB RAM) — Node.js `v22.18.0`
- **Versiones observadas:** MongoDB (`db version v7.0.40`), Neo4j (`Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.2 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=9afb359f90603816`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (173 ops, media 68.471 ms) |
| Rampa de incremento (Ramp-up) | 4 s (observada: 4 s, completada: `true`) |
| Período de sostenimiento (Steady-state) | 12 s (observado: 12.084 s, completado: `true`) |
| Duración total medida | **16.084 s** |
| Motivo de finalización de ventana | `TIME_WINDOW_COMPLETED` (tope seguridad: 50000 ops) |
| Configuración efectiva de motores | MongoDB pool=`5`, Neo4j pool=`5`, timeout=`3000 ms` |
| Política efectiva de caché y sesión | TTLs (`match=0s`, `team=0s`, `events=0s`), throttle sesión=`0s` |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **2227** |
| Operaciones exitosas (`HTTP 200`) | **2227** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **2227 / 2227** |
| Throughput global sostenido | **138.46 ops/s** |
| Volumen HTTP transferido | 7119.83 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 2227 | 23.761 | 155.692 | 59.615 | **157.768** | 210.811 | **242.841** | **380.44** | 677.89 |
| **Claves Calientes (Hotspot 80 %)** | 1779 | 23.761 | 154.824 | 57.618 | **157.601** | 210.078 | **237.75** | **350.466** | 677.89 |
| **Claves Frías (Long-tail 20 %)** | 448 | 26.9 | 159.141 | 66.848 | **157.829** | 216.252 | **263.206** | **401.036** | 476.355 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 0 | 0.0 % |
| `5 - 10 ms` | 0 | 0.0 % |
| `10 - 25 ms` | 1 | 0.0 % |
| `25 - 50 ms` | 37 | 1.7 % |
| `50 - 100 ms` | 331 | 14.9 % |
| `>= 100 ms` | 1858 | 83.4 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 901 | 901 | 0 | **56.02** | 45.218 | 168.232 | **163.44** | **263.111** | **380.44** | 418.777 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 665 | 665 | 0 | **41.35** | 26.9 | 184.74 | **185.362** | **247.483** | **442.563** | 677.89 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 458 | 458 | 0 | **28.48** | 36.835 | 107.749 | **100.227** | **189.794** | **304.858** | 335.498 |
| `GET /equipos/:codigo` | Redis + MongoDB | 203 | 203 | 0 | **12.62** | 23.761 | 113.047 | **116.867** | **150.017** | **177.849** | 313.875 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 2227 | 24 VUs concurrentes (`fetch`) | 155.692 | 157.768 | **242.841** | **380.44** | 677.89 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 2227 | Zod validation + serialización | 124.97 | 126.784 | **209.682** | **367.21** | 643.505 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 2227 | Escrituras renovación: 2227 (omitidas: 0) | 24.087 | 22.095 | **42.75** | **88.615** | 170.04 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 0 | Activo: `false` — Hit Ratio: **0 %** (0 hits / 0 misses) | 0 | 0 | **0** | **0** | 0 | Escrituras a caché: 0 |
| **MongoDB 7.0 (Driver)** | 4000 | `maxPoolSize=5` | 62.552 | 63.1 | **94.668** | **174.204** | 511.591 | Fallos: 0 |
| **Neo4j 5.x (Driver Bolt)** | 1359 | `maxConnectionPoolSize=5` | 49.283 | 40.869 | **101.74** | **266.56** | 311.475 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `153.11 MiB` -> `233.89 MiB`
- **Heap V8 Usado (Antes -> Después):** `59.78 MiB` -> `139.63 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `5047 ms`, System `312 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-mongodb-1` | 0.88% | 250.7MiB / 3.483GiB | 7.03% | 4.65MB / 30.1MB | 758MB / 65.8MB |
| `fixture2030-neo4j-1` | 1.34% | 723.6MiB / 3.483GiB | 20.29% | 5.08MB / 7.52MB | 581MB / 222MB |
| `fixture2030-redis-1` | 0.33% | 30.26MiB / 3.483GiB | 0.85% | 22.2MB / 72.1MB | 123MB / 700kB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*