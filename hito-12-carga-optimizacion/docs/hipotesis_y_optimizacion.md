# Hipótesis de Cuellos de Botella, Optimizaciones y Trade-offs — Hito 12

**Asignatura:** Ingeniería de Datos II  
**Proyecto:** Plataforma Fixture Mundial 2030 — Grupo 5  

---

## 1. Diagnóstico e Hipótesis de Cuellos de Botella en la Línea Base (RF7, §5.5)

A partir de la evidencia empírica recolectada en la **Línea Base (`baseline`)** ([`evidencia/resultados_linea_base.md`](evidencia/resultados_linea_base.md)), ejecutada sobre la ventana completa de `16,125 s` (`TIME_WINDOW_COMPLETED`, commit `5533d42`) con 24 usuarios virtuales concurrentes, donde se observó un throughput limitado a **`124,59 ops/s`** (`2.009` operaciones), una latencia mediana **p50 de `167,838 ms`** y una cola **p95 de `308,750 ms`** (`p99 = 532,104 ms`, con el `82,3 %` de las peticiones por encima de `100 ms`), formulamos tres hipótesis técnicas vinculadas directamente con la telemetría por capa:

### Hipótesis H1 — Contención en Pools de Conexión (`maxPoolSize = 5`) y Amplificación de Consultas Documentales ($1,79\times$)
- **Evidencia observada en línea base:**
  1. El driver de **MongoDB** (`maxPoolSize = 5` en `mongo-document.repository.ts`) ejecutó **`3.592` operaciones para atender `2.009` solicitudes HTTP** (amplificación de $1,79\times$), con una latencia del driver de **`66,024 ms` en p50** y **`109,793 ms` en p95** (`p99 = 153,885 ms`):
     - En `GET /partidos/:id`, `DataService.match()` dispara dos consultas separadas (`equipos.findOne({ codigo: homeCode })` y `equipos.findOne({ codigo: awayCode })`) sin proyección BSON.
     - En `GET /equipos/:codigo/jugadores`, `DataService.players()` ejecuta tres consultas por cada request (`equipos.findOne({ codigo })` para resolver `team.id`, más `jugadores.find({ equipoId })` y `jugadores.countDocuments({ equipoId })` sin proyección).
  2. El driver de **Neo4j** (`maxConnectionPoolSize = 5` en `neo4j-graph.repository.ts`) ejecutó **`1.227` consultas Cypher**, alcanzando un **p95 de `355,530 ms`** y un **p99 de `530,314 ms`** por espera de adquisición de conexión libre bajo 24 usuarios concurrentes.
- **Explicación técnica:** Cuando 24 usuarios concurrentes solicitan rutas compuestas que requieren entre 2 y 3 operaciones de base de datos cada una, se generan hasta $24 \times 2 = 48$ solicitudes de conexión simultáneas contra pools de solo 5 conexiones, formando una cola FIFO donde el tiempo de espera en el cliente domina la latencia del handler HTTP (`139,642 ms` de media en Fastify).
- **Prueba propuesta:** Ampliar `maxPoolSize` y `maxConnectionPoolSize` de `5` a `25` (alineado con los 24 VUs), unificar la búsqueda de equipos local/visitante en una sola consulta por lote `{ codigo: { $in: [homeCode, awayCode] } }` con proyección explícita de campos (`TEAM_PROJECTION`), y consultar `jugadores` directamente por `equipoCodigo` con proyección BSON (`PLAYER_PROJECTION`), manteniendo la validación de existencia del equipo cuando la consulta retorna vacío en cualquier página (`HTTP 404`).

### Hipótesis H2 — Ausencia de Caché Read-Aside en Escenario con Claves Calientes (80/20)
- **Evidencia observada en línea base:**
  - En la línea base, las claves calientes (80 % del tráfico sobre 4 partidos y 8 selecciones: `1.595` requests) tuvieron una mediana de **`168,013 ms`** y un **p95 de `304,542 ms`**, prácticamente idénticos a los de las claves frías (`414` requests: `p50 = 166,473 ms`, `p95 = 340,348 ms`).
  - Los motores de disco y grafo recalcularon miles de veces las mismas fichas de partido (`F2030-001`, `F2030-014`, `F2030-020`, `F2030-023`) y planteles de las 8 selecciones cabeza de serie.
- **Explicación técnica:** Las fichas de selecciones, los planteles de 24 jugadores y los metadatos de sede/partido son inmutables o de muy baja frecuencia de cambio durante un partido, y la lista de eventos solo cambia ante hechos puntuales (goles, tarjetas, cambios). Recalcular en Neo4j y MongoDB cada lectura repetida desperdicia I/O y satura los pools.
- **Prueba propuesta:** Incorporar una capa de **Caché Read-Aside en Redis** (`fixture2030:h12:cache:{recurso}:{clave}`) con TTL diferenciado según la volatilidad del dato (`300 s` para equipos y planteles, `120 s` para ficha de partido, `15 s` para eventos de partido).

### Hipótesis H3 — Escrituras Sincrónicas Redundantes en Redis por Renovación de Sesión en Cada Request (`HSET` + `EXPIRE`)
- **Evidencia observada en línea base:**
  - Las `2.009` peticiones HTTP ejecutaron **`2.009` escrituras `HSET ultima_actividad` + `EXPIRE 1800`** en Redis dentro del script Lua `READ_AND_RENEW_SESSION`, con una latencia mediana de `22,876 ms` y p95 de `42,584 ms` en la capa de sesión.
- **Explicación técnica:** Cuando un mismo usuario autenticado realiza múltiples consultas por minuto al abrir el Centro de Partido (ficha, eventos, planteles), reescribir `ultima_actividad` y reiniciar el TTL de 1.800 s en cada milisegundo no aporta valor funcional al vencimiento de 30 minutos y multiplica las operaciones de escritura en Redis.
- **Prueba propuesta:** Modificar el script Lua de sesión para aplicar una **ventana de amortización (*throttled sliding window*) de 60 segundos**: validar siempre en memoria `PTTL > 0` y `estado_acceso == 'autorizado'`, pero ejecutar `TIME` + `HSET` + `EXPIRE` únicamente cuando el TTL restante sea menor a `1.740 s` (`1800 - 60`).

---

## 2. Registro Detallado de Modificaciones Implementadas (RF8, §5.5)

Cada optimización se implementó y parametrizó en [`scripts/servidor_optimizado.ts`](../scripts/servidor_optimizado.ts) y [`config/configuracion-ejemplo.env`](../config/configuracion-ejemplo.env), resolviendo una única configuración efectiva compartida (`resolveBenchmarkServerConfig`) entre el servidor y el reporte:

| ID | Problema / Hipótesis | Cambio Implementado | Archivos / Parámetros Afectados | Costo o Riesgo (Trade-off) | Resultado Medido Post-Cambio (Efecto Conjunto) | Decisión Final del Equipo |
|:---|:---|:---|:---|:---|:---|:---|
| **O1** | **H1:** Contención en pools (`size=5`) y consultas N+1 / sin proyección en MongoDB. | 1) Pool de MongoDB y Neo4j ampliado de `5` a `25` (`timeout=3000 ms`).<br>2) Consulta única `equipos.find({ codigo: { $in: [home, away] } })` con `TEAM_PROJECTION`.<br>3) Consulta directa a `jugadores` por `equipoCodigo` con `PLAYER_PROJECTION`, verificando existencia del equipo solo si `rows.length === 0` (conservando `404` en cualquier página). | `scripts/servidor_optimizado.ts`<br>`H12_MONGO_POOL_SIZE_OPTIMIZED=25`<br>`H12_NEO4J_POOL_SIZE_OPTIMIZED=25`<br>`DEPENDENCY_TIMEOUT_MS=3000` | Mayor consumo de memoria RSS en el proceso Node.js y más descriptores de socket abiertos hacia MongoDB y Neo4j (`219,94 MiB -> 327,32 MiB` RSS en snapshot post-prueba). | El p95 del driver MongoDB bajó de **`109,793 ms` a `33,850 ms` (`-69,2 %`)** y el p95 del driver Neo4j bajó de **`355,530 ms` a `48,454 ms` (`-86,4 %`)**. En las claves de menor frecuencia (20% PRNG), el p95 E2E bajó de `340,348 ms` a `72,343 ms` (`-78,7 %`) por el efecto conjunto de O1 + O2 + O3. | **Adoptada.** |
| **O2** | **H2:** Recálculo constante de partidos y equipos calientes (80/20) en Neo4j y MongoDB. | Caché Read-Aside en Redis (`fixture2030:h12:cache:*`) con serialización JSON y `SET ... EX`:<br>- `equipo:<codigo>`: TTL `300 s`<br>- `plantel:<cod>:<p>:<l>`: TTL `300 s`<br>- `partido:<id>`: TTL `120 s`<br>- `eventos:<id>:<l>`: TTL `15 s` | `scripts/servidor_optimizado.ts`<br>`H12_CACHE_TTL_TEAM_SECONDS=300`<br>`H12_CACHE_TTL_MATCH_SECONDS=120`<br>`H12_CACHE_TTL_EVENTS_SECONDS=15` | Incremento de memoria en RAM de Redis (`1,81M -> 2,42M` en snapshot post-prueba) y ventana de eventual desactualización (*staleness*) de hasta 15 s en eventos si no media invalidación explícita. | **Hit Ratio del `98,57 %`** (`8.131` hits / `118` misses sobre `8.249` peticiones). Descarga del **`97,7 %`** de consultas a MongoDB (`3.592 -> 83`) y **`96,5 %`** a Neo4j (`1.227 -> 43`). | **Adoptada.** |
| **O3** | **H3:** Escritura `HSET` + `EXPIRE` en Redis en el 100 % de las lecturas autenticadas. | Script Lua `READ_AND_RENEW_SESSION_THROTTLED`: comprueba `PTTL > 0` y `estado_acceso == 'autorizado'` en cada request, pero solo escribe `HSET` + `EXPIRE` si `PTTL < 1.740.000 ms`. | `scripts/servidor_optimizado.ts`<br>`H12_SESSION_RENEW_THROTTLE_SECONDS=60` | La marca `ultima_actividad` y el TTL de sesión tienen una resolución de actualización de 60 s en vez de 1 ms (el vencimiento efectivo por inactividad pasa a estar entre 29 y 30 minutos). | **`8.249` escrituras de renovación ahorradas** durante la ventana de `16,018 s` (`0` escrituras ejecutadas); la mediana de validación de sesión en Redis bajó de **`22,876 ms` a `7,338 ms` (`-67,9 %`)**. | **Adoptada.** |

---

### 2.1. Consideraciones Metodológicas de Análisis (H12-06, RF7, RF10, RNF14)
1. **Evaluación de Efecto Conjunto e Hipótesis de Atribución:** En el escenario optimizado, las tres técnicas (**O1**, **O2** y **O3**) se activaron de forma simultánea para evaluar la capacidad de la plataforma integrada. Por consiguiente, los resultados empíricos reflejan el **efecto sinérgico conjunto** de las tres medidas. La contribución individual de cada cambio se analiza conceptualmente como una **hipótesis técnica explicativa** coherente con la telemetría de cada capa.
2. **Distinción entre Frecuencia de Clave (PRNG 80/20) y Estado de Caché (Hit vs. Miss):** La marca `isHotKey` del generador indica únicamente si la clave pertenece al conjunto del 80 % más demandado (4 partidos calientes y 8 selecciones) o al 20 % de baja frecuencia (claves frías). **Ambos conjuntos son almacenados en la caché Read-Aside una vez consultados.** En la corrida optimizada se registraron **`1.618` peticiones sobre claves de baja frecuencia** y únicamente **`118` *cache misses* en la totalidad del tráfico (`8.249` requests)**, lo que demuestra que al menos **`1.500` operaciones sobre claves frías (`92,7 %`)** fueron satisfechas directamente como *cache hits* tras su primer acceso.
3. **Métricas de Recursos como Snapshots Puntuales Post-Prueba:** Las mediciones de CPU, memoria de contenedores Docker (`docker stats --no-stream`) y uso de RAM en Redis y Node.js reportadas en este documento y en los JSON de evidencia corresponden a **instantáneas estáticas (*snapshots*) capturadas inmediatamente después de finalizar la ventana medida**, y no a series de tiempo continuas de los picos transitorios.

---

## 3. Repetición del Escenario y Comparabilidad de Ventanas (RF9, RNF3, R2-02)

Para garantizar una comparación estrictamente válida (**RNF3**), la ejecución de `pnpm --dir hito-10-api h12:optimizada` (`scripts/ejecutar_prueba_optimizada.ts`) conservó exactamente las mismas condiciones invariantes y completó la misma ventana temporal que la Línea Base:
1. **Reinicialización previa del estado:** Antes de iniciar el calentamiento, `prepareTestData()` eliminó cualquier clave previa de `fixture2030:h12:cache:*` en Redis (partiendo con **caché frío** al inicio de la corrida), restauró el TTL de `1.800 s` de las 20 sesiones virtuales y verificó los conteos exactos en MongoDB y Neo4j.
2. **Misma semilla y secuencia PRNG:** `H12_SEED = 203012`, generando la misma proporción de endpoints (40/30/20/10) y distribución de claves calientes/frías (80/20) sobre el mismo commit (`5533d42`, árbol `clean`).
3. **Ventanas temporales completas y equivalentes (`TIME_WINDOW_COMPLETED`):** Con el tope de seguridad fijado en `H12_MAX_OPERATIONS = 50000`, ninguna de las dos corridas sufrió truncamiento prematuro. Ambas completaron los `3 s` de calentamiento excluido, los **`4 s` de rampa de incremento (`rampupCompleted = true`)** y los **`12 s` de sostenimiento (`steadyCompleted = true`)**, registrando duraciones totales prácticamente idénticas (**`16,125 s`** en línea base vs. **`16,018 s`** en flujo optimizado, diferencia de `-0,7 %`).

---

## 4. Síntesis de Mejoras, Regresiones y Trade-offs Documentados (RF10, RF11)

Las tablas completas y gráficos se encuentran en [`evidencia/tablas_o_graficos.md`](evidencia/tablas_o_graficos.md).

### 4.1. Mejoras Verificadas en Ventana Equivalente (`16,1 s` vs. `16,0 s`)
- **Multiplicación por $4,13\times$ del Throughput Global Sostenido:** De **`124,59 ops/s`** (`2.009` ops) a **`514,98 ops/s`** (`8.249` ops, **`+313,3 %`**), manteniendo **`0 %` de errores HTTP** y **`100 %` de integridad de payloads** verificada en ambas corridas.
- **Reducción sustancial en todos los percentiles de latencia E2E:**
  - **Media (`avg`):** `172,950 ms` $\rightarrow$ **`41,892 ms` (`-75,8 %`)**.
  - **Mediana (`p50`):** `167,838 ms` $\rightarrow$ **`39,298 ms` (`-76,6 %`)**.
  - **Percentil 90 (`p90`):** `247,187 ms` $\rightarrow$ **`54,375 ms` (`-78,0 %`)**.
  - **Percentil 95 (`p95`):** `308,750 ms` $\rightarrow$ **`65,572 ms` (`-78,8 %`)**.
  - **Percentil 99 (`p99`):** `532,104 ms` $\rightarrow$ **`83,586 ms` (`-84,3 %`)**.
  - **Concentración por debajo de `100 ms`:** En la línea base el `82,3 %` de las respuestas demoraba `>= 100 ms`; en el flujo optimizado el **`99,6 %` de las respuestas (`8.216 / 8.249`) se resuelve en `< 100 ms`** (con el `85,1 %` en `< 50 ms`).
- **Descarga de los motores de persistencia primaria:** Las llamadas al driver de MongoDB bajaron un **`97,7 %`** (`3.592 -> 83`) y las consultas Cypher a Neo4j bajaron un **`96,5 %`** (`1.227 -> 43`), mientras Redis absorbió el `98,57 %` de las lecturas desde memoria y evitó `8.249` escrituras de sesión.

### 4.2. Regresiones, Costos Asumidos y Recursos Observados (Trade-offs — RF11, Snapshots Post-Prueba)
1. **Incremento de memoria en Redis (`+33,4 %` sobre la base):** La memoria usada reportada en la instantánea post-prueba de Redis subió de `1,81 MiB` (`1.901.008 B`) a **`2,42 MiB` (`2.536.848 B`)** para alojar las claves de caché Read-Aside (`158` claves activas verificadas post-carga en `INT-06`). Como Redis está configurado con `maxmemory 256mb` y `maxmemory-policy noeviction` (Hito 7), si el catálogo de claves cacheadas creciera sin control podría agotar los 256 MiB y bloquear la creación de sesiones. Por ello es obligatorio conservar TTLs acotados (`15 s` a `300 s`) y alcance por prefijo.
2. **Incremento de memoria RSS en Node.js (`+48,8 %`):** El proceso de la API + generador registró en la instantánea final un RSS de **`327,32 MiB`** frente a `219,94 MiB` en la línea base, asociado a la ejecución del flujo optimizado con `4,11x` más volumen HTTP transferido (`26.140,63 KiB` vs. `6.395,26 KiB`) en la misma ventana de 16 segundos.
3. **Compromiso entre frescura (*staleness*) y latencia en eventos de partido:** Con un TTL de `15 s` para `eventos:<id>:<limit>`, si no se dispara una invalidación activa al insertar un evento nuevo, un espectador podría tardar hasta 15 segundos en ver reflejado un cambio o tarjeta en la ruta `GET /partidos/:id/eventos`.
4. **Complejidad operativa adicional:** El patrón Read-Aside introduce una dependencia lógica entre las rutas de escritura (POST de eventos en Neo4j o actualización de planteles en MongoDB) y la invalidación o expiración de claves en Redis, que debe ser auditada continuamente mediante controles como `INT-06`.
