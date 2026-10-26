# Hipótesis de Cuellos de Botella, Optimizaciones y Trade-offs — Hito 12

**Asignatura:** Ingeniería de Datos II  
**Proyecto:** Plataforma Fixture Mundial 2030 — Grupo 5  

---

## 1. Diagnóstico e Hipótesis de Cuellos de Botella en la Línea Base (RF7, §5.5)

A partir de la evidencia empírica recolectada en la **Línea Base (`baseline`)** ([`evidencia/resultados_linea_base.md`](evidencia/resultados_linea_base.md)), donde con 24 usuarios virtuales concurrentes se observó un throughput limitado a **`34,96 ops/s`**, una latencia **p95 de `2.039,77 ms`** (`p99 = 3.922,69 ms`) y una **tasa de error del `10,87 %` (`69` respuestas `HTTP 503`)**, formulamos tres hipótesis técnicas vinculadas directamente con la telemetría por capa:

### Hipótesis H1 — Agotamiento de Pools de Conexión (`maxPoolSize = 5`) y Amplificación de Consultas Documentales ($1,63\times$)
- **Evidencia observada en línea base:**
  1. El driver de **Neo4j** (`maxConnectionPoolSize = 5` en `neo4j-graph.repository.ts`) registró un **p95 de `2.012,27 ms`**, un **p99 de `5.410,77 ms`** y **69 fallos** al agotarse el tiempo de espera por una conexión libre del pool bajo 24 usuarios concurrentes.
  2. El driver de **MongoDB** (`maxPoolSize = 5` en `mongo-document.repository.ts`) ejecutó **1.034 operaciones para atender apenas 635 solicitudes HTTP**:
     - En `GET /partidos/:id`, `DataService.match()` dispara dos consultas separadas (`equipos.findOne({ codigo: homeCode })` y `equipos.findOne({ codigo: awayCode })`) sin proyección BSON.
     - En `GET /equipos/:codigo/jugadores`, `DataService.players()` ejecuta tres consultas por cada request (`equipos.findOne({ codigo })` para resolver `team.id`, más `jugadores.find({ equipoId })` y `jugadores.countDocuments({ equipoId })` sin proyección).
- **Explicación técnica:** Cuando 24 usuarios concurrentes solicitan rutas compuestas que requieren entre 2 y 3 operaciones de base de datos cada una, se generan hasta $24 \times 2 = 48$ solicitudes de conexión simultáneas contra un pool de solo 5 conexiones, formando una cola FIFO donde el tiempo de espera en el cliente supera el tiempo real de ejecución del motor.
- **Prueba propuesta:** Ampliar `maxPoolSize` y `maxConnectionPoolSize` de `5` a `25` (alineado con los 24 VUs), unificar la búsqueda de equipos local/visitante en una sola consulta por lote `{ codigo: { $in: [homeCode, awayCode] } }` con proyección explícita de campos, y consultar `jugadores` directamente por `equipoCodigo` con proyección BSON.

### Hipótesis H2 — Ausencia de Caché Read-Aside en Escenario con Claves Calientes (80/20)
- **Evidencia observada en línea base:**
  - En la línea base, las claves calientes (80 % del tráfico sobre 4 partidos y 8 selecciones) tuvieron una mediana de **`269,84 ms`** y un **p95 de `2.039,03 ms`**, prácticamente idénticos a los de las claves frías (`p50 = 260,14 ms`, `p95 = 2.019,90 ms`).
  - El contenedor `fixture2030-neo4j-1` escaló al **`75,75 %` de uso de CPU** recalculando cientos de veces el mismo subgrafo para `F2030-001` (`ARG vs BRA`), `F2030-014`, `F2030-020` y `F2030-023`.
- **Explicación técnica:** Las fichas de selecciones, los planteles de 24 jugadores y los metadatos de sede/partido son inmutables o de muy baja frecuencia de cambio durante un partido, y la lista de eventos solo cambia ante hechos puntuales (goles, tarjetas, cambios). Recalcular en Neo4j y MongoDB cada lectura repetida desperdicia CPU y satura los pools.
- **Prueba propuesta:** Incorporar una capa de **Caché Read-Aside en Redis** (`fixture2030:h12:cache:{recurso}:{clave}`) con TTL diferenciado según la volatilidad del dato (`300 s` para equipos y planteles, `120 s` para ficha de partido, `15 s` para eventos de partido).

### Hipótesis H3 — Escrituras Sincrónicas Redundantes en Redis por Renovación de Sesión en Cada Request (`HSET` + `EXPIRE`)
- **Evidencia observada en línea base:**
  - Las 635 peticiones HTTP ejecutaron **635 escrituras `HSET ultima_actividad` + `EXPIRE 1800`** en Redis dentro del script Lua `READ_AND_RENEW_SESSION`, con una latencia p95 de `63,31 ms` en la capa de sesión.
- **Explicación técnica:** Cuando un mismo usuario autenticado realiza múltiples consultas por minuto al abrir el Centro de Partido (ficha, eventos, planteles), reescribir `ultima_actividad` y reiniciar el TTL de 1.800 s en cada milisegundo no aporta valor funcional al vencimiento de 30 minutos y multiplica las operaciones de mutación y registro AOF en Redis.
- **Prueba propuesta:** Modificar el script Lua de sesión para aplicar una **ventana de amortización (*throttled sliding window*) de 60 segundos**: validar siempre en memoria `PTTL > 0` y `estado_acceso == 'autorizado'`, pero ejecutar `TIME` + `HSET` + `EXPIRE` únicamente cuando el TTL restante sea menor a `1.740 s` (`1800 - 60`).

---

## 2. Registro Detallado de Modificaciones Implementadas (RF8, §5.5)

Cada optimización se implementó y parametrizó en [`scripts/servidor_optimizado.ts`](../scripts/servidor_optimizado.ts) y [`config/configuracion-ejemplo.env`](../config/configuracion-ejemplo.env), permitiendo alternar de forma reproducible entre `--mode=baseline` y `--mode=optimized`:

| ID | Problema / Hipótesis | Cambio Implementado | Archivos / Parámetros Afectados | Costo o Riesgo (Trade-off) | Resultado Medido Post-Cambio | Decisión Final del Equipo |
|:---|:---|:---|:---|:---|:---|:---|
| **O1** | **H1:** Encolamiento en pools (`size=5`) y consultas N+1 / sin proyección en MongoDB. | 1) Pool de MongoDB y Neo4j ampliado de `5` a `25`.<br>2) Consulta única `equipos.find({ codigo: { $in: [home, away] } })` con `TEAM_PROJECTION`.<br>3) Consulta directa a `jugadores` por `equipoCodigo` con `PLAYER_PROJECTION`, evitando `findOne` y `countDocuments` redundantes cuando la página 1 devuelve los 24 jugadores. | `scripts/servidor_optimizado.ts`<br>`H12_MONGO_POOL_SIZE_OPTIMIZED=25`<br>`H12_NEO4J_POOL_SIZE_OPTIMIZED=25` | Mayor consumo de memoria RSS en el proceso Node.js y más descriptores de socket abiertos hacia MongoDB y Neo4j (`160,5 MiB -> 178,5 MiB` RSS). | En claves frías (cache-miss), el p95 cayó de **`2.019,90 ms` a `211,78 ms` (`-89,5 %`)**, el p95 del driver MongoDB bajó de `122,45 ms` a `56,82 ms` (`-53,6 %`) y los errores `503` bajaron de **69 a 0**. | **Adoptada.** |
| **O2** | **H2:** Recálculo constante de partidos y equipos calientes (80/20) en Neo4j y MongoDB. | Caché Read-Aside en Redis (`fixture2030:h12:cache:*`) con serialización JSON y `SET ... EX`:<br>- `equipo:<codigo>`: TTL `300 s`<br>- `plantel:<cod>:<p>:<l>`: TTL `300 s`<br>- `partido:<id>`: TTL `120 s`<br>- `eventos:<id>:<l>`: TTL `15 s` | `scripts/servidor_optimizado.ts`<br>`H12_CACHE_TTL_TEAM_SECONDS=300`<br>`H12_CACHE_TTL_MATCH_SECONDS=120`<br>`H12_CACHE_TTL_EVENTS_SECONDS=15` | Duplicación temporal de datos en RAM de Redis (`1,70 MiB -> 2,35 MiB`) y ventana de eventual desactualización (*staleness*) de hasta 15 s en eventos si no media invalidación explícita. | **Hit Ratio del `96,53 %`** (`4.285` hits / `154` misses). Descarga del **88,6 %** de consultas a MongoDB (`1.034 -> 118`) y **85,0 %** a Neo4j (`401 -> 60`). CPU de Neo4j bajó de **`75,75 %` a `2,38 %`**. | **Adoptada.** |
| **O3** | **H3:** Escritura `HSET` + `EXPIRE` en Redis en el 100 % de las lecturas autenticadas. | Script Lua `READ_AND_RENEW_SESSION_THROTTLED`: comprueba `PTTL > 0` y `estado_acceso == 'autorizado'` en cada request, pero solo escribe `HSET` + `EXPIRE` si `PTTL < 1.740.000 ms`. | `scripts/servidor_optimizado.ts`<br>`H12_SESSION_RENEW_THROTTLE_SECONDS=60` | La marca `ultima_actividad` y el TTL de sesión tienen una resolución de actualización de 60 s en vez de 1 ms (el vencimiento efectivo por inactividad pasa a estar entre 29 y 30 minutos). | **4.439 escrituras de renovación ahorradas** durante la ráfaga de 16 s; la mediana de validación de sesión en Redis bajó de **`29,44 ms` a `17,69 ms` (`-39,9 %`)**. | **Adoptada.** |

---

## 3. Repetición del Escenario y Comparabilidad (RF9, RNF3)

Para garantizar una comparación estrictamente válida (**RNF3**), la ejecución de `pnpm --dir hito-10-api h12:optimizada` (`scripts/ejecutar_prueba_optimizada.ts`) conservó exactamente las mismas condiciones invariantes de la Línea Base:
1. **Reinicialización previa del estado:** Antes de iniciar el calentamiento, `prepareTestData()` eliminó cualquier clave previa de `fixture2030:h12:cache:*` en Redis (partiendo con **caché frío** al inicio de la corrida), restauró el TTL de `1.800 s` de las 20 sesiones virtuales y verificó los conteos exactos en MongoDB y Neo4j.
2. **Misma semilla y secuencia PRNG:** `H12_SEED = 203012`, generando la misma proporción de endpoints (40/30/20/10) y distribución de claves calientes/frías (80/20).
3. **Misma concurrencia y ventanas temporales:** 24 usuarios virtuales concurrentes, 3 s de calentamiento, 4 s de rampa y 12 s de sostenimiento en el mismo host (`AMD Ryzen 5 5600U`, Windows 11, Node.js `v22.18.0`).

---

## 4. Síntesis de Mejoras, Regresiones y Trade-offs Documentados (RF10, RF11)

Las tablas completas y gráficos se encuentran en [`evidencia/tablas_o_graficos.md`](evidencia/tablas_o_graficos.md).

### 4.1. Mejoras Verificadas
- **Eliminación total de errores bajo carga:** La tasa de error cayó de **`10,87 %` (69 errores `HTTP 503`) a `0,00 %` (`4.439 / 4.439` respuestas `HTTP 200` válidas)**.
- **Multiplicación por $7,92\times$ del Throughput Global:** De **`34,96 ops/s`** a **`276,94 ops/s` (`+692,2 %`)**.
- **Caída drástica en todos los percentiles de latencia E2E:**
  - **Mediana (p50):** `267,81 ms` $\rightarrow$ **`65,83 ms` (`-75,4 %`)**.
  - **Percentil 90 (p90):** `2.014,12 ms` $\rightarrow$ **`126,18 ms` (`-93,7 %`)**.
  - **Percentil 95 (p95):** `2.039,77 ms` $\rightarrow$ **`159,28 ms` (`-92,2 %`)**.
  - **Percentil 99 (p99):** `3.922,69 ms` $\rightarrow$ **`245,07 ms` (`-93,8 %`)**.
- **Protección de los motores de persistencia primaria:** Las lecturas a MongoDB bajaron un **88,6 %** (`1.034 -> 118`) y las consultas Cypher a Neo4j bajaron un **85,0 %** (`401 -> 60`), reduciendo el uso de CPU del contenedor Neo4j del **`75,75 %` al `2,38 %`**.

### 4.2. Regresiones y Costos Asumidos (Trade-offs — RF11)
1. **Incremento de memoria en Redis (`+38,0 %` sobre la base):** El uso de RAM en Redis subió de `1,70 MiB` (`1.786.960 bytes`) a **`2,35 MiB` (`2.464.624 bytes`)** para alojar las **149 proyecciones cacheadas** durante la prueba. Como Redis está configurado con `maxmemory 256mb` y `maxmemory-policy noeviction` (Hito 7), si el catálogo de claves cacheadas creciera sin control podría agotar los 256 MiB y bloquear la creación de sesiones. Por ello es obligatorio conservar TTLs cortos (`15 s` a `300 s`) y alcance acotado.
2. **Incremento de memoria RSS y Heap en Node.js:** El proceso de la API + generador incrementó su RSS final de `160,52 MiB` a **`178,53 MiB` (`+11,2 %`)** debido a mantener pools de hasta 25 conexiones activas y procesar $6,99\times$ más respuestas por segundo.
3. **Compromiso entre frescura (*staleness*) y latencia en eventos de partido:** Con un TTL de `15 s` para `eventos:<id>:<limit>`, si no se dispara una invalidación activa al insertar un evento nuevo, un espectador podría tardar hasta 15 segundos en ver reflejado un cambio o tarjeta en la ruta `GET /partidos/:id/eventos`.
4. **Leve variación en el p99 de `GET /equipos/:codigo` (`252,9 ms -> 262,9 ms`, `+3,9 %`):** Al multiplicarse por $9,38\times$ el caudal de este perfil (`52 -> 430` peticiones), el percentil 99 capturó los *cold misses* iniciales de equipos fríos que coincidieron con el llenado inicial de caché.
