# Guía Reproducible de Demostración en Vivo y Plan B — Hito 13 (§8.3, RF16, RNF7)

Esta guía contiene los comandos exactos, en orden secuencial, para ejecutar la demostración técnica frente al comité evaluador de la FIFA en menos de 4 minutos, junto con el protocolo de respaldo offline (RNF7).

---

## 1. Preparación Previa a la Defensa (1 comando)

Desde la raíz del repositorio (`uade-tpo-ingenieria-de-datos-ii-fixture`):

```bash
# Levanta MongoDB, Neo4j, Redis, Prometheus (:9090), Redis Exporter (:9121) y Grafana (:3000)
pnpm --dir hito-10-api h13:iniciar
```

En una segunda terminal, iniciar el servidor API instrumentado en el puerto `8013`:

```bash
pnpm --dir hito-10-api h13:servidor
```

---

## 2. Paso a Paso durante los 4 Minutos de Demo en Vivo

### Paso 1 — Demostrar la API REST Políglota y OpenAPI / Swagger (`1 min`)

1. Abrir en el navegador `http://127.0.0.1:8013/docs` (Swagger UI) o ejecutar por terminal:
   ```bash
   # Salud general de la API
   curl -i http://127.0.0.1:8013/salud
   ```
2. Ejecutar la **lectura compuesta políglota** (`GET /partidos/F2030-001`, que combina **Redis Session + Redis Cache + Neo4j + MongoDB**):
   ```bash
   pnpm --dir hito-10-api eval:api --in-process
   ```

### Paso 2 — Mostrar Consultas Nativas en los Motores Políglotas (`1 min`)

```bash
# 1. MongoDB: proyección del plantel de Argentina usando el índice compuesto
docker exec fixture2030-mongodb-1 mongosh --quiet -u admin -p "${MONGO_ROOT_PASSWORD}" --authenticationDatabase admin fixture2030 --eval "db.jugadores.find({equipoCodigo:'ARG'},{_id:1,nombre:1,apellido:1,posicion:1,dorsal:1}).sort({posicion:1,dorsal:1}).limit(3).toArray()"

# 2. Neo4j: consulta Cypher del partido inaugural F2030-001 y su sede
docker exec fixture2030-neo4j-1 cypher-shell -u neo4j -p "${NEO4J_PASSWORD}" "MATCH (l:Equipo)-[:DISPUTA {condicion:'local'}]->(p:Partido {id:'F2030-001'})<-[:DISPUTA {condicion:'visitante'}]-(v:Equipo), (p)-[:SE_JUEGA_EN]->(s:Sede) RETURN p.id, l.codigo, v.codigo, s.nombre, s.ciudad;"

# 3. Redis: inspección de memoria y llaves activas de sesión y caché
docker exec fixture2030-redis-1 redis-cli INFO memory
```

### Paso 3 — Mostrar Targets, Exporters y Consultas PromQL en Prometheus (`1 min`)

1. Abrir `http://127.0.0.1:8013/metrics` para mostrar la exposición en formato Prometheus `0.0.4`.
2. Abrir `http://127.0.0.1:9090/targets` para mostrar los 3 jobs en estado **`UP`**:
   - `prometheus` (`localhost:9090`)
   - `fixture2030_api` (`host.docker.internal:8013`)
   - `redis_exporter` (`redis-exporter:9121`)
3. En `http://127.0.0.1:9090/graph`, ejecutar dos consultas PromQL en vivo:
   - Comparación de latencia `p95` por motor:
     ```promql
     histogram_quantile(0.95, sum by (le, engine) (rate(fixture2030_db_operation_duration_ms_bucket[1m])))
     ```
   - Estado de las sondas activas de los motores:
     ```promql
     fixture2030_component_up{monitored_mode="active_probe"}
     ```

### Paso 4 — Recorrer el Dashboard de Grafana y la Evidencia de Falla/Recuperación (`1 min`)

1. Abrir `http://127.0.0.1:3000/d/fixture2030-hito13-obs` (el dashboard carga automáticamente sin login gracias al provisioning declarativo).
2. Señalar los **9 paneles**:
   - Paneles 1 y 2: Disponibilidad `UP (1)` de targets y motores activos.
   - Paneles 3 y 4: Latencia HTTP (`p50`, `p95`, `p99`) con umbral en `250 ms` y comparación directa **MongoDB vs. Neo4j vs. Redis**.
   - Paneles 5 y 6: Throughput HTTP por ruta (`req/s`) y volumen de operaciones por motor (`ops/s`).
   - Paneles 7, 8 y 9: Errores `4xx/5xx`, eficiencia de caché/throttling de sesiones y consumo de memoria RSS/Redis.
3. Mostrar en [`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md) cómo el sistema detectó la caída inducida de `redis-exporter` (`up == 0`) y de `neo4j` (`HTTP 503`, alertas `FIRING`) y cómo se recuperó a `UP (1)` y `HTTP 200`.

---

## 3. Plan B de Respaldo si Falla un Servicio en Vivo (RNF7)

Si Docker no estuviera disponible en el equipo de proyección durante la defensa:
1. Abrir [`defensa/presentacion.html`](presentacion.html) directamente en cualquier navegador (no requiere servidor web ni conexión a internet).
2. Ejecutar las pruebas en memoria y validaciones del repositorio:
   ```bash
   pnpm --dir hito-10-api h13:smoke
   pnpm --dir hito-10-api h12:smoke
   pnpm --dir hito-10-api test:unit
   ```
3. Respaldar cada afirmación abriendo los reportes versionados en [`evidencia/prometheus_targets.md`](../evidencia/prometheus_targets.md), [`evidencia/resultados_sin_secretos/consultas_promql_observadas.md`](../evidencia/resultados_sin_secretos/consultas_promql_observadas.md) y [`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md).
