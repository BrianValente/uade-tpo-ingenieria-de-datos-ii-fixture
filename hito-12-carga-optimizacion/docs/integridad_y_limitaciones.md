# Validación de Integridad, Limitaciones y Conclusiones — Hito 12

**Asignatura:** Ingeniería de Datos II  
**Proyecto:** Plataforma Fixture Mundial 2030 — Grupo 5  

---

## 1. Validación de Integridad de los Datos (RF15, RNF4, §5.8)

Siguiendo la premisa de la cátedra (*«La velocidad no reemplaza la integridad; no se deberá asumir que un código HTTP exitoso garantiza que los datos fueron procesados correctamente»*), implementamos dos niveles complementarios de verificación de integridad:

### Nivel A — Verificación en Tiempo Real de Cada Respuesta HTTP Durante la Carga (`ejecutar_carga.ts`)
Cada una de las respuestas `HTTP 200` recibidas por los 24 usuarios virtuales es parseada y sometida a la función `verifyPayloadIntegrity()` (cubierta además por pruebas unitarias negativas en `hito-10-api/tests/unit/hito12-verification.test.ts`):
- En `GET /partidos/:id`: comprueba que `body.id === targetKey` y que existan objetos válidos `home`, `away` y `venue` con sus códigos e identificadores completos (sin respuestas parciales).
- En `GET /equipos/:codigo/jugadores`: comprueba que `items` contenga exactamente `24` jugadores, `total === 24`, que los **24 jugadores pertenezcan a `teamCode === codigo`**, que existan **24 `id` únicos** (sin duplicados) y **24 dorsales únicos dentro del rango `[1, 99]`**.
- En `GET /partidos/:id/eventos`: comprueba que `items` sea un arreglo no vacío de eventos con **`id` únicos**, `partidoId === targetKey`, `tipo` válido y `minuto` numérico.
- En `GET /equipos/:codigo`: comprueba que `body.code === codigo`, `participates === true` y `id` sea un identificador no vacío.

### Nivel B — Auditoría Cruzada Post-Carga y Post-Limpieza sobre los Motores NoSQL (`scripts/validar_integridad.ts`)
Al finalizar las pruebas se ejecutó `pnpm --dir hito-10-api h12:validar`, generando los artefactos [`evidencia/validacion_integridad.md`](evidencia/validacion_integridad.md) y [`evidencia/validacion_integridad.json`](evidencia/validacion_integridad.json). El validador distingue explícitamente el objetivo `post-carga` del objetivo `post-limpieza` (`--post-limpieza`). Los **8 controles automatizados resultaron aprobados (`8 / 8 CUMPLE`)**:

| ID | Categoría | Qué se Comprobó (`post-carga`) | Esperado | Observado en Laboratorio | Estado |
|:---|:---|:---|:---|:---|:---:|
| `INT-01` | **MongoDB (`equipos`)** | Cantidad de selecciones participantes, unicidad de `_id` y de códigos FIFA de 3 letras. | 64 equipos, 64 códigos únicos | 64 equipos, 64 códigos únicos | **OK** |
| `INT-02` | **MongoDB (`jugadores`)** | Conteo total, distribución exacta por plantel (`min=24, max=24`) y validez de rangos (`dorsal 1..99`, `alturaCm 150..220`). | 1.536 jugadores, 64 planteles de 24 | 1.536 jugadores, 64 planteles de 24, rangos válidos | **OK** |
| `INT-03` | **Consistencia MongoDB <-> Neo4j** | Correspondencia 1 a 1 entre los UUID v5 de `equipos._id` en MongoDB y `(:Equipo).id` en Neo4j. | 64 coincidencias exactas | 64 coincidencias exactas | **OK** |
| `INT-04` | **Neo4j (`:Partido`, `:Evento`)** | Conteo de partidos y eventos enlazados (64 canónicos + 320 del lote `HITO_12`), exactamente 12 eventos por partido y **0 nodos `:Evento` huérfanos** frente al total del grafo. | 32 partidos, 384 eventos (`320` H12; `min=12, max=12`), 0 huérfanos, total grafo 384 | 32 partidos, 384 eventos (`320` H12; `min=12, max=12`), 0 huérfanos, total grafo 384 | **OK** |
| `INT-05` | **Redis (`sesion:*`)** | Presencia exacta de las 20 sesiones esperadas del lote tras miles de accesos concurrentes, con `estado_acceso = autorizado` y `PTTL` en `(0, 1800000]`. | Exactamente 20 sesiones esperadas válidas con TTL activo | 20/20 sesiones válidas observadas (20/20 del lote identificadas) | **OK** |
| `INT-06` | **Consistencia Fuentes <-> Caché Redis** | Inspección de las **157 claves activas** en `fixture2030:h12:cache:*`: verificación de `PTTL > 0`, unicidad de elementos y contraste campo por campo y orden contra MongoDB y Neo4j. | Al menos 1 clave activa; 100 % con TTL > 0 y contenido idéntico a la fuente | 157 claves activas en caché; 157 con TTL > 0; 157 íntegras | **OK** |
| `INT-07` | **Contabilidad Línea Base** | `generadas == exitosas + fallidas` y `100 %` de payloads `HTTP 200` íntegros en `resultados_linea_base.json`. | Exactitud contable y 0 payloads corruptos | `generadas=2227, exitosas=2227, fallidas=0, íntegros=2227, corruptos=0` | **OK** |
| `INT-08` | **Contabilidad Prueba Optimizada** | `generadas == exitosas + fallidas` y `100 %` de payloads `HTTP 200` íntegros en `resultados_optimizados.json`. | Exactitud contable y 0 payloads corruptos | `generadas=7129, exitosas=7129, fallidas=0, íntegros=7129, corruptos=0` | **OK** |

---

## 2. Limitaciones del Entorno y Honestidad Experimental (RNF6, RNF14, §8)

Para interpretar correctamente los resultados obtenidos, distinguimos de forma explícita entre **lo efectivamente medido en la notebook**, **lo proyectado para el torneo** y **lo que no puede generalizarse**:

1. **Co-localización en una sola máquina (Host + Docker Desktop):**
   - El generador de carga (`fetch`), el servidor Fastify y los tres contenedores Docker (`MongoDB`, `Neo4j`, `Redis`) compartieron los 12 hilos lógicos y los 7,31 GiB de RAM de la misma notebook (`AMD Ryzen 5 5600U` sobre Windows 11 / WSL2).
   - Por lo tanto, las latencias medidas incluyen el costo de virtualización de red loopback (`127.0.0.1`) y planificación de procesos de Windows/WSL2, pero **no incluyen latencia de red WAN intercontinental** ni saltos entre centros de datos regionales.
2. **Nodos únicos sin replicación ni particionamiento distribuido:**
   - MongoDB, Neo4j y Redis se ejecutaron como instancias *standalone* de un solo contenedor. La prueba no mide el costo de replicación por quórum, *failover* de Redis Sentinel/Cluster ni *routing* de clústeres Neo4j/MongoDB.
3. **Tamaño del dataset en memoria caché del motor:**
   - Con 64 equipos, 1.536 jugadores y 384 eventos, el *working set* completo de MongoDB y Neo4j cabe holgadamente en la caché de páginas en RAM de cada contenedor (`250,9 MiB` en MongoDB y `727,9 MiB` en Neo4j en instantánea post-prueba). Los tiempos de *cache-miss* medidos reflejan el costo de red loopback, protocolo, parseo Cypher/BSON y contención de pool, pero **no representan lecturas con fallos de página en disco (*cold disk I/O*) sobre terabytes de datos**.
4. **Alcance del flujo probado respecto de los otros motores del repositorio:**
   - La prueba de carga estresó de extremo a extremo la integración **Fastify + Redis + Neo4j + MongoDB**. Los módulos de Cassandra (probado con >1M de comentarios en el Hito 6), InfluxDB 3 Core (probado con 34.560 puntos en el Hito 8) e InterSystems IRIS (Hito 9) no se levantaron simultáneamente durante esta corrida para evitar saturar los 7,31 GiB de RAM de la notebook (RNF9), integrándose en el diseño conceptual de la Constelación de Hechos del Data Mart (`docs/integracion_data_mart.md`).

---

## 3. Conclusiones y Próximos Pasos (§8)

1. **Decisión técnica del equipo:** Adoptamos la combinación de las tres optimizaciones (**O1: ampliación de pools de 5 a 25 + proyección BSON + batching `$in`**, **O2: caché Read-Aside en Redis con TTL diferenciado** y **O3: amortización de renovación de sesiones a 60 s**), ya que sobre la misma ventana completa de `16 s` (`TIME_WINDOW_COMPLETED`) multiplicó por **$3,21\times$ el throughput global sostenido** (`138,46 -> 444,76 ops/s`, `+221,2 %`), redujo la **mediana (p50) un `72,4 %`** (`157,77 ms -> 43,48 ms`) y el **p95 de latencia un `64,1 %`** (`242,84 ms -> 87,16 ms`), manteniendo `0 %` de errores y `100 %` de integridad verificada.
2. **Importancia de medir toda la cadena (RF6):** La telemetría demostró que la limitación de la línea base no residía en la velocidad intrínseca de MongoDB o Neo4j, sino en la combinación de **pools reducidos (`maxPoolSize=5`)**, **amplificación de consultas ($1,80\times$ en MongoDB: `4.000` llamadas para `2.227` requests)** y **recálculo repetitivo de claves calientes en Neo4j y MongoDB**.
3. **Separación entre camino operacional y camino analítico:** Mientras el caché Read-Aside en Redis resuelve la lectura repetitiva de entidades operacionales puntuales (`GET /partidos/:id` con `98,27 %` de hit ratio), las preguntas analíticas cruzadas (evolución por bloques de 15 minutos, confederación, sede, estadísticas temporales y volumen de comentarios) deben resolverse mediante la **Constelación de Hechos del Data Mart** alimentada por micro-batches cada 5 minutos sin duplicar el grano de comentarios por partido.
4. **Próximos pasos sugeridos:**
   - Incorporar invalidación de caché basada en eventos (*write-through / cache invalidation hook*) cuando un administrador actualice el estado o registre un evento de partido.
   - Separar en producción la instancia o base lógica de Redis dedicada a **sesiones** (`noeviction`) de la dedicada a **caché** (`allkeys-lfu`), evitando cualquier competencia por el límite `maxmemory`.
