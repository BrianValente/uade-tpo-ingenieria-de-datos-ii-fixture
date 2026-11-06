# Guía Paso a Paso para la Demostración en Vivo (4 Minutos) — Hito 13 (§6.3)

Esta guía contiene los comandos exactos y verificados para ejecutar la demostración operativa durante el **Bloque 4 (`12:00 – 16:00`)** de la defensa final, cubriendo los **6 puntos obligatorios de la sección 6.3** del PDF.

---

## Preparación Previa a la Exposición (Antes de Iniciar el Reloj de 20 Minutos)

Completar primero los prerrequisitos y la carga de datos del [README H13](../README.md). Usar Node/SDK IRIS en plataforma soportada si se demuestran sus rutas. Desde la raíz, iniciar monitoreo y luego el servidor en otra terminal; el scope propio evita mezclar sesiones de demo con las veinte del benchmark:

```bash
# 1. Levantar MongoDB, Neo4j, Redis, Prometheus (:9090), Redis Exporter (:9121) y Grafana (:3000)
pnpm --dir hito-10-api h13:iniciar

# 2. En una terminal dedicada, dejar corriendo el servidor de monitoreo de la API (:8013)
H12_REDIS_SCOPE=h13-demo pnpm --dir hito-10-api h13:servidor
```

---

## Secuencia en Vivo durante los 4 Minutos de Operación (§6.3)

### Paso 1 — Estado de Contenedores y Consulta Directa a Bases de Datos (§6.3.a y §6.3.f — `00:45s`)

1. Verificar que los contenedores de bases de datos y de observabilidad estén `Up` / `healthy`:
   ```bash
   docker compose ps
   docker compose -f hito-13-monitoreo/docker-compose.yml ps
   ```
2. Mostrar una consulta real en cliente nativo (**§6.3.f**) sobre los tres motores activos:
   ```bash
   # MongoDB: verificar 64 selecciones y ficha de Argentina (ARG)
   bash scripts/run-mongosh.sh --eval 'db.equipos.findOne({codigo:"ARG"}, {_id:1, codigo:1, nombre:1, confederacion:1})'

   # Neo4j: verificar partido F2030-001 y su sede en el grafo
   bash scripts/run-cypher.sh "MATCH (l:Equipo)-[:DISPUTA {condicion:'local'}]->(p:Partido {id:'F2030-001'})-[:SE_JUEGA_EN]->(s:Sede) RETURN p.id, p.fase, l.codigo, s.nombre;"

   # Redis: inspeccionar llaves de caché Read-Aside y sesiones activas
   docker compose exec -T redis redis-cli --scan --pattern 'fixture2030:h13:cache:*'
   ```

---

### Paso 2 — Consulta a la API REST Políglota y Exposición de `/metrics` (§6.3.b — `00:45s`)

1. Verificar salud de la API (`GET /health`) y el endpoint `/metrics`:
   ```bash
   curl -s http://127.0.0.1:8013/health
   curl -s http://127.0.0.1:8013/metrics
   ```
2. Ejecutar contratos HTTP reales, incluyendo login y consulta de partido sin imprimir tokens ni contraseñas. El código IRIS debe existir y estar seleccionado mediante `H11_IRIS_MATCH_CODE` en el `.env` privado:
   ```bash
   (cd hito-10-api && API_URL=http://127.0.0.1:8013 node --env-file=.env --import tsx ../hito-11-conectividad/scripts/prueba_api.ts)
   ```
3. Verificar targets, datasource/dashboard y sus expresiones:
   ```bash
   pnpm --dir hito-10-api h13:verificar-targets
   ```

---

### Paso 3 — Targets `UP`, Consultas PromQL y Reglas de Alerta en Prometheus (§6.3.c y §6.3.d — `01:00s`)

1. Abrir **`http://127.0.0.1:9090/targets`** y mostrar los **3 targets en estado `UP (1)`**:
   - `fixture2030_api` (`http://host.docker.internal:8013/metrics`)
   - `redis_exporter` (`http://redis-exporter:9121/metrics`)
   - `prometheus` (`http://localhost:9090/metrics`)
2. En **`http://127.0.0.1:9090/graph`**, ejecutar estas 3 consultas PromQL clave:
   ```promql
   # 1. Distinguir chequeos activos de sondas TCP; el valor depende de servicios reales disponibles
   fixture2030_component_up

   # 2. Latencia HTTP p95 global en ventana móvil de 1m (ms)
   histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))

   # 3. Cache Hit Ratio en Redis Read-Aside (0.0 a 1.0)
   sum(rate(fixture2030_cache_events_total{result="hit"}[1m])) / clamp_min(sum(rate(fixture2030_cache_events_total{result=~"hit|miss"}[1m])), 0.001)
   ```
3. Abrir **`http://127.0.0.1:9090/alerts`** y mostrar las **6 reglas de alerta** definidas en [`prometheus/reglas-o-alertas.yml`](../prometheus/reglas-o-alertas.yml).

---

### Paso 4 — Interpretación de Paneles en Grafana y Toma de Decisiones Técnicas (§6.3.e — `01:30s`)

Abrir **`http://127.0.0.1:3000/d/fixture2030-hito13-obs`** (tablero aprovisionado automáticamente sin requerir login manual) y explicar los paneles con esta guía de interpretación y decisión operativa (**§6.3.e**):

| Panel en Grafana (`fixture2030-hito13-obs`) | Qué Muestra e Interpretación Técnica | Qué Decisión Técnica se Toma a partir del Panel |
| :--- | :--- | :--- |
| **Paneles 1 y 2: Disponibilidad de Targets (`up`) y Sondas Políglotas (`fixture2030_component_up`)** | Diferencia si cayó un proceso/exporter de infraestructura (Panel 1) o si cayó la conectividad de protocolo con MongoDB, Neo4j o Redis (Panel 2). | Si `up == 0` o `fixture2030_component_up == 0`, activar el runbook del DBA/SRE correspondiente y verificar que la API esté respondiendo `503` rápido sin agotar sockets. |
| **Paneles 3 y 4: Latencia HTTP (`p50/p95/p99`) vs. Latencia `p95` por Motor de Datos** | El Panel 3 muestra si la experiencia del usuario se acerca al umbral crítico de `250 ms`; el Panel 4 aísla inmediatamente si la demora proviene de `neo4j`, `mongodb`, `redis_session` o `redis_cache`. | Si el Panel 3 supera `100–250 ms` y el Panel 4 muestra picos en `neo4j` o `mongodb`, verificar el Hit Ratio de caché (Panel 8), revisar índices/planes (`EXPLAIN`) o escalar réplicas de lectura. |
| **Paneles 5, 6 y 7: Throughput HTTP (`req/s`), Volumen por Base (`ops/s`) y Errores (`4xx/5xx`)** | Permiten contrastar cuántas peticiones entran por ruta (Panel 5) frente a cuántas llegan realmente a cada motor (Panel 6) y si algún conector está arrojando errores (Panel 7). | Si las `ops/s` de MongoDB/Neo4j crecen al mismo ritmo que los `req/s` HTTP, la caché dejó de amortiguar tráfico; si aparecen barras en el Panel 7 (`status="error"`), aislar la ruta y dependencia afectada. |
| **Paneles 8 y 9: Caché, sesiones y memoria** | Contadores de hit/miss y renovación omitida, RSS/heap Node y memoria Redis; observar valores actuales, no tomar una instantánea como máximo. | Revisar mezcla/TTL y presión de memoria. Conservar `noeviction` para sesiones; una política de desalojo de caché exige aislarla y evaluar frescura. No recomendar expulsar sesiones válidas para mejorar un gráfico. |

---

### Demostración de la Prueba Controlada de Falla y Recuperación (RF10)

Si el comité solicita ver la inyección de falla y recuperación automatizada (o revisar su ejecución completa):

> [!WARNING]
> Si dejó corriendo el servidor interactivo en la **Terminal 2** (`h13:servidor`), deténgalo primero con `Ctrl+C` antes de ejecutar el runner autónomo, ya que este último inicia su propia instancia controlada en `:8013`.

```bash
# Ejecuta las 3 fases (Antes -> Durante la caída real de redis-exporter e inyección simulada en Neo4j -> Después de la recuperación)
pnpm --dir hito-10-api h13:prueba-controlada
```

O bien mostrar la tabla comparativa ya generada en [`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md).

---

### Cierre Limpio sin Pérdida de Datos (RNF11)

Al finalizar la demostración, si se desea detener los contenedores de monitoreo conservando intactos todos los datos y volúmenes de las bases de datos:

```bash
pnpm --dir hito-10-api h13:limpiar
```
