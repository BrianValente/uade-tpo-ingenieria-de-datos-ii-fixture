# Defensa técnica final — Fixture Mundial FIFA 2030

## 1. Respuesta a la pregunta central del Hito 13

> ¿Cómo se monitorea, interpreta y defiende técnicamente la arquitectura políglota del Fixture Mundial FIFA 2030, demostrando con evidencia qué se implementó, cómo se comporta el sistema y por qué cada decisión de datos es adecuada?

La versión instrumentada de la API (`scripts/servidor_monitoreo.ts`, puerto 8013) integra los adaptadores del Hito 10 y publica `/metrics`: HTTP por ruta normalizada, operaciones/latencias por motor, caché, renovación de sesiones y recursos Node. Las sondas periódicas distinguen operaciones de protocolo de conectividad TCP; abrir un socket no acredita autenticación ni lectura de datos. La API H10 en 8000 es otro proceso, no el endpoint de métricas de H13.

Prometheus recolecta tres targets cada 5 s y evalúa seis reglas. Redis Exporter aporta métricas nativas Redis; Grafana provisiona [nueve paneles](../grafana/dashboards/fixture2030_observabilidad.json) con dieciséis expresiones habilitadas. El verificador comprueba los UID reales del datasource/dashboard y ejecuta cada expresión mediante el proxy de Grafana, sin sustituir un datasource roto por consultas directas a Prometheus.

La [prueba controlada](../evidencia/prueba_de_falla.md) observa 200 → 503 → 200, detiene realmente Redis Exporter e inyecta una falla **simulada** en el adaptador Neo4j. Las alertas de disponibilidad pasan por FIRING y regresan a INACTIVE. La alerta de tasa 5xx puede seguir activa durante la ventana histórica tras recuperarse la API; los contadores acumulados no vuelven a cero.

La recuperación de **un motor real**, la misma sesión y una entidad persistida se acredita separadamente en el [ciclo Redis del Hito 11](../../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion_real.md). Ese ciclo compara también contenedor y mounts/volúmenes, sin reiniciar la API ni borrar datos. No confundirlo con apagar un exporter o con la inyección Neo4j.

## 2. Trazabilidad de los hitos

| Hito | Implementación y fuente |
| :--- | :--- |
| 1–3 | Diseño políglota, acceso, particionamiento y CAP: [decisiones de arquitectura](decisiones_de_arquitectura.md) y documentación de cada módulo. |
| 4 | MongoDB: esquemas/validadores, carga de selecciones y jugadores, índices y consultas en [documentación](../../docs/Grupo_5_Hito_4_Decisiones_Documentales_Fixture2030.md), `schemas/`, `data/` y `queries/`. |
| 5 | Grafo de equipos, partidos, sedes y eventos: [Neo4j](../../neo4j/README.md), consultas y adaptador del H10. |
| 6 | Comentarios por partido/minuto/grupo, orden y paginación: [Cassandra](../../cassandra/README.md). |
| 7 | Sesiones, caché y rankings: [Redis](../../redis/README.md). |
| 8 | Series temporales, retención y downsampling: [InfluxDB](../../influxdb/README.md). |
| 9 | `Fixture.Partido`, árbitro, técnicos, eventos, invariantes y SQL protegido: [IRIS](../../iris/README.md). |
| 10 | HTTP, Zod/OpenAPI, autenticación/roles y seis adaptadores: [API](../../hito-10-api/README.md). |
| 11 | Nueve listeners, diecinueve chequeos de clientes y doce contratos live HTTP conformes: [diagnóstico real](../../hito-11-conectividad/docs/evidencia/reporte_conectividad_inicial.md); [recuperación Redis](../../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion_real.md). |
| 12 | Cuatro perfiles ejecutados y O2 como política aislada: [comparación O2](../../hito-12-carga-optimizacion/docs/evidencia/comparacion_isolated_o2.md), [paquete conjunto](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md) y [propuesta de Data Mart](../../hito-12-carga-optimizacion/docs/integracion_data_mart.md). |
| 13 | [Métricas](metricas_y_consultas.md), [alertas](alertas_y_umbral.md), [dashboard verificado](../evidencia/dashboards/resumen_dashboard_observado.md), [falla controlada](../evidencia/prueba_de_falla.md) y [guion de defensa](../defensa/guion_de_20_minutos.md). |

## 3. Respuestas a las catorce preguntas del comité

### Pregunta 1: ¿Por qué este sistema necesita más de un modelo de base de datos?

Los patrones son diferentes: documentos de selecciones/planteles, recorridos de relaciones, comentarios ordenados por partición, sesiones/caché, series temporales y objetos con invariantes transaccionales. La persistencia políglota permite ajustar cada modelo al acceso dominante, a cambio de más operación, contratos e integración. SQL podría representar estos datos; no se demostró que fuera físicamente imposible ni exponencialmente peor. La justificación concreta está en el modelo, consultas y trade-offs de cada módulo.

### Pregunta 2: ¿Qué consulta concreta demuestra que Neo4j aporta valor frente a una tabla o documento?

Las [consultas de grafo](../../neo4j/queries/03-consultas-grafo.cypher) recorren `Equipo–DISPUTA–Partido–SE_JUEGA_EN–Sede` y `Evento–OCURRE_EN–Partido` / `Evento–INVOLUCRA–Jugador`. Cypher expresa esos recorridos directamente; en SQL implican joins sobre relaciones y en documentos referencias/lookups o duplicación. Eso acredita adecuación y expresividad, no superioridad medida frente a SQL: no hay benchmark relacional equivalente. La latencia de un recorrido también depende del grado, cantidad de saltos, índices y carga, no es una garantía O(1) de la consulta completa.

### Pregunta 3: ¿Qué pasaría en Cassandra si todos los eventos de un partido popular caen en la misma partición?

Una partición caliente concentra escrituras y crece en tamaño. El modelo de comentarios usa `PRIMARY KEY ((partido_id,bucket_minuto,grupo),creado_en,comentario_id)`: minuto acota la ventana y grupo 0..15 distribuye claves lógicas. No significa dieciséis nodos físicos en este laboratorio de nodo único. La lectura debe consultar los grupos y fusionar sus resultados manteniendo el orden y el cursor; no se usa `ALLOW FILTERING` para sustituir una clave de partición adecuada.

### Pregunta 4: ¿Qué dato vive en Redis y qué ocurre si expira o se pierde?

Las sesiones son hashes con TTL de 1800 s; una sesión ausente exige autenticarse por `POST /auth/login` y una dependencia Redis indisponible no autoriza al usuario: sesiones operan fail-closed. La caché Read-Aside contiene copias reconstruibles desde MongoDB/Neo4j, con TTL de 15 s para eventos, 120 s para partidos y 300 s para equipos/planteles. Un miss reconstruye el valor; la pérdida de caché no elimina la fuente primaria. Que la caché tolere fallos no significa que toda solicitud autenticada pueda continuar con Redis caído: la sesión sigue siendo requisito.

### Pregunta 5: ¿Cómo evitan que InfluxDB crezca indefinidamente con datos de alta frecuencia?

El [Hito 8](../../influxdb/README.md) separa detalle (`estadisticas_equipo`, muestras cada 10 s, retención 7d) y resumen (`estadisticas_minuto`, retención 90d). El resumen exige las seis muestras del minuto y respeta el significado de cada campo: posesión promedio y contadores según sus reglas, no sumas indiscriminadas. Retención y downsampling limitan almacenamiento; no se afirma una capacidad global de ingestión a partir de la muestra local.

### Pregunta 6: ¿Qué ventaja mostró el modelo de objetos o el Data Mart frente al modelo operacional?

IRIS encapsula `Programado → EnJuego → Finalizado`, participantes distintos y eventos permitidos según estado. La integración real verifica persistencia de transiciones/eventos y rechazo de permisos, repeticiones y cambios tras el cierre. La proyección SQL protege las invariantes del objeto mediante triggers. El [Data Mart](../../hito-12-carga-optimizacion/docs/integracion_data_mart.md) es una propuesta de hechos/dimensiones, grano de quince minutos y reglas de transformación; no un ETL desplegado ni una mejora analítica ya medida.

### Pregunta 7: ¿Cómo valida la API los parámetros de entrada y cómo responde cuando una base falla?

Zod valida parámetros, query, cursores y cuerpos. Los contratos incluyen 400 de validación, 404 para ausencia válida y 503 `DEPENDENCY_UNAVAILABLE` para indisponibilidad; un ejemplo de cuerpo real es `{"code":"DEPENDENCY_UNAVAILABLE","message":"Una dependencia no está disponible.","requestId":"..."}`. El request ID correlaciona respuesta y logs sin exponer credenciales. La versión instrumentada H13 registra además operaciones/errores en Prometheus. Los tests de deadlines y ciclo de vida incluyen Redis ausente y un peer que bloquea el handshake; este último es un doble negativo, no integración de datos real.

### Pregunta 8: ¿Qué mejora aplicaron en el Hito 12 y qué métrica demuestra que funcionó?

O1 agrupa pools 5→25, proyección y batching; O2 cambia la política de caché; O3 amortiza la renovación de sesión mediante Lua. La corrida del 6 de noviembre usa código `cd653d6`, 24 VUs, semilla 203012 y ventanas completas de cuatro segundos de rampa más doce de sostenimiento.

- **Base:** 1103.48 ops/s, p95 31.381 ms.
- **Solo O2:** 4028.12 ops/s, p95 9.539 ms: variaciones observadas +265.04 % y −69.60 %. Pools siguen en 5 y no hay throttle; es la comparación de una política solicitada por la devolución docente.
- **Solo O1:** 1274 ops/s, p95 24.791 ms. Es un paquete; no se atribuye el resultado solo al pool ni se afirma que cada motor aceleró.
- **Conjunto O1+O2+O3:** 3965.25 ops/s, p95 9.254 ms, hit ratio 99.94 % y cero renovaciones durante la ventana medida. No superó el caudal de O2 en esta repetición y eso se conserva, no se selecciona otra corrida para ocultarlo.

Todos los payloads de las ventanas fueron verificados sin fallos HTTP ni de integridad. Los [JSON y tablas](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md) conservan contadores, muestras, bytes, ventanas y metadatos. La RAM visible de la VM varió entre corridas: una sola política de código cambia en O2, no se garantiza aislamiento físico absoluto ni capacidad de producción. La emulación y una repetición por perfil limitan la inferencia.

### Pregunta 9: ¿Qué diferencia hay entre una métrica de Prometheus y un log de aplicación?

La métrica agrega valores por etiquetas de baja cardinalidad y permite tasas, cuantiles y alertas. El log describe una operación concreta, con timestamp, request ID y contexto para investigar. No se usan tokens, IDs de usuario ni paths arbitrarios como etiquetas de métricas. El almacenamiento temporal de Prometheus depende también de retención, cardinalidad y frecuencia, no es constante por definición.

### Pregunta 10: ¿Qué muestra el dashboard de Grafana y cómo ayuda a detectar un problema?

Sus nueve paneles muestran salud de targets/componentes; p50/p95/p99 HTTP y p95 por motor; caudal y errores; eficiencia de caché/sesiones; RSS/heap y memoria Redis. Sus dieciséis expresiones se verifican por el datasource real. Se correlacionan señales: `up=1` del exporter no basta, también se comprueba `redis_up=1` y memoria nativa. Si el exporter está caído, la salud nativa Redis es desconocida desde ese origen, no prueba de caída del motor.

### Pregunta 11: ¿Por qué eligieron ese umbral de alerta y qué falso positivo podría producir?

`p95 > 250 ms` durante 30 s es un umbral operativo de advertencia, no un SLO demostrado ni una frontera entre dos resultados de este laboratorio: ambos p95 medidos están por debajo. Busca degradación sostenida con margen sobre el régimen local. Se debe recalibrar contra un SLO y tráfico representativo. Un arranque en frío, GC o competencia de CPU puede producir falsos positivos; `for: 30s` filtra picos breves y el guard de tráfico de la alerta de hit ratio evita evaluar reposo como pérdida de eficacia. Un histograma Prometheus estima cuantiles por buckets: no equivale exactamente a los percentiles de muestras del generador H12.

### Pregunta 12: ¿Qué componentes no fueron monitoreados con métricas nativas y por qué?

Cassandra, InfluxDB e IRIS no tienen exporters dedicados en H13: se publican sondas TCP y se instrumentan sus adaptadores. El alcance de la carga H12/H13 es MongoDB/Neo4j/Redis; no se implementa un exporter por producto para ampliar artificialmente ese alcance. Los seis motores sí están activos en el diagnóstico H11, que acredita protocolo, contexto y operación de datos, incluyendo IRIS mediante SDK oficial. Sonda TCP, consulta nativa y métrica interna son evidencias distintas.

### Pregunta 13: ¿Qué limitaciones tiene el entorno de laboratorio respecto del escenario real 2030?

Hay un único host, datos académicos y 24 usuarios virtuales, sin réplica física multinodo ni tráfico intercontinental. MongoDB/InfluxDB se ejecutan bajo QEMU user-mode y el servidor IRIS en una VM QEMU TCG por falta de AVX físico; el cliente IRIS usa Ubuntu soportado. La memoria visible de la VM no fue fija y las instantáneas no son una serie de utilización continua. El Data Mart y el despliegue multirregión son propuestas. La falla Neo4j de H13 es simulada y la caída del exporter no es caída Redis; el ciclo Redis H11 sí interrumpe un motor real. Ver [límites y evidencia](limitaciones_y_evidencia.md).

### Pregunta 14: Si tuvieran una semana más de trabajo, ¿qué mejora prioritaria implementarían y cómo la medirían?

Priorizaríamos coalescencia de cargas concurrentes de una misma clave (*singleflight*) para el miss inicial. Mediríamos concurrencia sobre una clave dirigida tras invalidarla, cantidad de cargas a la fuente por ventana, p95/p99 y payload idéntico al control. Se compararía una sola política con la misma carga y varias repeticiones. No está implementado ni medido aquí. Una política *stale-if-error* requeriría además límites explícitos de frescura y nunca permitiría reutilizar autorización expirada o presentar estado oficial obsoleto como actual.
