# Propuesta de Data Mart e Integración Analítica — Hito 12

**Asignatura:** Ingeniería de Datos II  
**Proyecto:** Plataforma Fixture Mundial 2030 — Grupo 5  

---

## 1. Pregunta Analítica Seleccionada (RF12, §5.7)

> **Pregunta Analítica Principal:**  
> *«¿Cómo evolucionan, por partido, selección, confederación, sede e intervalo de 15 minutos de juego, la intensidad deportiva (goles, tarjetas, cambios, posesión media, tiros al arco y pases completados) junto con el volumen de interacción social (comentarios publicados, likes y respuestas), para comparar el impacto deportivo y de audiencia entre fases y sedes del Mundial 2030?»*

### 1.1. ¿Por qué esta pregunta requiere un Data Mart en lugar de consultar las fuentes operacionales en vivo?
En la arquitectura operacional del Fixture 2030, los datos necesarios para responder esta pregunta están repartidos en **cuatro motores NoSQL con modelos y propósitos operacionales heterogéneos**:
1. **MongoDB (`equipos`, `jugadores`):** contiene el catálogo maestro de selecciones, confederación (`CONMEBOL`, `UEFA`, etc.) y origen de clasificación.
2. **Neo4j (`:Partido`, `:Sede`, `:Evento`, `:Equipo`):** contiene la topología del torneo, sede/región y los eventos deportivos discretos (`Gol`, `Tarjeta amarilla`, `Tarjeta roja`, `Cambio`) con su minuto reglamentario.
3. **InfluxDB 3 Core (`estadisticas_equipo` y `estadisticas_minuto`):** almacena la telemetría temporal de alta frecuencia (muestras cada 10 segundos) y los resúmenes consolidados minuto a minuto (`posesion_promedio`, `tiros_final`, `pases`, `muestras`).
4. **Apache Cassandra (`comentarios_por_partido`):** ingesta masiva de interacciones de usuarios, particionada por `(partido_id, bucket_minuto, grupo)` sobre 16 grupos concurrentes para evitar contención de partición en picos de comentarios.

Intentar responder esta pregunta analítica desde el camino operacional (por ejemplo, encadenando consultas a los 16 grupos por minuto en Cassandra + recorridos Cypher en Neo4j + agregaciones sobre InfluxDB + búsquedas BSON en MongoDB cada vez que un analista o directivo abre un tablero) constituiría el **antipatrón de consulta distribuida en serie sobre múltiples fuentes operacionales en tiempo real** advertido en la especificación técnica (§1, §7). Provocaría una latencia prohibitiva, alta amplificación de lectura y competencia directa por CPU, memoria y pools de conexión contra los espectadores que consultan la API en vivo.

---

## 2. Fuentes Operacionales, Procedencia y Claves de Correspondencia (RF12, RF13, RNF12)

```mermaid
flowchart LR
    subgraph Operacional["Fuentes Operacionales NoSQL (OLTP / Ingesta Continua)"]
        M[("MongoDB 7.0\ncolección: equipos")]
        N[("Neo4j 5.x\n:Partido / :Sede / :Evento")]
        I[("InfluxDB 3 Core (History)\nmedición: estadisticas_minuto")]
        C[("Cassandra 5.0\ntabla: comentarios_por_partido")]
    end

    subgraph ETL["Pipeline ETL / Micro-batch Analítico"]
        E["Extractor Incremental\n(Ventanas de 15 min cerradas)"]
        T["Normalización de Esquema,\nCálculo de Incrementos (Delta Tiros)\ny Separación de Granos Kimball"]
        E --> T
    end

    subgraph DM["Data Mart Analítico (Constelación de Hechos Kimball)"]
        FE[["fact_rendimiento_equipo_bloque15m\n(Grano: partido, equipo, bloque15m)"]]
        FA[["fact_interaccion_partido_bloque15m\n(Grano: partido, bloque15m)"]]
        DP[("dim_partido")]
        DE[("dim_equipo")]
        DS[("dim_sede")]
        DB[("dim_bloque_tiempo")]

        FE --> DP
        FE --> DE
        FE --> DS
        FE --> DB

        FA --> DP
        FA --> DS
        FA --> DB
    end

    M -->|"UUID v5 + codigo (ARG)"| E
    N -->|"partido.id + sede.id + eventos"| E
    I -->|"partido_id + equipo_id\npases, tiros_final, posesion"| E
    C -->|"partido_id + bucket_minuto\n(sin equipo_id)"| E
    T -->|"Carga Idempotente (Upsert)"| FE
    T -->|"Carga Idempotente (Upsert)"| FA
```

### Tabla de Procedencia Documentada Dato por Dato (RNF12)

| Atributo / Medida en el Data Mart | Rol Dimensional | Motor de Origen | Objeto / Tabla / Colección Origen | Campo Original Real | Transformación y Mapeo Aplicado |
|:---|:---|:---|:---|:---|:---|
| `partido_id` | PK / FK Dimensión | **Neo4j** | Nodos `:Partido` | `p.id` (`F2030-001`) | Validación de formato canónico `^F2030-\d{3}$` y mapeo directo a `dim_partido`. |
| `equipo_id` | PK / FK Dimensión | **MongoDB** / **Neo4j** | Colección `equipos` / Nodos `:Equipo` | `_id` / `e.id` | Conservación del UUID v5 determinístico generado en Hito 4 (`dns:fixture2030.org/equipo/<codigo>`). |
| `equipo_codigo` | Atributo Dimensión | **MongoDB** | Colección `equipos` | `codigo` (`ARG`) | Normalización ISO 3 caracteres mayúsculas en `dim_equipo`. |
| `confederacion` | Atributo Dimensión | **MongoDB** | Colección `equipos` | `confederacion` | Mapeo directo del enumerado FIFA (`CONMEBOL`, `UEFA`, `AFC`, `CAF`, `CONCACAF`, `OFC`). |
| `sede_id`, `sede_pais`, `sede_region` | Atributos Dimensión | **Neo4j** | Nodos `:Sede` | `s.id`, `s.pais`, `s.region` | Extracción mediante la relación `(:Partido)-[:SE_JUEGA_EN]->(:Sede)` hacia `dim_sede`. |
| `fase_torneo`, `condicion_equipo` | Atributos Dimensión | **Neo4j** | Nodos `:Partido`, rel. `[:DISPUTA]` | `p.fase`, `r.condicion` | Normalización de fase y condición (`local` / `visitante`). |
| `bloque_15m_id` | PK / FK Dimensión | Derivado multi-motor | Minuto de evento o timestamp UTC | `e.minuto`, `time` (InfluxDB), `bucket_minuto` (Cassandra) | Discretización reglamentaria en bloques cerrados: `B1 (0-15')`, `B2 (16-30')`, `B3 (31-45+')`, `B4 (46-60')`, `B5 (61-75')`, `B6 (76-90+')`, más eventuales prórrogas `B7` y `B8`. |
| `goles_bloque`, `tarjetas_amarillas`, `tarjetas_rojas`, `cambios_bloque` | Medidas Aditivas de Equipo | **Neo4j** | `:Evento` + `:OCURRE_EN` + `:INVOLUCRA` | `e.tipo`, `e.minuto`, `j.equipoCodigo` | Conteo condicional (`COUNT(CASE WHEN e.tipo = 'Gol' THEN 1 END)`) agrupado por `(partido_id, equipo_id, bloque_15m_id)`. |
| `posesion_promedio_pct` | Medida Semi-aditiva de Equipo | **InfluxDB 3** (base histórica) | Medición `estadisticas_minuto` (`influxdb/scripts/resumenes.py:60-77`) | `posesion_promedio`, `muestras` | Promedio ponderado de los 15 resúmenes de 1 minuto del bloque: $\frac{\sum (\text{posesion\_promedio} \times \text{muestras})}{\sum \text{muestras}}$. |
| `pases_completados_bloque` | Medida Aditiva de Equipo | **InfluxDB 3** (base histórica) | Medición `estadisticas_minuto` | `pases` | Suma de los pases en los 15 minutos que componen el bloque: $\sum_{m=1}^{15} \text{pases}_m$. |
| `tiros_nuevos_bloque` | Medida Aditiva de Equipo | **InfluxDB 3** (base histórica) | Medición `estadisticas_minuto` | `tiros_final` | `tiros_final` persiste el acumulado de tiros al cierre de cada minuto. El incremento del bloque se calcula como: $\Delta\text{tiros} = \text{tiros\_final}(\text{minuto } 15) - \text{tiros\_final}(\text{minuto } 0)$, garantizando no-negatividad. |
| `comentarios_totales`, `likes_acumulados`, `respuestas_acumuladas` | Medidas Aditivas de Partido | **Cassandra** | Tabla `comentarios_por_partido` (`cassandra/scripts/00_esquema.cql`) | `comentario_id`, `likes`, `respuestas` | Agregación por partición `(partido_id, bucket_minuto, grupo 0..15)` de los 15 minutos del bloque: `COUNT(comentario_id)`, `SUM(likes)`, `SUM(respuestas)`. |

---

## 3. Grano, Desacople de Medidas y Modelo Constelación de Kimball (RF12, H12-04)

### 3.1. Detección y Resolución de la Incompatibilidad de Granos
Una inspección técnica rigurosa de las fuentes revela una discrepancia fundamental de grano:
- **Las estadísticas deportivas de InfluxDB y los eventos de Neo4j tienen grano de equipo:** tanto `estadisticas_minuto` (con tags `partido_id` y `equipo_id`) como los eventos con relación `[:INVOLUCRA]->(:Jugador)` se atribuyen unívocamente a una selección participante.
- **Los comentarios de Cassandra tienen grano de partido:** la tabla `comentarios_por_partido` está particionada por `((partido_id, bucket_minuto, grupo))` y almacena comentarios de hinchas que opinan sobre el encuentro general. **No existe un campo `equipo_id` en Cassandra.**

> [!WARNING] Riesgo de Doble Conteo si se fuerza un Grano Incompatible
> Si se intentara almacenar las medidas sociales (`comentarios_totales`, `likes`) dentro de una única tabla de hechos con grano `(partido_id, equipo_id, bloque_15m_id)`, **cada comentario se duplicaría obligatoriamente** en la fila del equipo local y en la fila del equipo visitante. Al ejecutar consultas analíticas agregadas (por ejemplo, *«total de comentarios en partidos de CONMEBOL»* o *«comentarios totales de la fase de grupos»*), la suma arrojaría exactamente el **doble ($2\times$) de la audiencia real**, violando los principios de diseño dimensional de Kimball.

### 3.2. Modelo Dimensional Propuesto: Esquema Constelación (*Fact Constellation*)
Para preservar la aditividad estricta de todas las medidas sin forzar datos artificiales ni inventar atribuciones no presentes en las fuentes operacionales, el Data Mart implementa dos tablas de hechos que comparten dimensiones conformadas:

1. **`fact_rendimiento_equipo_bloque15m` (Grano: `partido_id, equipo_id, bloque_15m_id`):**
   - Aloja las medidas deportivas propias de cada selección en cada cuarto de hora.
   - Cada partido reglamentario genera $2 \times 6 = 12$ filas.
   - En los 32 partidos del laboratorio genera exactamente **384 filas**; en los 127 partidos proyectados del Mundial 2030 genera **1.524 filas**.
2. **`fact_interaccion_partido_bloque15m` (Grano: `partido_id, bloque_15m_id`):**
   - Aloja las medidas de audiencia e interacción social del encuentro en ese cuarto de hora.
   - Cada partido reglamentario genera 6 filas (1 por bloque temporal).
   - En los 32 partidos genera **192 filas**; en los 127 partidos proyectados genera **762 filas**.
3. **Vista Unificada de Consumo Analítico (`vw_partido_audiencia_rendimiento_15m`):**
   - Cruza ambas tablas mediante `JOIN` por `(partido_id, bloque_15m_id)` para tableros que requieren correlacionar goles/tarjetas con picos de comentarios, conservando la trazabilidad de que los comentarios son una medida a nivel partido y no atribuible unívocamente a un equipo sin un proceso adicional de NLP/menciones.

### 3.3. Ventaja del Grano y Estimación de Rendimiento (§5.7, H12-08)
- **Reducción masiva de volumen:** Millones de muestras temporales de 10 s y millones de comentarios distribuidos en 16 particiones por minuto se consolidan en menos de **2.300 registros totales por torneo completo**.
- **Objetivo de diseño analítico estimado:** Esta estructura compacta permite responder agregaciones multi-partido, cruces por confederación, sede o etapa en **tiempos de orden de milisegundos en motores OLAP tabulares o columnares**.  
  *Nota de honestidad experimental (RNF14, §5.7):* Esta cifra representa un objetivo de diseño técnico derivado del dimensionamiento de filas en memoria; el Data Mart constituye una propuesta arquitectónica y no fue implementado ni medido experimentalmente en este laboratorio.

---

## 4. Flujo ETL, Frecuencia, Retraso Aceptable y Tolerancia a Fallas (RF13, §5.7)

| Dimensión Operativa | Especificación Técnica | Justificación Arquitectónica |
|:---|:---|:---|
| **Estrategia de extracción** | **Micro-batch por ventana cerrada de 15 minutos:**<br>- Las dimensiones maestras (`dim_equipo`, `dim_sede`, `dim_partido`) se sincronizan al inicio de cada jornada en batch.<br>- Las métricas de hechos se extraen por bloques temporales cerrados desde `estadisticas_minuto` (InfluxDB), eventos de Neo4j y `comentarios_por_partido` (Cassandra). | Minimiza el consumo de recursos operacionales al evitar la extracción streaming registro por registro en motores diseñados para batch/particiones. |
| **Frecuencia de ejecución** | **Cada 5 minutos en partidos en vivo** (actualización provisional del bloque activo) y **consolidación definitiva a los 15 minutos post-partido** (`estado = 'Finalizado'`). | Provee información analítica oportuna para análisis táctico y de prensa sin saturar los motores operacionales durante el juego. |
| **Retraso aceptable (SLA de frescura)** | **De 1 a 5 minutos durante el partido; hasta 15 minutos post-partido.** | Las preguntas analíticas estratégicas (comparación de confederaciones, sedes o cuartos de hora) no requieren latencia sub-segundo; priorizan consistencia y completitud sobre inmediatez. |
| **Tratamiento de datos tardíos (*Late-arriving data*)** | Siguiendo el principio de Hito 8 (`influxdb/scripts/resumenes.py`), un minuto en InfluxDB solo se consolida cuando están presentes sus 6 muestras de 10 s. El proceso ETL evalúa una **ventana deslizante de re-lectura de 30 minutos** (bloque actual y bloque previo) para capturar eventos de arbitraje o comentarios ingresados con retraso de red. | Evita truncar métricas por asincronía de relojes o retrasos de ingesta sin reescribir todo el torneo. |
| **Estrategia ante duplicados e idempotencia** | Inserción mediante **`UPSERT` (`INSERT ... ON CONFLICT (partido_id, equipo_id, bloque_15m_id) DO UPDATE`)** reemplazando las medidas del bloque con el recálculo determinístico de la ventana completa. | Si el proceso ETL se ejecuta múltiples veces ante reintentos de red, el estado final del Data Mart es estrictamente idéntico. |
| **Tratamiento ante fallas parciales o caídas de fuente** | Si Cassandra sufre un timeout durante la extracción pero InfluxDB y Neo4j responden, se persiste el registro en `fact_rendimiento_equipo_bloque15m`, y en `fact_interaccion_partido_bloque15m` se registra un flag de calidad `estado_extraccion = 'PARCIAL_REINTENTO_PENDIENTE'`, programando un reintento en el siguiente ciclo. | Evita publicar ceros artificiales como si no hubiera comentarios y asegura completitud eventual. |
| **Auditoría de integridad y validación de agregados** | Al finalizar cada partido se valida automáticamente:<br>1) $\sum \text{goles\_bloque} == \text{COUNT}(:Evento \{\text{tipo}: \text{'Gol'}\})$ en Neo4j.<br>2) $\sum \text{pases\_completados\_bloque} == \sum \text{pases}$ en `estadisticas_minuto` de InfluxDB.<br>3) $\sum \text{comentarios\_bloque} == \text{COUNT}(*)$ en Cassandra para ese partido. | Asegura que la capa analítica sea un reflejo matemático exacto de las fuentes operacionales. |

---

## 5. Comparación Crítica: Consulta Operacional Distribuida vs. Consulta al Data Mart (§5.7)

| Criterio Evaluado | Consulta Distribuida a las 4 Fuentes Operacionales en Vivo | Consulta a la Proyección Pre-Agregada del Data Mart |
|:---|:---|:---|
| **Cantidad de conexiones y protocolos** | 4 protocolos distintos (Bolt, MongoDB Wire Protocol, InfluxDB HTTP/Flight, CQL) con al menos 19 consultas de red por minuto analizado. | **1 sola conexión SQL/OLAP** sobre el Data Mart dimensional. |
| **Complejidad de transformación en lectura** | La aplicación cliente debe normalizar en memoria UUIDs v5, códigos ISO, calcular promedios ponderados y sumar 16 particiones por minuto de Cassandra. | Las claves ya están unificadas, las dimensiones conformadas y los totales pre-agregados en el grano de 15 minutos. |
| **Riesgo de degradación operacional** | **Crítico:** analistas ejecutando consultas pesadas saturan memoria y pools de conexión compartidos con los usuarios de la app en vivo. | **Aislamiento total:** la carga analítica está físicamente desacoplada del camino crítico operacional. |
| **Frescura del dato** | En tiempo real estricto (0–2 segundos). | Retraso controlado (1–5 minutos durante partido, 15 minutos consolidado). |
| **Caso de uso idóneo** | Visualización operativa en vivo del partido en curso (`GET /partidos/:id`, feed de eventos y comentarios recientes). | Análisis táctico post-partido, tableros de audiencia por sede/confederación, informes para prensa y auditoría histórica del torneo. |
