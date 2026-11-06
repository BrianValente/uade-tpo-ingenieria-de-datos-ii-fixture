# Inventario de componentes y alcance de monitoreo — Hito 13

## 1. Componentes ejecutados

Los seis motores estuvieron activos en el [diagnóstico real H11](../../hito-11-conectividad/docs/evidencia/reporte_conectividad_inicial.md), incluyendo protocolo, contexto, datos y HTTP. La carga H12/H13 se concentra en MongoDB/Neo4j/Redis; eso no convierte una sonda TCP de los otros motores en chequeo nativo.

| Componente | Puerto | Función | Observabilidad H13 |
| :--- | :--- | :--- | :--- |
| API instrumentada | 8013 | Adaptadores H10, `/auth`, equipos, partidos, salud y métricas | Contadores/histogramas HTTP, motores, caché/sesiones y recursos Node |
| MongoDB7 | 27017 | Catálogo y `usuarios_api` | Ping de driver y operaciones instrumentadas; no exporter nativo dedicado |
| Neo4j | 7687/7474 | Partido, sede, participantes y eventos | RETURN1 por Bolt y operaciones instrumentadas; no exporter nativo dedicado |
| Redis | 6379 | Sesiones y caché | PING, métricas de aplicación y Redis Exporter9121 |
| Cassandra5 | 9042 | Comentarios por partido/minuto/grupo y autor/mes | Sonda TCP y adaptador instrumentado al operar; sin exporter interno propio |
| InfluxDB3 | 8181 | Estadísticas temporales | Sonda TCP y adaptador instrumentado al operar; sin exporter interno propio |
| IRIS2026.2 en la corrida | 1972/52773 | Objetos, reglas y SQL | Sonda TCP SuperServer y adaptador instrumentado al operar; sin exporter interno propio |
| Prometheus3.2.1 | 9090 | Scrapes, reglas y PromQL | Auto-monitoreo; scrape/evaluación cada5s |
| Grafana11.5.2 | 3000 | Dashboard de nueve paneles | Salud, UID/datasource/dashboard y dieciséis expresiones por su proxy |

La API H10 en8000 y la versión instrumentada H13 en8013 son procesos distintos. El laboratorio usa motores oficiales reales bajo las condiciones de [emulación documentadas](limitaciones_y_evidencia.md); no usa respuestas de datos fabricadas. La ejecución instrumentada de los [contratos de los seis motores](../evidencia/resultados_sin_secretos/contratos_http_seis_motores.json) usa Node24.13/Ubuntu24.04 para el SDK oficial IRIS.

## 2. Infraestructura frente a aplicación

- `up`: éxito del scrape de cada target. El target del exporter puede estar UP y Redis inaccesible; por eso se comprueban también `redis_up=1` y métricas nativas.
- Redis Exporter: memoria usada/máxima, clientes conectados, comandos y claves. Si el exporter está detenido, la salud Redis desde ese origen es **desconocida**, no caída demostrada del motor.
- Proceso Node: RSS/heap, CPU y uptime. Son recursos del proceso, no una medición continua de todos los contenedores ni de las bases completas.
- `fixture2030_component_up` y `fixture2030_component_probe_latency_ms`: sondas cada2s. API/MongoDB/Neo4j/Redis usan chequeos activos; Cassandra/InfluxDB/IRIS usan transporte TCP. Esos tres no acreditan autenticación, namespace/keyspace/base ni lectura.
- `fixture2030_http_requests_total` / `fixture2030_http_request_duration_ms_*`: método, plantilla de ruta y clase/status HTTP. El tiempo de Fastify no incluye todo el tiempo de red/parseo del generador E2E H12.
- `fixture2030_db_operations_total` / `fixture2030_db_operation_duration_ms_*`: motor, operación y resultado de los adaptadores, no estadísticas internas del motor.
- `fixture2030_cache_events_total`: hit/miss/write por entidad; `fixture2030_session_renewals_total`: executed/throttled_skip.

## 3. Límites y pruebas complementarias

No se agrega un exporter para cada tecnología: el alcance implementa instrumentación de aplicación y un exporter Redis, más sondas explícitamente rotuladas. El diagnóstico H11 complementa esas sondas con consultas reales de los seis motores; la suite de integración comprueba también escrituras/invariantes.

La [prueba H13](../evidencia/prueba_de_falla.md) detiene realmente el exporter e inyecta una falla **simulada** Neo4j. El [ciclo Redis H11](../../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion_real.md) detiene/inicia el motor real y compara sesión, entidad, contenedor y mounts. No intercambiar las conclusiones de ambos experimentos.

La memoria visible de la VM varía y los tiempos incluyen emulación. Las instantáneas de recursos y la muestra académica no certifican capacidad global, disponibilidad multirregión ni un despliegue analítico; ver los metadatos de cada corrida.
