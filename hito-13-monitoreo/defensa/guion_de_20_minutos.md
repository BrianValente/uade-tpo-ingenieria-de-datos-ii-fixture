# Guion de Exposición Oral de 20 Minutos — Defensa Técnica ante la FIFA (Hito 13)

## 1. Organización delTiempo y Participación del Equipo (RF16, RNF7, RNF12, §6.2)

La defensa está estructurada estrictamente en **20 minutos**, dividida en los **6 bloques exigidos en la sección 6.2**, con asignación equitativa de tiempo y responsabilidad técnica entre los integrantes del **Grupo 5**:
- **Expositor 1 — Brian Valente (`~6m 30s`)**: Bloque 1 (Inicio) y Bloque 2 (Arquitectura general y flujo extremo a extremo).
- **Expositor 2 — Tomás Bravo (`~7m 00s`)**: Bloque 3 (Decisiones por modelo en los 6 motores y optimizaciones del Hito 12).
- **Expositor 3 — Julián Curi (`~6m 30s`)**: Bloque 4 (Operación y monitoreo en vivo), Bloque 5 (Evidencia de carga y prueba controlada de falla/recuperación) y Bloque 6 (Cierre y conclusiones).

| Bloque (§6.2) | Minuto | Duración | Expositor Responsable | Objetivo Clave ante el Comité FIFA | Apoyo Visual (`presentacion.html` / Demo) |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **1. Inicio** | `00:00 – 02:00` | `2 min` | **Brian Valente** | Presentar el desafío del Mundial 2030 (127 partidos, 3 continentes, ráfagas masivas de lecturas y eventos) y por qué un único motor monolítico es inviable. | Diapositivas 1 y 2 (`presentacion.html`) |
| **2. Arquitectura** | `02:00 – 06:00` | `4 min` | **Brian Valente** | Explicar el diagrama general, la integración hexagonal en Fastify (`hito-10-api`) y cómo fluyen los datos desde los 6 motores y la caché hasta el cliente y el Data Mart. | Diapositiva 3 (Diagrama de Arquitectura Políglota + Observabilidad) |
| **3. Decisiones** | `06:00 – 12:00` | `6 min` | **Tomás Bravo** | Defender con precisión cada uno de los **6 motores de datos** (estructura concreta, consistencia, escalado y trade-off) y la separación OLTP vs. Data Mart Kimball. | Diapositivas 4 y 5 (Matriz de los 6 Modelos + Diseño de Particionamiento/Índices) |
| **4. Operación** | `12:00 – 16:00` | `4 min` | **Julián Curi** | Ejecutar o mostrar la **Demo en Vivo (§6.3)**: clientes nativos/API (`GET /partidos/F2030-001`), targets `UP` en Prometheus (`:9090`), consultas PromQL (`Q1–Q8`), 6 alertas y los 9 paneles de Grafana (`:3000`). | Diapositivas 6 y 7 + Demo en vivo ([`demo.md`](demo.md)) |
| **5. Evidencia** | `16:00 – 18:30` | `2,5 min` | **Julián Curi** | Contrastar resultados medidos del **Hito 12** (`124,59 -> 514,98 ops/s`, `p95: 308,75 -> 65,572 ms`) y las **3 fases de la prueba controlada del Hito 13** (Antes -> Durante `503`/`FIRING` -> Después `200`/`INACTIVE`). | Diapositivas 8 y 9 ([`tablas_o_graficos.md`](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md) y [`prueba_de_falla.md`](../evidencia/prueba_de_falla.md)) |
| **6. Cierre** | `18:30 – 20:00` | `1,5 min` | **Julián Curi** (con cierre conjunto) | Sintetizar fortalezas demostradas, distinguir con honestidad lo medido de lo proyectado hacia 2030 (**RNF3, RNF8**) y presentar la hoja de ruta prioritaria. | Diapositiva 10 (Límites, Proyecciones 2030 y Conclusiones) |

---

## 2. Desarrollo Minuto a Minuto del Guion

### Bloque 1 — Inicio: Problema y Contexto del Fixture Mundial 2030 (`00:00 – 02:00`, 2 min)
- **Orador:** *Brian Valente*
- **Guion técnico:**
  - "Buenos días al comité técnico de la FIFA. Presentamos la arquitectura de persistencia políglota, optimización y observabilidad de la plataforma **Fixture Mundial FIFA 2030** desarrollada por el Grupo 5."
  - "El torneo 2030 abarca **64 selecciones**, **1.536 jugadores en planteles oficiales**, **127 partidos** distribuidos en **sedes de tres continentes** y millones de aficionados concurrentes consultando resultados al instante, publicando comentarios minuto a minuto y consumiendo estadísticas de juego."
  - "Intentar resolver seis cargas de naturaleza opuesta —catálogos jerárquicos, relaciones de grafo, comentarios masivos append-only, sesiones en memoria, telemetría cada 10 segundos y objetos complejos con reglas transaccionales y BI— sobre una única base de datos generaría cuellos de botella por contención de bloqueos y escaneos costosos. Nuestra tesis, probada a lo largo de los 13 hitos, es asignar cada carga al motor cuya estructura física la resuelve de forma nativa, unificarlos tras una API REST resiliente y gobernarlos con métricas reales en Prometheus y Grafana."

---

### Bloque 2 — Arquitectura General y Flujo Extremo a Extremo (`02:00 – 06:00`, 4 min)
- **Orador:** *Brian Valente*
- **Guion técnico:**
  - "En la Diapositiva 3 observamos las tres capas de la arquitectura:
    1. **Capa de Persistencia Políglota (Hitos 4 a 9)**: **MongoDB** (`27017`), **Neo4j** (`7687`), **Cassandra** (`9042`), **Redis** (`6379`), **InfluxDB 3 Core** (`8181`) e **InterSystems IRIS** (`1972`).
    2. **Capa de Integración y Orquestación (Hitos 10 a 12)**: la API REST en **Node.js + TypeScript + Fastify** con arquitectura hexagonal (puertos y adaptadores), validación de contratos con **Zod**, autenticación **Argon2id + sesiones Bearer en Redis** y un manejador uniforme de errores que traduce cualquier caída o timeout de driver a `HTTP 503 DEPENDENCY_UNAVAILABLE` o `503 REQUEST_TIMEOUT`.
    3. **Capa de Observabilidad (Hito 13)**: el endpoint `/metrics` en la API (`:8013`), **`redis_exporter`** (`:9121`), **`Prometheus v3.2.1`** (`:9090`) raspando cada `5s` y evaluando 6 reglas de alerta, y **`Grafana 11.5.2`** (`:3000`) con provisioning declarativo por código."
  - "Veamos cómo colaboran los motores en el endpoint más demandado del torneo, `GET /partidos/:id` (por ejemplo, `F2030-001`):
    1. El middleware valida el token `Bearer` en **Redis** mediante un script **Lua atómico (`O3`)** que lee la sesión y solo renueva el TTL de `1800s` si restan menos de `1740s`.
    2. El servicio consulta la **caché Read-Aside en Redis (`O2`)** (`fixture2030:h13:cache:partido:F2030-001`). Si hay `hit`, responde en menos de `5 ms`.
    3. Si hay `miss`, consulta en **Neo4j** la estructura conectada del partido, sus códigos local/visitante y los datos de la sede (`(:Equipo)-[:DISPUTA]->(:Partido)-[:SE_JUEGA_EN]->(:Sede)`), resuelve en una única consulta batch `$in` con proyección explícita BSON (`O1`) las fichas completas de ambas selecciones en **MongoDB**, almacena el agregado en **Redis** con `TTL = 120s` y devuelve el resultado."

---

### Bloque 3 — Decisiones por Modelo de Base de Datos (`06:00 – 12:00`, 6 min)
- **Orador:** *Tomás Bravo*
- **Guion técnico (1 minuto por motor + vista analítica):**
  1. **MongoDB (Documental — Hito 4)**: "Almacena las 64 selecciones (`equipos`), los 1.536 jugadores (`jugadores`) y las cuentas (`usuarios_api`) con validación `$jsonSchema` e IDs UUID v5 determinísticos. El índice compuesto `{ equipoId: 1, posicion: 1, dorsal: 1 }` (creado en Hito 4) permite listar los 24 convocados de un plantel examinando exactamente `24` claves vs `1.536` de un `COLLSCAN`. Con las proyecciones y batching de `O1` y la caché Read-Aside `O2`, las consultas a MongoDB en el benchmark del Hito 12 bajaron un **`97,7%` (`3.592 -> 83`)**."
  2. **Neo4j (Grafo de Propiedades — Hito 5)**: "Modela nodos `Partido`, `Equipo`, `Sede`, `Evento` y `Jugador` unidos por `DISPUTA`, `SE_JUEGA_EN`, `OCURRE_EN` e `INVOLUCRA`. La adyacencia libre de índices permite recorrer en un solo salto qué eventos ocurrieron en un partido y qué jugadores participaron (mediante consulta Cypher consolidada con `OPTIONAL MATCH`). En el Hito 12 sus consultas cayeron un **`96,5%` (`1.227 -> 43`)** y su `p95` bajó de `355,53 ms` a `48,454 ms`."
  3. **Apache Cassandra (Columnar — Hito 6)**: "Absorbe la escritura masiva de comentarios en vivo en el keyspace `fixture2030_comentarios`. Diseñamos dos tablas orientadas a consulta: `comentarios_por_usuario` (particionada por `(usuario_id, bucket_mes)`) y `comentarios_por_partido` con clave primaria `((partido_id, bucket_minuto, grupo), creado_en, comentario_id)`. El campo `grupo` (`0..15`, último hex del UUID) implementa **write-sharding en 16 particiones por minuto**, evitando *hot partitions* cuando un gol viraliza un partido, validado con más de **1 millón de comentarios**."
  4. **Redis (Clave-Valor en Memoria — Hito 7 y Hito 12)**: "Gestiona sesiones (`HASH` con `TTL 1800s`), caché Read-Aside (`STRING` con TTLs de `15s`, `120s` y `300s`) y rankings (`ZSET`). En caché aplica *fail-open* (si Redis cae, la API degrada elegantemente a MongoDB/Neo4j), mientras que en sesiones aplica *fail-closed* por seguridad. Logró un **Hit Ratio del `98,57%`** y ahorró el **`100%` (`8.249`)** de las escrituras de renovación de sesión en el Hito 12."
  5. **InfluxDB 3 Core (Series Temporales — Hito 8)**: "Registra las estadísticas de partido por equipo cada **10 segundos** (`estadisticas_equipo`: posesión, tiros acumulados, pases). Para evitar el crecimiento infinito del disco, separamos dos bases de datos con retención escalonada: **`7 días`** para el detalle de 10s (`fixture2030_h8_lab_detalle`) y **`90 días`** para los resúmenes de minutos completos de 6 muestras (`estadisticas_minuto` en `fixture2030_h8_lab_resumen`), validado con **34.560 puntos (32 partidos)** y proyectado a **15,08 millones de puntos** con telemetría de jugadores a 1 Hz."
  6. **InterSystems IRIS (Objetos Persistentes — Hito 9) y Data Mart Kimball (Hito 12)**: "En el plano operacional, `Fixture.Partido` encapsula en ObjectScript las reglas de estado (`Programado -> EnJuego -> Finalizado`), persiste el árbol completo (`Arbitro`, `Tecnico`, `Evento`) con un solo `%Save()` y protege su proyección SQL mediante triggers. En el plano analítico (`integracion_data_mart.md`), diseñamos una **Constelación de Hechos Kimball** en bloques de 15 minutos (`B1..B6`) que alinea el minuto deportivo `1-based` de Neo4j con el minuto UTC `0-based` de InfluxDB y Cassandra, aislando las consultas de BI del tráfico en vivo."

---

### Bloque 4 — Operación y Monitoreo en Vivo (`12:00 – 16:00`, 4 min)
- **Orador:** *Julián Curi*
- **Secuencia de demostración (alineada con [`demo.md`](demo.md) y §6.3):**
  1. **Verificación de servicios y consulta funcional (`1 min`)**: mostrar `docker compose ps`, consultar un motor directo (`redis-cli` / `mongosh` / `cypher-shell`) y ejecutar `curl -i http://127.0.0.1:8013/partidos/F2030-001` (con token Bearer) y `http://127.0.0.1:8013/metrics`.
  2. **Prometheus Targets, PromQL y Alertas (`1,5 min`)**: mostrar en `http://127.0.0.1:9090/targets` los 3 jobs `UP` (`prometheus`, `fixture2030_api`, `redis_exporter`), evaluar en vivo `fixture2030_component_up` (diferenciando los 4 componentes `active_probe` en `1` de los 3 `tcp_socket_probe` documentados) y revisar las 6 reglas de alerta en `/alerts` (justificando el umbral de `p95 > 250 ms` frente a los `65,57 ms` optimizados y `308,75 ms` de línea base).
  3. **Recorrido e interpretación del Dashboard de Grafana (`1,5 min`)**: abrir `http://127.0.0.1:3000/d/fixture2030-hito13-obs`, recorrer los **9 paneles** y explicar qué decisión técnica se toma ante cada uno (por ejemplo, cómo correlacionar una suba en el Panel 3 de latencia HTTP con una caída de Hit Ratio en el Panel 8 o un pico de latencia de Neo4j/MongoDB en el Panel 4).

---

### Bloque 5 — Evidencia de Rendimiento (Hito 12) y Prueba Controlada de Falla (Hito 13) (`16:00 – 18:30`, 2,5 min)
- **Orador:** *Julián Curi*
- **Guion técnico:**
  - **Evidencia de Carga y Optimización (Hito 12 — [`tablas_o_graficos.md`](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md))**:
    - "Bajo el mismo escenario determinístico reproducible (`24 VUs`, semilla `203012`, distribución Pareto `80/20`, ventana de `~16s`), nuestra arquitectura optimizada multiplicó por **`4,11x`** la capacidad del sistema: las operaciones completadas subieron de **`2.009` a `8.249` (`+310,6%`)**, el throughput pasó de **`124,59 ops/s` a `514,98 ops/s` (`+313,3%`)**, la latencia `p95` global cayó de **`308,75 ms` a `65,572 ms` (`-78,8%`)** y el `p99` cayó de **`532,104 ms` a `83,586 ms` (`-84,3%`)**, manteniendo `0%` de errores HTTP y `8/8` validaciones de integridad."
    - "Además, para aislar causalmente cada hipótesis cambiando una sola variable respecto de la línea base: **Solo O1** (pools a 25 + batching/proyecciones) elevó el caudal a **`204,18 ops/s` (`+63,9%`)** y bajó el `p95` de Neo4j un **`81,9%`** validando el fin de la contención en drivers; las hipótesis de caché (`O2`) y throttling (`O3`) se evalúan en el efecto conjunto optimizado (**`514,98 ops/s`**), donde `O2` amortigua el 98,57% de las llamadas a disco y `O3` ahorra 100% de escrituras en Redis."
  - **Evidencia de Disponibilidad, Falla Controlada y Recuperación (Hito 13 — [`prueba_de_falla.md`](../evidencia/prueba_de_falla.md))**:
    - "**Fase 1 (Antes):** 3 targets `UP`, métrica nativa `redis_up == 1`, sonda Neo4j en `1`, `GET /partidos/F2030-001` responde `HTTP 200 OK`, `0` errores `5xx` y las 6 alertas en `INACTIVE`."
    - "**Fase 2 (Durante la falla controlada):** detenemos el contenedor real `redis-exporter` (`docker compose stop redis-exporter`) e inducimos la inyección simulada de falla en el adaptador/driver de `neo4j` invalidando la caché de `F2030-001`. En `<= 5s`, Prometheus marca `2 UP / 1 DOWN`, la sonda de Neo4j cae a `0`, la API responde de forma controlada `HTTP 503 DEPENDENCY_UNAVAILABLE` (`+30` respuestas `503`), las alertas críticas **`Fixture2030TargetPrometheusCaido`** y **`Fixture2030MotorPoliglotaInaccesible`** pasan a **`FIRING`** y **`Fixture2030TasaErroresHttp5xxAlta`** entra en **`PENDING`**."
    - "**Fase 3 (Después de la recuperación):** reiniciamos el contenedor real `redis-exporter` y restauramos el conector de Neo4j. Los targets regresan a **`3 UP / 0 DOWN`**, la sonda vuelve a `1`, las alertas de disponibilidad retornan inmediatamente a **`INACTIVE`** y `GET /partidos/F2030-001` vuelve a responder **`HTTP 200 OK`** sin `5xx` nuevos y conservando intactos los datos del volumen persistido (**RNF11**)."

---

### Bloque 6 — Cierre: Limitaciones, Escala 2030 y Próximos Pasos (`18:30 – 20:00`, 1,5 min)
- **Orador:** *Julián Curi*
- **Guion técnico:**
  - "Para cerrar con rigurosidad ingenieril (**RNF3, RNF8**), distinguimos claramente tres planos:
    1. **Lo medido empíricamente en laboratorio:** el salto de `124,59` a `514,98 ops/s`, el Hit Ratio de `98,57%`, el millón de comentarios en Cassandra, los `34.560` puntos en InfluxDB, la persistencia de objetos en IRIS y la detección/recuperación de fallas en Prometheus y Grafana.
    2. **Lo monitoreado por sonda TCP por presupuesto de RAM local (`~7,31 GiB`):** Cassandra (`9042`), InfluxDB (`8181`) e IRIS (`1972`), cuyos conectores están integrados e instrumentados en la API y listos para activarse cuando sus contenedores están encendidos.
    3. **Lo proyectado hacia la escala mundial 2030:** Replica Sets multi-región en MongoDB, Read Replicas en Neo4j, anillo multi-datacenter con `LOCAL_QUORUM` en Cassandra, Redis Cluster y despliegue físico del ETL hacia el Data Mart Kimball."
  - "Con esto damos por concluida la presentación y quedamos a disposición del comité de la FIFA para responder sus preguntas."

---

## 3. Plan B de Contingencia ante Fallas del Entorno Local (RNF7)

Si durante la defensa en vivo surgiera cualquier inconveniente con Docker Desktop, puertos locales o recursos de la máquina:
1. **Presentación autocontenida offline:** [`defensa/presentacion.html`](presentacion.html) funciona al 100% en cualquier navegador sin conexión a Internet ni dependencias externas.
2. **Smoke test instantáneo en memoria (sin Docker):** ejecutar `pnpm --dir hito-10-api h13:smoke` o `pnpm --dir hito-10-api test`, que verifica en `< 2 segundos` la serialización Prometheus `0.0.4`, los generadores de reportes y la estructura de los 9 paneles del dashboard de Grafana.
3. **Evidencia real pre-capturada y versionada en Git (commit `73665cc`):** abrir directamente [`evidencia/prometheus_targets.md`](../evidencia/prometheus_targets.md), [`evidencia/resultados_sin_secretos/consultas_promql_observadas.md`](../evidencia/resultados_sin_secretos/consultas_promql_observadas.md), [`evidencia/dashboards/resumen_dashboard_observado.md`](../evidencia/dashboards/resumen_dashboard_observado.md) y [`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md) junto con sus archivos `.json` crudos.
