# Resultados de Prueba de Carga — Línea Base (Hito 12)

- **Modo ejecutado:** `baseline`
- **Fecha de ejecución:** `2026-10-30T14:56:01.876Z`
- **Commit Git:** `5533d42` (rama `feature/hito-12-carga-optimizacion`, estado del árbol: `clean`)
- **Hardware / SO:** win32 (x64) — AMD Ryzen 5 5600U with Radeon Graphics (12 CPUs lógicas, 7.31 GiB RAM) — Node.js `v22.18.0`
- **Versiones observadas:** MongoDB (`db version v7.0.40`), Neo4j Servidor (`neo4j 2026.10.1`, cliente CLI: `Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.2 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=9afb359f90603816`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (261 ops, media 45.286 ms) |
| Rampa de incremento (Ramp-up) | 4 s (observada: 4 s, completada: `true`) |
| Período de sostenimiento (Steady-state) | 12 s (observado: 12.125 s, completado: `true`) |
| Duración total medida | **16.125 s** |
| Motivo de finalización de ventana | `TIME_WINDOW_COMPLETED` (tope seguridad: 50000 ops) |
| Configuración efectiva de motores | MongoDB pool=`5`, Neo4j pool=`5`, timeout=`3000 ms` |
| Política efectiva de caché y sesión | TTLs (`match=0s`, `team=0s`, `events=0s`), throttle sesión=`0s` |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **2009** |
| Operaciones exitosas (`HTTP 200`) | **2009** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **2009 / 2009** |
| Throughput global sostenido | **124.59 ops/s** |
| Volumen HTTP transferido | 6395.26 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 2009 | 14.338 | 172.95 | 90.44 | **167.838** | 247.187 | **308.75** | **532.104** | 756.323 |
| **Claves Calientes (Hotspot 80 %)** | 1595 | 14.338 | 172.872 | 90.475 | **168.013** | 247.092 | **304.542** | **531.205** | 756.323 |
| **Claves Frías (Long-tail 20 %)** | 414 | 15.88 | 173.251 | 90.305 | **166.473** | 247.284 | **340.348** | **532.979** | 652.422 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 0 | 0.0 % |
| `5 - 10 ms` | 0 | 0.0 % |
| `10 - 25 ms` | 11 | 0.5 % |
| `25 - 50 ms` | 43 | 2.1 % |
| `50 - 100 ms` | 301 | 15.0 % |
| `>= 100 ms` | 1654 | 82.3 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 810 | 810 | 0 | **50.23** | 42.616 | 192.526 | **179.245** | **417.604** | **630.289** | 756.323 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 595 | 595 | 0 | **36.9** | 14.338 | 184.564 | **195.359** | **279.189** | **366.64** | 425.388 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 417 | 417 | 0 | **25.86** | 37.25 | 142.367 | **111.358** | **433.125** | **595.518** | 734.519 |
| `GET /equipos/:codigo` | Redis + MongoDB | 187 | 187 | 0 | **11.6** | 17.449 | 119.404 | **125.796** | **190.517** | **232.487** | 259.456 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 2009 | 24 VUs concurrentes (`fetch`) | 172.95 | 167.838 | **308.75** | **532.104** | 756.323 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 2009 | Zod validation + serialización | 139.642 | 133.902 | **269.601** | **513.737** | 737.918 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 2009 | Escrituras renovación: 2009 (omitidas: 0) | 24.042 | 22.876 | **42.584** | **62.81** | 106.694 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 0 | Activo: `false` — Hit Ratio: **0 %** (0 hits / 0 misses) | 0 | 0 | **0** | **0** | 0 | Escrituras a caché: 0 |
| **MongoDB (Driver)** | 3592 | `maxPoolSize=5` | 62.047 | 66.024 | **109.793** | **153.885** | 320.585 | Fallos: 0 |
| **Neo4j (Driver Bolt)** | 1227 | `maxConnectionPoolSize=5` | 74.415 | 45.162 | **355.53** | **530.314** | 668.462 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `147.79 MiB` -> `219.94 MiB`
- **Heap V8 Usado (Antes -> Después):** `66.14 MiB` -> `136.8 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `5547 ms`, System `500 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-mongodb-1` | 1.06% | 250MiB / 3.483GiB | 7.01% | 6.59MB / 42MB | 759MB / 80.3MB |
| `fixture2030-neo4j-1` | 11.28% | 724.2MiB / 3.483GiB | 20.31% | 7.32MB / 10.7MB | 612MB / 231MB |
| `fixture2030-redis-1` | 0.39% | 28.76MiB / 3.483GiB | 0.81% | 35.8MB / 119MB | 123MB / 754kB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*