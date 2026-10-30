# Resultados de Prueba de Carga — Flujo Optimizado (Hito 12)

- **Modo ejecutado:** `optimized`
- **Fecha de ejecución:** `2026-10-30T12:59:05.508Z`
- **Commit Git:** `acb8fc0` (rama `feature/hito-12-carga-optimizacion`, estado del árbol: `clean`)
- **Hardware / SO:** win32 (x64) — AMD Ryzen 5 5600U with Radeon Graphics (12 CPUs lógicas, 7.31 GiB RAM) — Node.js `v22.18.0`
- **Versiones observadas:** MongoDB (`db version v7.0.40`), Neo4j (`Cypher-Shell 2026.10.1`), Redis (`Redis server v=8.10.2 sha=00000000:1 malloc=jemalloc-5.3.0 bits=64 build=9afb359f90603816`)

---

## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)

| Parámetro | Valor |
|:---|---:|
| Usuarios virtuales concurrentes | **24** |
| Sesiones virtuales pre-sembradas en Redis | **20** |
| Período de calentamiento (excluido de métricas) | 3 s (524 ops, media 22.576 ms) |
| Rampa de incremento (Ramp-up) | 4 s (observada: 4 s, completada: `true`) |
| Período de sostenimiento (Steady-state) | 12 s (observado: 12.029 s, completado: `true`) |
| Duración total medida | **16.029 s** |
| Motivo de finalización de ventana | `TIME_WINDOW_COMPLETED` (tope seguridad: 50000 ops) |
| Configuración efectiva de motores | MongoDB pool=`25`, Neo4j pool=`25`, timeout=`3000 ms` |
| Política efectiva de caché y sesión | TTLs (`match=120s`, `team=300s`, `events=15s`), throttle sesión=`60s` |
| Semilla PRNG determinística (`H12_SEED`) | `203012` |
| Operaciones medidas generadas | **7129** |
| Operaciones exitosas (`HTTP 200`) | **7129** |
| Operaciones con error | **0** (0 %) |
| Respuestas con integridad de payload validada | **7129 / 7129** |
| Throughput global sostenido | **444.76 ops/s** |
| Volumen HTTP transferido | 22561.99 KiB |

---

## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)

| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Global (Todas las operaciones)** | 7129 | 12.832 | 48.5 | 27.373 | **43.478** | 59.541 | **87.16** | **178.09** | 340.889 |
| **Claves Calientes (Hotspot 80 %)** | 5719 | 12.832 | 47.886 | 26.351 | **43.311** | 57.833 | **86.587** | **177.414** | 331.041 |
| **Claves Frías (Long-tail 20 %)** | 1410 | 16.331 | 50.995 | 31.053 | **44.154** | 72.863 | **89.258** | **194.092** | 340.889 |

### Histograma de Latencias E2E

| Rango de Latencia | Operaciones | Porcentaje |
|:---|---:|---:|
| `< 2 ms` | 0 | 0.0 % |
| `2 - 5 ms` | 0 | 0.0 % |
| `5 - 10 ms` | 0 | 0.0 % |
| `10 - 25 ms` | 135 | 1.9 % |
| `25 - 50 ms` | 5186 | 72.7 % |
| `50 - 100 ms` | 1565 | 22.0 % |
| `>= 100 ms` | 243 | 3.4 % |

---

## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)

| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /partidos/:id` | Redis + Neo4j + MongoDB | 2896 | 2896 | 0 | **180.67** | 12.832 | 48.333 | **43.185** | **89.016** | **192.822** | 340.889 |
| `GET /equipos/:codigo/jugadores?page=1&limit=24` | Redis + MongoDB | 2117 | 2117 | 0 | **132.07** | 14.868 | 49.099 | **43.731** | **86.748** | **178.432** | 330.997 |
| `GET /partidos/:id/eventos?limit=20` | Redis + Neo4j | 1412 | 1412 | 0 | **88.09** | 16.272 | 47.712 | **43.435** | **85.771** | **135.003** | 330.976 |
| `GET /equipos/:codigo` | Redis + MongoDB | 704 | 704 | 0 | **43.92** | 14.677 | 48.972 | **43.547** | **87.068** | **145.593** | 330.082 |

---

## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)

| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |
|:---|---:|:---|---:|---:|---:|---:|---:|:---|
| **Cliente Generador (HTTP E2E)** | 7129 | 24 VUs concurrentes (`fetch`) | 48.5 | 43.478 | **87.16** | **178.09** | 340.889 | Incluye socket cliente, HTTP y parseo JSON |
| **API Fastify (Handler interno)** | 7129 | Zod validation + serialización | 31.568 | 26.109 | **68.033** | **162.279** | 321.606 | Tiempo interno `reply.elapsedTime` |
| **Redis (Sesiones Lua)** | 7129 | Escrituras renovación: 0 (omitidas: 7129) | 14.269 | 10.931 | **33.184** | **86.231** | 251.129 | Autorización Bearer en cada request |
| **Redis (Caché Read-Aside)** | 7129 | Activo: `true` — Hit Ratio: **98.27 %** (7006 hits / 123 misses) | 13.564 | 10.614 | **23.121** | **87.593** | 253.504 | Escrituras a caché: 123 |
| **MongoDB 7.0 (Driver)** | 84 | `maxPoolSize=25` | 17.802 | 17.175 | **25.591** | **95.042** | 95.042 | Fallos: 0 |
| **Neo4j 5.x (Driver Bolt)** | 47 | `maxConnectionPoolSize=25` | 37.998 | 30.101 | **74.836** | **165.995** | 165.995 | Fallos: 0 |

---

## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)

### Proceso Node.js (API + Generador)
- **Memoria RSS (Antes -> Después):** `163.6 MiB` -> `274.21 MiB`
- **Heap V8 Usado (Antes -> Después):** `69.37 MiB` -> `140.26 MiB`
- **Tiempo de CPU consumido en ventana medida:** User `5890 ms`, System `609 ms`

### Contenedores Docker (`docker stats --no-stream`)

| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |
|:---|---:|---:|---:|---:|---:|
| `fixture2030-mongodb-1` | 2.07% | 250.9MiB / 3.483GiB | 7.04% | 4.74MB / 30.7MB | 758MB / 66MB |
| `fixture2030-neo4j-1` | 1.45% | 727.9MiB / 3.483GiB | 20.41% | 5.24MB / 7.71MB | 581MB / 222MB |
| `fixture2030-redis-1` | 0.32% | 30.43MiB / 3.483GiB | 0.85% | 29MB / 99.1MB | 123MB / 700kB |

---
*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*