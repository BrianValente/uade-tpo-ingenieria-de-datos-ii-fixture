# Guion de defensa oral — 20 minutos

## 1. Tiempo y participación (seis bloques, §6.2)

| Bloque | Minuto | Duración | Responsable | Apoyo |
| :--- | :--- | :--- | :--- | :--- |
| 1. Inicio | 00:00–02:00 | 2 min | Brian Valente | Diapositivas1–2 |
| 2. Arquitectura | 02:00–06:00 | 4 min | Brian Valente | Diapositiva3 |
| 3. Decisiones | 06:00–12:00 | 6 min | Tomás Bravo | Diapositivas4–5 |
| 4. Operación | 12:00–16:00 | 4 min | Julián Curi | Diapositivas6–7 y [demo](demo.md) |
| 5. Evidencia | 16:00–18:30 | 2 min30 s | Julián Curi | Diapositivas8–9 y reportes |
| 6. Cierre | 18:30–20:00 | 1 min30 s | Julián Curi, cierre conjunto | Diapositiva10 |

Participación: Brian6 min, Tomás6 min y Julián8 min. Ensayar con cronómetro; preparar carga y fallas antes de exponer para no consumir el bloque de operación esperando ventanas completas.

## 2. Desarrollo

### Bloque1 — Inicio, Brian (00:00–02:00)

“Presentamos el Fixture2030 del Grupo5: catálogo, relaciones del torneo, comentarios, sesiones, estadísticas temporales y reglas oficiales de objetos. La arquitectura políglota asigna cada patrón a un modelo y los integra por HTTP. No afirmamos que SQL sea incapaz de representarlo: defendemos las decisiones por consultas, estructuras y trade-offs, con evidencia de laboratorio.”

Separar el escenario académico2030 del dataset realmente cargado. No presentar millones de espectadores como una carga ejecutada.

### Bloque2 — Arquitectura, Brian (02:00–06:00)

Mostrar seis motores y los puertos de sus protocolos: Mongo27017, Redis6379, Neo4j7687, Cassandra9042, Influx8181 e IRIS1972. La API H10 en8000 integra puertos/adaptadores, Zod/OpenAPI y autenticación. La versión instrumentada H13 en8013 publica `/metrics`; Prometheus9090, Redis Exporter9121 y Grafana3000 constituyen el monitoreo.

Recorrer `GET /partidos/F2030-001`:

1. Validar sesión real Redis. El throttle de60s evita renovar en cada solicitud, no desactiva autenticación.
2. Consultar caché Read-Aside; un hit evita cargar de nuevo el agregado desde las fuentes, sin prometer un tiempo fijo por request.
3. En un miss, resolver partido/sede en Neo4j y selecciones en MongoDB. O1 incluye pool/proyección/batching; la consulta Cypher consolidada ya está en la base.
4. Poblar caché con TTL120s. Explicar sus límites de frescura y que caché fail-open no implica sesiones fail-open.

El Data Mart aparece como propuesta de integración, no como ETL en ejecución.

### Bloque3 — Decisiones, Tomás (06:00–12:00)

Dedicar aproximadamente un minuto por modelo, incluyendo la vista analítica en IRIS:

- **MongoDB:** `equipos`, `jugadores`, `usuarios_api`, validadores y acceso por código/equipo. Distinguir el índice H4 por `equipoId` del filtro H12 por `equipoCodigo`; no transferir un explain entre consultas distintas. O1 agrupa varios cambios y O2 descarga lecturas.
- **Neo4j:** etiquetas/relaciones del partido y recorridos Cypher. La consulta expresa relaciones directamente; no hay benchmark SQL equivalente. El p95 del driver no mejoró en O1 en esta repetición, por lo que no se atribuye una cola eliminada al pool.
- **Cassandra:** `((partido_id,bucket_minuto,grupo),creado_en,comentario_id)`, dieciséis claves lógicas y fan-out ordenado. No son dieciséis nodos físicos en este laboratorio.
- **Redis:** HASH de sesión/TTL1800s, STRING de caché/TTLs15–300s y ZSET de rankings H7. Sesiones fallan cerrado; la caché es reconstruible. Mostrar contadores de hits/misses y renovación ejecutada/omitida por ventana.
- **InfluxDB3:** detalle cada10s/retención7d y resumen por minuto completo/90d. Promedios y contadores tienen reglas distintas. Separar el volumen de pruebas históricas H8 de la muestra de integración actual.
- **IRIS:** `Fixture.Partido`, árbitro/técnicos/eventos, transición `Programado→EnJuego→Finalizado`, persistencia e invariantes verificadas por el SDK oficial. El Data Mart tiene grano/DDL/reglas propuestos; no se midió un pipeline analítico desplegado.

El respaldo con los diez puntos por motor y ocho ejes está en [decisiones de arquitectura](../docs/decisiones_de_arquitectura.md).

### Bloque4 — Operación, Julián (12:00–16:00)

1. **Un minuto:** mostrar servicios y el [diagnóstico H11](../../hito-11-conectividad/docs/evidencia/reporte_conectividad_inicial.md): nueve listeners, diecinueve pruebas nativas y doce contratos live conformes. Consultar partido con token en memoria y mostrar `/metrics` sin credenciales.
2. **Un minuto y medio:** abrir `/targets` en Prometheus, identificar tres targets UP y distinguir `up`, `redis_up` y sondas TCP. Mostrar las seis reglas: `for`, ventana y umbral son cosas diferentes. El umbral250ms es operativo, no la frontera entre los p95 medidos.
3. **Un minuto y medio:** recorrer los nueve paneles Grafana y sus dieciséis expresiones. Correlacionar HTTP, motor, caché y recursos; un datasource roto no se valida consultando Prometheus por otro camino.

No ejecutar diagnósticos y stop/start Redis en paralelo. El entorno de la demo debe usar la configuración y plataforma compatibles documentadas en el [README](../README.md).

### Bloque5 — Evidencia, Julián (16:00–18:30)

Mostrar [O2 aislada](../../hito-12-carga-optimizacion/docs/evidencia/comparacion_isolated_o2.md) y el [conjunto](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md):

“Con código `cd653d6`, 24 VUs y ventanas completas, base1103.48 ops/s y p9531.381ms; solo O2,4028.12 ops/s y9.539ms. Cambia una política de código: caché, con pools5 y sin throttle. O1 es un paquete, no el efecto individual del pool. El conjunto alcanzó3965.25 ops/s y9.254ms, sin superar el caudal O2 en esta repetición. No hubo fallos HTTP ni de integridad en las ventanas. La emulación, una repetición por perfil y la RAM visible variable limitan la inferencia.”

Mostrar las tres fases de [H13](../evidencia/prueba_de_falla.md):

- Antes: tres targets UP, API200 y disponibilidad normal.
- Durante: stop real del exporter más inyección **simulada** Neo4j, dos targets UP/uno DOWN, API503 y dos alertas de disponibilidad FIRING.
- Después: exporter restaurado, simulación retirada, tres targets UP y API200; las alertas de disponibilidad regresan a INACTIVE. La alerta de tasa5xx puede seguir FIRING por su ventana histórica y los contadores no se reinician.

“Eso no prueba recuperación física Neo4j ni preservación de volúmenes por sí solo. El [ciclo real Redis H11](../../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion_real.md) sí hace stop/start del motor con la misma API/token y compara sesión, entidad, contenedor y mounts.”

### Bloque6 — Cierre, Julián y equipo (18:30–20:00)

Distinguir tres planos:

1. **Implementado y ejecutado:** consultas de los seis motores, HTTP, mutaciones/invariantes IRIS, perfiles de carga e integridad, métricas/dashboard y recuperación Redis real.
2. **Monitoreo de alcance limitado:** Cassandra/InfluxDB/IRIS tienen sondas TCP, no exporters internos dedicados en H13. H11 verifica además protocolo/contexto/datos; son niveles diferentes.
3. **Propuesto:** réplica/multirregión, ETL del Data Mart, singleflight y stale acotado. No son garantías desplegadas.

Declarar el laboratorio: Mongo/Influx emulados, IRIS en VM QEMU por falta de AVX físico, SDK oficial en Ubuntu compatible y memoria visible variable. No vender los tiempos como capacidad2030. Cerrar y remitir preguntas al [documento de catorce respuestas](../docs/defensa_final.md).

## 3. Contingencia

La [presentación autocontenida](presentacion.html) y los JSON/Markdown versionados permiten exponer una ejecución auténtica ya capturada si falla la demo. Mostrar siempre el commit/fecha originales y decir que se trata de evidencia pre-capturada, no una nueva ejecución. `pnpm --dir hito-10-api h13:smoke` comprueba lógica sin motores; no sustituye integración real ni debe anunciarse como tal.
