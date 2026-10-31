# Guion de Exposición y Defensa Técnica de 20 Minutos — Hito 13 (§8, RF16, RNF7)

## 1. Estructura Temporal de la Defensa (20 Minutos Exactos + Espacio de Preguntas FIFA)

| Bloque | Minutos | Duración | Objetivo Técnico | Apoyo Visual y Evidencia en Vivo |
| :--- | :---: | :---: | :--- | :--- |
| **1. Inicio: Problema y Visión FIFA 2030** | `00:00 – 02:00` | `2 min` | Presentar el desafío del Mundial 2030 (127 partidos, 3 continentes, cargas heterogéneas) y por qué un único motor es insuficiente (RF12) | Diapositivas 1–2 de [`presentacion.html`](presentacion.html) |
| **2. Arquitectura Políglota Integral** | `02:00 – 06:00` | `4 min` | Explicar el mapa de responsabilidades de los 6 motores NoSQL + API Fastify + Data Mart Analítico en IRIS (RF11, RF15) | Diapositivas 3–4 y [`docs/inventario_de_componentes.md`](../docs/inventario_de_componentes.md) |
| **3. Decisiones Técnicas y Trade-offs** | `06:00 – 10:00` | `4 min` | Defender índices, claves de partición, TTLs, replicación y teorema CAP/PACELC en MongoDB, Neo4j, Cassandra, Redis, InfluxDB e IRIS | Diapositivas 5–6 y [`docs/decisiones_de_arquitectura.md`](../docs/decisiones_de_arquitectura.md) |
| **4. Operación y Demostración en Vivo** | `10:00 – 14:00` | `4 min` | Ejecutar el recorrido en vivo: Swagger/API -> consulta compuesta `GET /partidos/F2030-001` -> `/metrics` -> Targets de Prometheus -> Dashboard de Grafana | Guía [`demo.md`](demo.md), Swagger UI y Grafana (`:3000`) |
| **5. Evidencia Transversal (Hitos 11, 12 y 13)** | `14:00 – 18:00` | `4 min` | Mostrar conectividad de los 6 motores (Hito 11), mejora de `-85,8%` en `p95` y `+616,5%` en throughput (Hito 12) y prueba controlada de falla/recuperación (Hito 13) | Diapositivas 7–9, [`comparacion_antes_despues.md`](../../hito-12-carga-optimizacion/docs/comparacion_antes_despues.md) y [`prueba_de_falla.md`](../evidencia/prueba_de_falla.md) |
| **6. Cierre: Limitaciones y Propuestas** | `18:00 – 20:00` | `2 min` | Distinguir laboratorio vs. producción 2030 (RNF8), presentar las 4 mejoras concretas (Singleflight, PubSub, Circuit Breaker, Exporters) y abrir a preguntas del comité | Diapositiva 10 y [`docs/defensa_final.md`](../docs/defensa_final.md) |

---

## 2. Guion Detallado Minuto a Minuto

### Bloque 1 — Inicio (00:00 a 02:00)
- **Mensaje clave:** *"El Fixture Mundial 2030 no es una aplicación CRUD uniforme: combina fichas jerárquicas de 64 selecciones y 1.536 jugadores, una red de partidos, sedes y cruces eliminatorios, validación de sesiones en cada request HTTP, ingesta de sensores IoT de estadios y analítica ejecutiva BI."*
- **Punto de defensa:** Explicar que intentar resolver todo en un único motor obliga a elegir entre *joins* costosos en lecturas en vivo o contención entre reportes analíticos OLAP y espectadores OLTP.

### Bloque 2 — Arquitectura Políglota (02:00 a 06:00)
- **Recorrido de los 6 modelos:**
  1. **MongoDB (`:27017`):** documentos de `equipos` y `jugadores` con índice cubierto `{ equipoCodigo: 1, posicion: 1, dorsal: 1 }`.
  2. **Neo4j (`:7687`):** grafo de `:Partido`, `:Sede`, `:Equipo`, `:Jugador` y `:Evento`.
  3. **Redis (`:6379`):** sesiones `HASH` con script Lua (`O3`) y caché Read-Aside (`O2`).
  4. **Cassandra (`:9042`):** tablas particionadas por `partido_id` para eventos y comentarios a escala.
  5. **InfluxDB 3 (`:8181`):** series temporales de sensores ambientales por estadio.
  6. **InterSystems IRIS (`:1972`):** Data Mart en estrella (`HechoPartido`, `DimSede`, `DimSeleccion`, `DimTiempo`) alimentado fuera del camino crítico.

### Bloque 3 — Decisiones de Diseño, Distribución y Consistencia (06:00 a 10:00)
- **Integración entre bases:** Mostrar cómo `GET /partidos/F2030-001` valida la sesión en **Redis**, consulta el grafo del partido y sede en **Neo4j**, enriquece en un único lote `$in` a `ARG` y `BRA` desde **MongoDB** y almacena el agregado en **Redis Cache** (`TTL = 120 s`).
- **Trade-offs CAP:** Explicar por qué preferimos consistencia fuerte/causal en escrituras de resultados oficiales y consistencia eventual acotada por TTL (`15 s` a `300 s`) en lecturas masivas.

### Bloque 4 — Operación y Demostración en Vivo (10:00 a 14:00)
- Seguir los 4 pasos de [`demo.md`](demo.md):
  1. Consultar `GET /partidos/F2030-001` y `GET /equipos/ARG/jugadores` mostrando respuesta `HTTP 200`.
  2. Abrir `http://127.0.0.1:8013/metrics` y señalar `fixture2030_component_up`, `fixture2030_http_request_duration_ms_bucket` y `fixture2030_db_operation_duration_ms_bucket`.
  3. Abrir `http://127.0.0.1:9090/targets` y `/alerts` en Prometheus mostrando los 3 targets `UP` y las 6 reglas de alerta.
  4. Abrir el dashboard de Grafana (`http://127.0.0.1:3000/d/fixture2030-hito13-obs`) y recorrer los 9 paneles (disponibilidad, latencia `p50/p95/p99`, comparación entre MongoDB, Neo4j y Redis, throughput, errores, caché y memoria).

### Bloque 5 — Evidencia Cuantitativa (14:00 a 18:00)
- **Hito 11:** 6 motores verificados por TCP y clientes nativos + 262 variantes de contrato HTTP.
- **Hito 12:** Comparativa sobre ventana de `16 s` con `24` usuarios virtuales:
  - Latencia `p95`: **`24,52 ms -> 3,48 ms` (`-85,81%`)**.
  - Throughput: **`992,99 -> 7.115,07 req/s` (`+616,53%`)**.
  - Operaciones a MongoDB: **`-99,29%`** | Operaciones a Neo4j: **`-96,52%`** | Renovaciones en Redis: **`-99,98%`**.
- **Hito 13:** Mostrar la tabla de 3 fases de [`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md): estado normal (`3 UP`, `HTTP 200`), falla controlada (`redis_exporter DOWN`, `neo4j CAÍDO`, `HTTP 503`, alertas `FIRING`) y recuperación completa (`3 UP`, `HTTP 200`).

### Bloque 6 — Cierre y Plan B (18:00 a 20:00)
- Resumir las limitaciones del laboratorio local frente a un despliegue multi-región real para 2030 y las 4 mejoras propuestas (*Singleflight*, invalidación *Pub/Sub*, *Circuit Breaker* con *Stale-If-Error* y exporters de motor en clúster).

---

## 3. Plan B de Contingencia ante Fallos del Entorno Local (RNF7)

Si durante la presentación en vivo algún contenedor de Docker Desktop se reinicia o el puerto local no responde:
1. **Evidencia pre-generada y trazable por commit Git en el repositorio:**
   - Abrir [`evidencia/prometheus_targets.md`](../evidencia/prometheus_targets.md) para mostrar los 3 targets `UP` y las 6 reglas.
   - Abrir [`evidencia/resultados_sin_secretos/consultas_promql_observadas.md`](../evidencia/resultados_sin_secretos/consultas_promql_observadas.md) para mostrar las 8 consultas PromQL y sus vectores reales.
   - Abrir [`evidencia/dashboards/resumen_dashboard_observado.md`](../evidencia/dashboards/resumen_dashboard_observado.md) y [`grafana/dashboards/fixture2030_observabilidad.json`](../grafana/dashboards/fixture2030_observabilidad.json) para mostrar los 9 paneles verificados.
   - Abrir [`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md) para recorrer las 3 fases de la prueba controlada.
2. **Ejecución en memoria sin Docker (`< 2 segundos`):**
   ```bash
   pnpm --dir hito-10-api h13:smoke
   pnpm --dir hito-10-api test:unit
   ```
