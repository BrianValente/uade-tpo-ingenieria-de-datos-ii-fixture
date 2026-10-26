# Datos de Prueba y Generadores — Hito 12

Este directorio contiene la especificación y el generador determinístico del conjunto de datos y del tráfico de prueba utilizados en el **Hito 12 — Pruebas de Carga y Optimización del Fixture 2030** (RF3, RNF1, RNF6, RNF7).

---

## 1. Origen y Composición del Conjunto de Datos (RF3, 5.3)

El escenario de carga opera sobre una combinación de **datos canónicos de los hitos previos** y un **lote sintético adicional de laboratorio (`F2030-H12-*`)** generado de forma determinística:

| Motor | Entidad / Estructura | Volumen Base (Hitos 4–10) | Volumen Ampliado Hito 12 | Método de Generación / Identidad |
|:---|:---|---:|---:|:---|
| **MongoDB 7.0** | Colección `equipos` | 64 equipos | **64 equipos** | UUID v5 determinístico (`equipo:<codigo>`), código ISO de 3 letras (`ARG`, `BRA`, etc.). |
| **MongoDB 7.0** | Colección `jugadores` | 1.536 jugadores (24/equipo) | **1.536 jugadores** | UUID v5 determinístico (`jugador:<codigo>:<dorsal>`), referencia `equipoId` y `equipoCodigo`. |
| **MongoDB 7.0** | Colección `usuarios_api` | 2 cuentas (`admin`, `user`) | **2 cuentas** | Seed con hash Argon2id (`fixture-admin`, `fixture-user`). |
| **Neo4j 5.x** | Nodos `:Equipo`, `:Jugador`, `:Sede`, `:Partido` | 64, 1.536, 8, 32 | **64, 1.536, 8, 32** | Nodos con restricciones `UNIQUENESS` y relaciones `:PERTENECE_A`, `:DISPUTA`, `:SE_JUEGA_EN`. |
| **Neo4j 5.x** | Nodos `:Evento` y relaciones `:OCURRE_EN` / `:INVOLUCRA` | 64 eventos (2/partido) | **384 eventos** (+320 eventos `F2030-H12-EVT-0001..0320`, 12/partido) | `MERGE` idempotente en `preparar_datos.ts` con propiedad `lotePrueba: 'HITO_12'`. |
| **Redis** | Hashes de sesión `fixture2030:h10:h12-bench:sesion:<digest>` | 1 sesión secuencial | **20 sesiones concurrentes** (`vu-h12-01..20`) | Pre-sembradas con TTL de 1800s para aislar usuarios virtuales concurrentes. |

---

## 2. Distribución de Claves y Simulación de Claves Calientes (80/20)

Para reflejar un comportamiento realista durante una jornada del Mundial 2030 (donde la audiencia global se concentra en los partidos en curso más convocantes mientras consulta con menor frecuencia el resto del torneo), el generador `generador_escenario.ts` utiliza el PRNG determinístico `Mulberry32` con semilla fija (`H12_SEED = 203012`):

- **80 % de las operaciones (Hotspot / Claves Calientes):**
  - **4 partidos destacados (12,5 % del catálogo):** `F2030-001` (`ARG` vs `BRA`), `F2030-014` (`USA` vs `COL`), `F2030-020` (`FRA` vs `GER`) y `F2030-023` (`ESP` vs `SWE`).
  - **8 selecciones protagonistas (12,5 % del catálogo):** `ARG`, `BRA`, `USA`, `COL`, `FRA`, `GER`, `ESP`, `SWE`.
- **20 % de las operaciones (Long-tail / Claves Frías):**
  - Distribución uniforme sobre los **28 partidos restantes** (`F2030-002` a `F2030-032`) y las **56 selecciones restantes**.

---

## 3. Mezcla de Operaciones del Flujo Integrado

| Perfil | Endpoint HTTP | Peso | Motores Involucrados | Naturaleza de la Operación |
|:---|:---|---:|:---|:---|
| `match_composite` | `GET /partidos/:id` | **40 %** | Redis + Neo4j + MongoDB | Validación/renovación de sesión + recorrido de partido/sede en grafo + 2 fichas de equipo en MongoDB. |
| `team_players` | `GET /equipos/:codigo/jugadores?page=1&limit=24` | **30 %** | Redis + MongoDB | Validación/renovación de sesión + resolución de equipo + listado ordenado y conteo de plantel. |
| `match_events` | `GET /partidos/:id/eventos?limit=20` | **20 %** | Redis + Neo4j | Validación/renovación de sesión + recorrido de eventos y jugadores protagonistas ordenados por minuto. |
| `team_profile` | `GET /equipos/:codigo` | **10 %** | Redis + MongoDB | Validación/renovación de sesión + lectura puntual de ficha documental por índice único. |

---

## 4. Relación entre Volumen de Prueba Local y Volumen Proyectado (RNF6)

- **Volumen probado en la notebook:** 64 equipos, 1.536 jugadores, 32 partidos, 8 sedes, 384 eventos en grafo, 20 sesiones activas concurrentes y 24 usuarios virtuales concurrentes sosteniendo miles de operaciones HTTP en la ventana de medición.
- **Volumen proyectado para el escenario completo del Fixture 2030:** 104–127 partidos oficiales, millones de sesiones concurrentes en picos de partido, decenas de miles de eventos históricos y millones de comentarios/puntos temporales.
- **Límite de extrapolación (RNF14):** El conjunto local permite demostrar y medir contención de pools de conexiones, costo de consultas compuestas N+1, impacto del caché Read-Aside ante asimetría 80/20 y costo de renovación de sesiones en Redis. **No demuestra** particionamiento físico multi-nodo, latencia WAN intercontinental ni capacidad de hardware de producción.
