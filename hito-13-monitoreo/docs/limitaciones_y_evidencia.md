# Alcance del laboratorio y de la evidencia — Hito 13

## Qué demuestra cada artefacto

| Evidencia | Camino ejercido | Lo que no demuestra |
| :--- | :--- | :--- |
| [Carga H12](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md) | HTTP Fastify + sesiones/caché Redis + consultas MongoDB y Neo4j, con validación de payloads y telemetría por capa | Capacidad mundial, latencia WAN o contribuciones individuales de O1/O2/O3 cuando se activan juntas |
| [Aislamiento O2](../../hito-12-carga-optimizacion/docs/evidencia/comparacion_isolated_o2.md) | Solo se activa la política de caché; O1 y O3 permanecen apagadas respecto del control | Efecto de ampliar pools o amortizar sesiones; esas variables no cambiaron en esta comparación |
| [Diagnóstico H11](../../hito-11-conectividad/docs/evidencia/reporte_conectividad_inicial.md) | TCP, protocolo/cliente, contexto y operación de los seis motores, más rutas HTTP protegidas con sesión real | Benchmark de carga de Cassandra, InfluxDB o IRIS |
| [Recuperación real H11](../../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion_real.md) | `stop/start redis`, PING nativo y HTTP 200 → 503 → 200; misma API, sesión, entidad y mounts antes/después | Failover automático de un clúster o pérdida cero bajo cualquier falla |
| [Targets H13](../evidencia/prometheus_targets.md) | Estado de scrape, reglas y sondas capturadas de Prometheus | Que TCP abierto implique consulta de negocio o autenticación válida |
| [Dashboard H13](../evidencia/dashboards/resumen_dashboard_observado.md) | UID exactos y todas las expresiones habilitadas consultadas por el datasource de Grafana | Que acceder directamente a Prometheus valide el proxy de Grafana |
| [Falla H13](../evidencia/prueba_de_falla.md) | Caída **real de `redis-exporter`** e inyección **simulada** de indisponibilidad Neo4j en el servidor instrumentado; restauración y alertas | Que se haya detenido Neo4j real, recuperado sus archivos o comprobado sus volúmenes |

Las cifras y los tiempos corresponden a los JSON/Markdown generados por cada runner. Sus metadatos registran fecha, commit y entorno. No se completan campos históricos a mano ni se trasladan métricas de una corrida a otra.

## Mecanismos de observabilidad por motor

| Componente | Mecanismo en H13 | Interpretación |
| :--- | :--- | :--- |
| MongoDB | Driver `ping:1`, operaciones y latencias de aplicación | Disponibilidad de protocolo y trabajo observado del flujo documental |
| Neo4j | Bolt `RETURN 1`, operaciones y latencias de aplicación | Disponibilidad del driver; la falla inyectada se identifica como simulación |
| Redis | PING + exporter nativo + métricas de sesiones/caché | `up{job="redis_exporter"}` prueba scrape del exporter; `redis_up` prueba su conexión con Redis. No son equivalentes |
| Cassandra | Sonda TCP e instrumentación del adaptador | El socket informa alcance del listener; el contexto CQL y la consulta se comprueban por separado en H11 |
| InfluxDB 3 | Sonda TCP e instrumentación del adaptador HTTP/SQL | El socket no acredita token ni consulta; H11 ejecuta el camino real |
| IRIS | Sonda TCP e instrumentación del modelo de objetos | El socket no acredita namespace/clase; H11 comprueba el modelo persistente real |
| API | Lag medido del event loop, métricas HTTP y de proceso | El lag no es latencia de una consulta de base de datos |

## Entorno y límites

La reproducción de esta entrega usa un laboratorio Linux virtualizado. La CPU de la VM no expone AVX/BMI: MongoDB 7 e InfluxDB 3 se ejecutan con emulación de CPU; IRIS 2026.2 se ejecuta con el mismo sistema de archivos de su imagen oficial en una VM QEMU TCG con kernel Linux y CPU virtual compatible. Son motores y datos reales, **no dobles de bases de datos**. Se desactivan la gestión de paquetes de plugins de InfluxDB y el ISCAgent opcional de IRIS, que no forman parte del flujo de consultas del TPO.

`executionNotes` identifica esta condición en los reportes. La emulación y la coexistencia de servicios afectan la latencia: los resultados sirven para este escenario, no para comparar directamente hardware distinto ni declarar capacidad de producción. Los recursos Docker/Node se registran como instantáneas; no son picos de una serie temporal.

El runner H13 inicia los tres motores de su flujo crítico y el stack de monitoreo. No inicia por sí mismo Cassandra, InfluxDB ni IRIS: sus sondas TCP reflejan el estado real del entorno en cada ejecución. El diagnóstico completo H11 requiere los seis activos y no se sustituye por el perfil reducido de H13.

Las ventanas de alertas de 5–30 s facilitan la demostración de laboratorio. Son una decisión operativa para este ensayo, no un SLA validado ni un umbral universal. La topología local es de nodos únicos: replica sets, anillos multi-datacenter, Redis Cluster, réplicas de lectura y el ETL del Data Mart son propuestas de diseño, no despliegues medidos en esta entrega.
