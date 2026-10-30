# Selección del Flujo, Escenario de Carga y Datos de Prueba — Hito 12

**Asignatura:** Ingeniería de Datos II  
**Proyecto:** Plataforma Fixture Mundial 2030 — Grupo 5  

---

## 1. Selección y Justificación del Flujo (RF1, §5.1)

Seleccionamos el **Flujo Integrado del Centro de Partido y Consulta de Selecciones ("Pre-Partido y Actividad Durante el Partido")** expuesto por la API REST construida en el Hito 10 (`hito-10-api`).

### 1.1. ¿Por qué es el flujo más representativo para evaluar carga y optimización?
1. **Integración poli-motor real en cada solicitud:** Cada petición HTTP autenticada atraviesa **Redis** (validación y renovación de sesión mediante script Lua), **Neo4j** (recorrido de relaciones del partido, sede, eventos y jugadores protagonistas) y **MongoDB** (recuperación de fichas documentales de selecciones y planteles de 24 jugadores).
2. **Combinación de lecturas compuestas y escrituras de estado de sesión:** Aunque desde el punto de vista del consumidor HTTP son operaciones `GET`, el diseño de sesiones del Hito 7/10 ejecuta en cada request el script Lua `READ_AND_RENEW_SESSION`, que realiza una **escritura atómica (`HSET ultima_actividad` + `EXPIRE 1800`) en Redis** antes de despachar las lecturas hacia Neo4j y MongoDB.
3. **Exposición directa a cuellos de botella de arquitectura:** En la versión base del Hito 10, `GET /partidos/:id` ejecuta tres consultas a dos motores distintos (1 Cypher en Neo4j + 2 `findOne` en MongoDB) sobre pools de conexión pequeños (`maxPoolSize=5`), mientras que `GET /equipos/:codigo/jugadores` ejecuta tres operaciones en MongoDB (`findOne` en `equipos` + `find` y `countDocuments` en `jugadores`) sin proyección BSON ni caché Read-Aside.

### 1.2. Ficha Técnica del Flujo Seleccionado (§5.1)

| Aspecto Requerido | Especificación en el Flujo Seleccionado |
|:---|:---|
| **Consumidor / Proceso que genera la operación** | Clientes móviles y web del Fixture 2030 consultando el Centro de Partido en vivo, las alineaciones/planteles y el minuto a minuto de eventos deportivos. |
| **Datos de entrada recibidos** | Header `Authorization: Bearer <token>`, identificadores de partido (`F2030-001`..`F2030-032`), códigos FIFA de tres letras (`ARG`, `BRA`, etc.) y parámetros de paginación (`page=1&limit=24`, `limit=20`). |
| **Fuentes consultadas y actualizadas** | **Redis:** lectura y actualización de `ultima_actividad` y `TTL` en hash de sesión (`fixture2030:h10:h12-bench:sesion:<digest>`) + lectura/escritura de caché Read-Aside en el flujo optimizado.<br>**Neo4j:** lectura de nodos `:Partido`, `:Equipo`, `:Sede`, `:Evento` y `:Jugador`.<br>**MongoDB:** lectura de colecciones `equipos` y `jugadores`. |
| **Tipo de operación** | **Combinación:** actualización atómica de actividad de sesión en memoria (Redis) + lecturas compuestas multi-motor (Neo4j + MongoDB). |
| **Respuesta esperada** | `HTTP 200 OK` con cuerpo JSON validado por Zod (`x-request-id` único): ficha compuesta del partido con sede y selecciones local/visitante, plantel de 24 jugadores, cronología de eventos o ficha de selección. |
| **Volumen y frecuencia proyectados (Torneo vs. Laboratorio)** | **Proyectado torneo 2030:** picos de 50.000–200.000 req/s concentrados en los partidos en juego.<br>**Probado en laboratorio local:** 24 usuarios virtuales concurrentes en bucle cerrado continuo durante 16 s medidos (+3 s warm-up), generando entre ~2.227 y ~7.129 operaciones HTTP verificadas por corrida. |
| **Criterio de éxito de cada operación** | 1) Código `HTTP 200`, 2) JSON válido conforme al esquema OpenAPI, y 3) verificación de integridad de contenido (`verifyPayloadIntegrity`: coincidencia exacta de `id`/`code`, presencia de `home`/`away`/`venue` completos y `items.length === 24` con 24 IDs únicos, dorsales `1..99` y `teamCode` coincidente en planteles). |
| **Errores o respuestas degradadas a registrar** | `HTTP 401` (sesión inválida/expirada), `HTTP 404` (recurso ausente), `HTTP 500` (error interno), `HTTP 503` (`DEPENDENCY_UNAVAILABLE` por timeout o agotamiento de pool), `CLIENT_TIMEOUT` y `PAYLOAD_INTEGRITY_MISMATCH`. |

---

## 2. Definición Explícita del Escenario de Carga (RF2, §5.2)

El escenario modela un **pico de actividad durante una jornada con 4 partidos simultáneos destacados** del Mundial 2030:

| Parámetro del Escenario | Valor Definido | Justificación Técnica |
|:---|:---|:---|
| **Cantidad inicial de datos** | **MongoDB:** 64 equipos, 1.536 jugadores.<br>**Neo4j:** 64 equipos, 1.536 jugadores, 32 partidos, 8 sedes, **384 eventos** (64 canónicos + 320 del lote `HITO_12`).<br>**Redis:** 20 sesiones activas pre-sembradas. | Amplía por $6\times$ la densidad de eventos por partido respecto del Hito 5 (de 2 a 12 eventos por partido) manteniendo trazabilidad e integridad. |
| **Usuarios virtuales / Concurrencia** | **24 usuarios virtuales concurrentes** (`H12_CONCURRENCY=24`) | Supera en $4,8\times$ el tamaño del pool base (`maxPoolSize=5` en MongoDB y Neo4j), exponiendo el encolamiento real de conexiones sin saturar la notebook local. |
| **Estrategia de tasa de operaciones** | **Bucle cerrado (Closed-Loop) de máxima presión** con rampa lineal de incorporación de workers | Cada usuario virtual envía la siguiente solicitud inmediatamente al recibir y validar la anterior, permitiendo medir el throughput máximo real de cada configuración. |
| **Proporción Lecturas / Escrituras** | **100 % solicitudes HTTP `GET`**, cada una con **1 escritura de renovación de sesión en Redis** en línea base (y escrituras amortizadas + llenado de caché en modo optimizado). | Representa fielmente el tráfico de espectadores durante un partido en vivo. |
| **Distribución de Endpoints** | - **40 %** `GET /partidos/:id` (Neo4j + 2x MongoDB + Redis)<br>- **30 %** `GET /equipos/:codigo/jugadores?page=1&limit=24` (MongoDB + Redis)<br>- **20 %** `GET /partidos/:id/eventos?limit=20` (Neo4j + Redis)<br>- **10 %** `GET /equipos/:codigo` (MongoDB + Redis) | Prioriza las dos operaciones más costosas (ficha compuesta multi-motor y listado paginado con conteo de plantel). |
| **Distribución de Claves (Hotspot 80/20)** | - **80 % del tráfico** sobre **4 partidos calientes** (`F2030-001` `ARG-BRA`, `F2030-014` `USA-COL`, `F2030-020` `FRA-GER`, `F2030-023` `ESP-SWE`) y sus **8 selecciones**.<br>- **20 % del tráfico** distribuido uniformemente en los **28 partidos** y **56 equipos** restantes. | Reproduce la asimetría típica de eventos deportivos (ley de Pareto / Zipf) con semilla PRNG fija (`H12_SEED=203012`). |
| **Período de Calentamiento (Warm-up)** | **3 segundos** con 4 usuarios virtuales | Calienta JIT de V8, compiladores de esquemas Zod y conexiones iniciales de los drivers. Sus muestras se reportan por separado y no se mezclan con la ventana medida. |
| **Rampa de Incremento (Ramp-up)** | **4 segundos** escalando linealmente de 4 a 24 usuarios virtuales (+5 VUs/s) | Evita una tormenta instantánea de conexiones TCP al segundo cero y permite observar la transición hacia carga plena. |
| **Período de Sostenimiento (Steady-state)** | **12 segundos** a concurrencia plena (24 VUs) | Ventana total medida de **16 segundos** (4 s rampa + 12 s sostenimiento). |
| **Condición de Finalización e Interrupción Segura** | Finaliza al cumplirse los **16 s medidos**, al alcanzar **50.000 operaciones** (`H12_MAX_OPERATIONS`), o **interrupción temprana de seguridad** si tras $\ge 100$ requests la tasa de error supera el **50 %**. | Protege los recursos de la notebook local ante caídas de contenedores (RNF9). |
| **Comportamiento ante Timeout o Error** | Timeout de cliente por request de `5.000 ms` (`AbortSignal.timeout`) y de dependencia de `3.000 ms`. Cada fallo se clasifica en `errorsByType` (`HTTP_503`, `CLIENT_TIMEOUT`, `PAYLOAD_INTEGRITY_MISMATCH`, etc.). | Garantiza que ningún worker quede bloqueado indefinidamente. |
| **Método de Limpieza y Reutilización** | `preparar_datos.ts` limpia claves `fixture2030:h12:cache:*` antes de cada corrida; `limpiar_datos_de_prueba.ts` elimina `Evento {lotePrueba: 'HITO_12'}` y sesiones `h12-bench` al finalizar. | Permite repetir Línea Base y Prueba Optimizada desde un estado inicial idéntico (RNF3, RNF11). |

---

## 3. Conjunto de Datos de Prueba y Validación (RF3, §5.3)

### 3.1. Generación y Semilla Determinística
- Los 64 equipos y 1.536 jugadores provienen del generador determinístico del Hito 4 (`data/load-data.js`), con identificadores UUID v5 (`equipo:<codigo>` y `jugador:<codigo>:<dorsal>`).
- Los 32 partidos (`F2030-001`..`F2030-032`), 8 sedes (`SED-001`..`SED-008`) y 64 eventos iniciales provienen de `neo4j/import/*.csv` (Hito 5).
- El script [`datos-o-generadores/generador_escenario.ts`](../datos-o-generadores/generador_escenario.ts) genera de forma determinística:
  1. **320 eventos adicionales (`F2030-H12-EVT-0001` a `F2030-H12-EVT-0320`):** 10 eventos nuevos por cada uno de los 32 partidos, distribuidos entre los minutos `5'` y `90'`, alternando entre el equipo local y visitante del partido y vinculando a jugadores reales con dorsales `1..24`.
  2. **20 sesiones de usuarios virtuales (`vu-h12-01` a `vu-h12-20`):** cada usuario virtual posee su propio token y hash SHA-256 en Redis bajo `fixture2030:h10:h12-bench:sesion:<digest>`.
  3. **Secuencia determinística de solicitudes:** generada con el algoritmo `Mulberry32` inicializado en `H12_SEED = 203012`.

### 3.2. Relación entre el Volumen de Prueba y el Volumen Proyectado del TPO (RNF6)
- En el diseño global del TPO (Hitos 2 y 3), la plataforma proyecta hasta 127 partidos, millones de lectores concurrentes distribuidos en tres regiones y decenas de millones de puntos/comentarios.
- En la notebook local, ejecutar millones de conexiones o decenas de gigabytes en tres contenedores simultáneos provocaría *swapping* de disco y agotamiento de RAM del host, invalidando las mediciones por interferencia del sistema operativo.
- El volumen seleccionado (**1.600 documentos en MongoDB, 2.024 nodos y 2.400 relaciones en Neo4j, 20 sesiones y decenas de proyecciones en Redis bajo 24 usuarios concurrentes**) es suficientemente denso para medir con fidelidad la latencia de red local, el costo de recorridos Cypher y consultas BSON, la cola de espera en los pools de conexión y la ganancia del caché Read-Aside, manteniendo el uso de memoria y CPU dentro de márgenes controlados.
