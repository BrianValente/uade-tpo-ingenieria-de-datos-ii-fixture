# Limitaciones del Entorno y Separación entre Evidencia Medida y Proyección — Hito 13 (§7, RNF3, RNF8)

## 1. Principio Rector: Honestidad Experimental (RNF8)

En cumplimiento estricto de la sección **§7** y los requisitos no funcionales **RNF3** y **RNF8**, este documento establece la frontera explícita entre:
1. **Lo medido directamente en el laboratorio local** con evidencia verificable en este repositorio.
2. **Lo obtenido mediante exporters o sondas de disponibilidad.**
3. **Los objetivos de diseño y proyecciones arquitectónicas** hacia la escala completa de la Copa Mundial FIFA 2030 (`127` partidos, múltiples regiones y clústeres replicados).

---

## 2. Matriz de Clasificación: Medición Real vs. Sonda vs. Proyección Arquitectónica

| Dimensión / Afirmación Técnica | Categoría (§5.1 / RNF8) | Estado en el Laboratorio Local (Hitos 10–13) | Evidencia Concreta en el Repositorio | Condición para Producción Mundial 2030 |
| :--- | :---: | :--- | :--- | :--- |
| **Flujo integrado HTTP (`Fastify -> Redis + Neo4j + MongoDB`)** | **Medido directamente** | Activo y verificado bajo concurrencia (`24` usuarios virtuales en Hito 12; `240+` operaciones en Hito 13) | [`hito-12-carga-optimizacion/resultados/`](../../hito-12-carga-optimizacion/resultados/) y [`evidencia/resultados_sin_secretos/consultas_promql_observadas.md`](../evidencia/resultados_sin_secretos/consultas_promql_observadas.md) | Despliegue en múltiples réplicas detrás de balanceador L7 |
| **Mejora de latencia `p95` (`24,52 ms -> 3,48 ms`, `-85,8%`) y throughput (`992 -> 7.110 req/s`, `+616,5%`)** | **Medido directamente** | Medido en ventanas equivalentes de `16 s` con `0%` de error HTTP y `0` errores de integridad | [`hito-12-carga-optimizacion/docs/comparacion_antes_despues.md`](../../hito-12-carga-optimizacion/docs/comparacion_antes_despues.md) | Calibración de TTLs e invalidación dirigida por eventos en vivo |
| **Telemetría interna del motor Redis (`used_memory`, `maxmemory`, `connected_clients`, `db_keys`)** | **Obtenido por exporter oficial (`redis_exporter`)** | Recolectado cada `5s` desde `oliver006/redis_exporter:v1.67.0` conectado a `fixture2030-redis-1` | [`evidencia/prometheus_targets.md`](../evidencia/prometheus_targets.md) y panel 9 de Grafana | Redis Cluster / Sentinel con exporter por nodo |
| **Detección de caída de target (`up == 0`), fallo de motor (`HTTP 503`) y recuperación a `UP`** | **Medido directamente (Prueba controlada RF10)** | Ejecutado en 3 fases (Antes -> Durante -> Después) con transición real de alertas a `FIRING` y recuperación a `HTTP 200` | [`evidencia/prueba_de_falla.md`](../evidencia/prueba_de_falla.md) y [`evidencia/prueba_de_falla.json`](../evidencia/prueba_de_falla.json) | Integración con Alertmanager (PagerDuty / Slack / Webhook) |
| **Conectividad y consultas nativas sobre los 6 motores (`MongoDB`, `Neo4j`, `Cassandra`, `Redis`, `InfluxDB`, `IRIS`)** | **Medido directamente en Hito 11** | Los 6 motores fueron levantados, poblados y consultados mediante clientes nativos y sockets TCP en Hito 11 | [`hito-11-conectividad/evidencia/resumen_ejecucion.md`](../../hito-11-conectividad/evidencia/resumen_ejecucion.md) | Todos los motores corriendo en nodos dedicados e independientes |
| **Estado de `Cassandra`, `InfluxDB` e `IRIS` durante la corrida de Hito 13** | **Sonda TCP informativa (`tcp_socket_probe`)** | Reportados honestamente con `up = 0` (`monitored_mode="tcp_socket_probe"`) cuando sus contenedores están detenidos bajo demanda para ahorrar RAM | [`docs/inventario_de_componentes.md`](inventario_de_componentes.md) y [`evidencia/prometheus_targets.md`](../evidencia/prometheus_targets.md) | Incorporar `jmx_exporter` (Cassandra), `/metrics` nativo (InfluxDB) y exporter SQL/SNMP (IRIS) |
| **Escala completa del torneo (`127` partidos, `72` selecciones en fase final, millones de espectadores globales)** | **Objetivo de diseño / Proyección** | El dataset de laboratorio modela un corte representativo (`32` partidos canónicos, `64` selecciones, `1.536` jugadores, `512` eventos) | [`hito-12-carga-optimizacion/docs/escenario_de_carga.md`](../../hito-12-carga-optimizacion/docs/escenario_de_carga.md) | Escalado horizontal del mismo esquema de particionamiento e índices |
| **Replicación multi-nodo (`RF=3` en Cassandra, Replica Sets en MongoDB, Causal Clustering en Neo4j)** | **Objetivo de diseño / Proyección** | En `compose.yaml` local cada motor corre como instancia `single-node` (`RF=1` en laboratorio) | [`compose.yaml`](../../compose.yaml) y [`docs/decisiones_de_arquitectura.md`](decisiones_de_arquitectura.md) | Clústeres multi-AZ en las regiones sede (Sudamérica, Península Ibérica, Marruecos) |

---

## 3. Limitaciones Técnicas del Laboratorio Local y su Impacto

1. **Co-localización en un único host físico (`Windows 11`, `12` hilos lógicos, `15,71 GiB` RAM):**
   - La API Node.js, el generador de carga, Prometheus, Grafana y las bases de datos comparten CPU y memoria del mismo equipo.
   - **Mitigación aplicada:** durante las pruebas de carga (Hito 12) y monitoreo activo (Hito 13) se mantienen encendidos únicamente los contenedores del flujo integrado (`mongodb`, `neo4j`, `redis` + stack de observabilidad), evitando que el heap JVM de Cassandra (`~1,8 GiB`) induzca *swapping* en el sistema operativo.
2. **Latencia de red loopback (`127.0.0.1` / `host.docker.internal`):**
   - Las latencias medidas (`p95 = 3,48 ms` en modo optimizado) reflejan el costo puro de serialización, pool de conexiones y ejecución en motor sin salto WAN intercontinental.
   - En un despliegue distribuido real entre sedes de **Argentina, Uruguay, Paraguay, España, Portugal y Marruecos**, la latencia de red entre regiones (`30–140 ms` RTT) haría aún más determinante el uso de caché **Redis Read-Aside** local a cada región y réplicas de lectura cercanas al borde.
3. **Ausencia de Exporters Internos para MongoDB y Neo4j Community:**
   - Mientras Redis cuenta con `redis_exporter` (`:9121`) para inspeccionar su memoria interna, MongoDB y Neo4j Community se monitorean desde la perspectiva de la aplicación (histogramas de duración de operaciones, conteo de fallos y sondas activas `ping:1` / `RETURN 1`).
   - Esta decisión evita agregar contenedores sidecar adicionales al laboratorio y mide directamente lo que afecta al usuario: la disponibilidad y latencia real de cada consulta desde el driver oficial.
