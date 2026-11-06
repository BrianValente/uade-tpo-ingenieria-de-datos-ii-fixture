# Resultados de Prueba de Carga — Flujo Optimizado (Hito 12)

- **Modo ejecutado:** `isolated_o1`
- **Fecha de ejecución:** `2026-11-01T15:05:12.110Z`
- **Commit Git:** `02509e4` (rama `feature/hito-13-monitoreo-defensa`, estado del árbol: `clean`)
- **Hardware / SO:** win32 (x64) — AMD Ryzen 5 5600U with Radeon Graphics (12 CPUs lógicas, 7.31 GiB RAM) — Node.js `v22.18.0`
- **Versiones observadas:** MongoDB (`db version v7.0.40`), Neo4j Servidor (`neo4j 2026.10.1`, cliente CLI: `Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.2 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=9afb359f90603816`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (310 ops, media 38.254 ms) |
| Rampa de incremento (Ramp-up) | 4 s (observada: 4 s, completada: `true`) |
| Período de sostenimiento (Steady-state) | 12 s (observado: 12.113 s, completado: `true`) |
| Duración total medida | **16.113 s** |
| Motivo de finalización de ventana | `TIME_WINDOW_COMPLETED` (tope seguridad: 50000 ops) |
| Configuración efectiva de motores | MongoDB pool=`25`, Neo4j pool=`25`, timeout=`3000 ms` |
| Política efectiva de caché y sesión | TTLs (`match=0s`, `team=0s`, `events=0s`), throttle sesión=`0s` |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **3290** |
| Operaciones exitosas (`HTTP 200`) | **3290** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **3290 / 3290** |
| Throughput global sostenido | **204.18 ops/s** |
| Volumen HTTP transferido | 6337.20 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 3290 | 40.041 | 92.844 | 24.165 | **90.994** | 119.752 | **126.126** | **179.706** | 234.861 |
| **Claves Calientes (Hotspot 80 %)** | 2612 | 40.041 | 92.768 | 23.89 | **91.133** | 119.676 | **126.01** | **174.517** | 234.861 |
| **Claves Frías (Long-tail 20 %)** | 678 | 40.327 | 93.136 | 25.194 | **90.048** | 120.263 | **126.244** | **184.398** | 233.867 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 0 | 0.0 % |
| `5 - 10 ms` | 0 | 0.0 % |
| `10 - 25 ms` | 0 | 0.0 % |
| `25 - 50 ms` | 68 | 2.1 % |
| `50 - 100 ms` | 2018 | 61.3 % |
| `>= 100 ms` | 1204 | 36.6 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 1316 | 1316 | 0 | **81.67** | 70.06 | 102.775 | **101.297** | **128.84** | **200.385** | 234.861 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 1002 | 1002 | 0 | **62.19** | 65.047 | 94.865 | **94.268** | **119.015** | **164.787** | 200.395 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 665 | 665 | 0 | **41.27** | 55.27 | 83.145 | **80.839** | **104.641** | **168.998** | 207.707 |
| `GET /equipos/:codigo` | Redis + MongoDB | 307 | 307 | 0 | **19.05** | 40.041 | 64.683 | **63.744** | **84.058** | **149.365** | 167.663 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 3290 | 24 VUs concurrentes (`fetch`) | 92.844 | 90.994 | **126.126** | **179.706** | 234.861 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 3290 | Zod validation + serialización | 86.812 | 84.76 | **120.429** | **173.447** | 228.316 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 3290 | Escrituras renovación: 3290 (omitidas: 0) | 18.718 | 18.312 | **27.706** | **45.901** | 59.716 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 0 | Activo: `false` — Hit Ratio: **0 %** (0 hits / 0 misses) | 0 | 0 | **0** | **0** | 0 | Escrituras a caché: 0 |
| **MongoDB (Driver)** | 2625 | `maxPoolSize=25` | 25.713 | 25.009 | **36.754** | **62.412** | 79.845 | Fallos: 0 |
| **Neo4j (Driver Bolt)** | 1981 | `maxConnectionPoolSize=25` | 46.147 | 45.338 | **64.424** | **91.902** | 118.684 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `147.79 MiB` -> `248.5 MiB`
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