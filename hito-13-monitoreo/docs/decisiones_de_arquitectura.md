# Decisiones de arquitectura políglota — Hito 13

Se responden los diez puntos de cada modelo, los ocho ejes transversales, su relación con métricas y las mejoras fundamentadas. La topología ejecutada es local, sin réplicas físicas multinodo; las distribuciones regionales y el Data Mart son propuestas. Las cifras proceden de los JSON enlazados, no de estimaciones de producción.

## 1. Defensa en diez puntos por modelo

### MongoDB — documental

1. **Datos:** catálogo de selecciones/planteles y cuentas `usuarios_api`, con hashes Argon2id.
2. **Accesos:** equipo por código, jugadores por equipo con orden/paginación, cuentas por username y enriquecimiento del partido con ambos equipos.
3. **Modelo:** documentos BSON con `$jsonSchema`.
4. **Estructura:** `equipos`, `jugadores` y `usuarios_api`; identidades determinísticas, código de equipo único e índices según los filtros. Ver [esquemas](../../schemas/collections.js), [índices/carga](../../data/load-data.js) y [preparación H12](../../hito-12-carga-optimizacion/scripts/preparar_datos.ts).
5. **Carga/recuperación:** upserts idempotentes; `findOne`/`find`. O1 añade proyecciones y batching `$in` en el servidor de carga. El índice H4 por `equipoId` no prueba el plan de una consulta H12 por `equipoCodigo`; son filtros e índices distintos. La consulta Cypher consolidada ya existe en la base, no es otra optimización O1.
6. **Escala:** instancia standalone en el laboratorio. Un replica set regional sería evolución; el catálogo pequeño no requiere por sí solo sharding.
7. **Consistencia/CAP:** se necesitan credenciales y cambios oficiales coherentes. Una propuesta con `w:majority` exige mayoría para escribir; leer de secondaries puede ver retraso. No hay esa réplica desplegada ni una prueba de particiones interregionales.
8. **Falla:** un miss que necesite MongoDB responde 503 si no puede acceder. Caché vigente puede cubrir lecturas de negocio, pero no sustituye requisitos de autenticación.
9. **Trade-off:** datos de equipo referenciados/desnormalizados requieren controles entre colecciones; no hay una FK restrictiva como en un esquema relacional.
10. **Evidencia:** [diagnóstico real H11](../../hito-11-conectividad/docs/evidencia/reporte_conectividad_inicial.md), consultas/planes del módulo y [H12](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md). En O1 Mongo ejecutó 16363 operaciones frente a 31914 de la base, pero cambian también volumen total y batching; no es prueba causal del pool por separado.

### Neo4j — grafo de propiedades

1. **Datos:** equipos, partidos, sedes, eventos y jugadores relacionados.
2. **Accesos:** partido con sede/participantes, eventos/involucrados y recorridos entre selecciones/sedes.
3. **Modelo:** grafo etiquetado con propiedades.
4. **Estructura:** `Equipo`, `Partido`, `Sede`, `Evento`, `Jugador`; `DISPUTA`, `SE_JUEGA_EN`, `OCURRE_EN`, `INVOLUCRA`; [constraints y consultas](../../neo4j/queries/00-estructura.cypher).
5. **Carga/recuperación:** `LOAD CSV`, `MERGE`, consultas parametrizadas Bolt en el [adaptador](../../hito-10-api/src/modules/data/infrastructure/neo4j-graph.repository.ts). El import se monta en `/import:ro` sin permitir que el entrypoint cambie permisos del árbol fuente.
6. **Escala:** un nodo local; consenso de escritura y réplicas de lectura serían una propuesta sujeta a edición/licencia y operación apropiadas.
7. **Consistencia/CAP:** en un clúster con consenso, perder mayoría impide escrituras; una réplica atrasada requiere bookmarks para causalidad. No se midieron esas garantías en el nodo único.
8. **Falla:** H13 inyecta una indisponibilidad **simulada** del adaptador e invalida la caché, observa 503 y recuperación 200. No se detiene el motor Neo4j en esa prueba.
9. **Trade-off:** expresa recorridos sin múltiples joins manuales, con costo de planificación/conexión y complejidad operativa. La adyacencia no hace O(1) cualquier recorrido completo ni demuestra superioridad frente a SQL.
10. **Evidencia:** [consultas del módulo](../../neo4j/queries/03-consultas-grafo.cypher), diagnóstico nativo/HTTP y [falla H13](../evidencia/prueba_de_falla.md). El p95 del driver fue 7.867 ms en base y 7.998 ms en O1: no se afirma que ampliar el pool eliminó una cola ni aceleró este motor. O2 descarga lecturas, efecto distinto de acelerar las consultas restantes.

### Cassandra — particiones anchas

1. **Datos:** comentarios en vivo y consulta por autor/tiempo.
2. **Accesos:** publicar comentario, listar un minuto con cursor y consultar por usuario/mes.
3. **Modelo:** wide-column, orientado a claves de partición y clustering.
4. **Estructura:** [esquema](../../cassandra/scripts/00_esquema.cql): `comentarios_por_partido` con `((partido_id,bucket_minuto,grupo),creado_en,comentario_id)` y `comentarios_por_usuario` por usuario/mes. Grupo 0..15 es partición lógica, no dieciséis servidores físicos.
5. **Carga/recuperación:** sentencias preparadas, LWT `IF NOT EXISTS`, fan-out de grupos y fusión/paginación ordenada en el [adaptador](../../hito-10-api/src/modules/data/infrastructure/cassandra-comment.repository.ts). No se reemplaza el diseño de partición por `ALLOW FILTERING`.
6. **Escala:** nodo único actual; `NetworkTopologyStrategy` con replicación regional es propuesta. El write-sharding evita concentrar todas las claves de un minuto en una partición, no garantiza una distribución física perfecta.
7. **Consistencia/CAP:** `LOCAL_QUORUM` proyectado exige mayoría local y puede rechazar operaciones cuando no la alcanza. LWT tiene costos y semántica adicionales; Cassandra no garantiza disponibilidad de toda operación bajo cualquier partición.
8. **Falla:** el adaptador traduce indisponibilidad a 503 en comentarios; la sonda TCP H13 solo acredita transporte, mientras H11 comprueba keyspace, tabla y SELECT real.
9. **Trade-off:** duplicación por patrón de consulta, fan-out y costo de LWT; la integridad entre tablas requiere disciplina de escritura.
10. **Evidencia:** [módulo H6](../../cassandra/README.md), [diagnóstico H11](../../hito-11-conectividad/docs/evidencia/reporte_conectividad_inicial.md) y tests de escritura/paginación contra el motor. El volumen histórico H6 no convierte la muestra H13 en una prueba de tráfico planetario.

### Redis — clave-valor en memoria

1. **Datos:** sesiones efímeras, caché reconstruible y rankings del H7.
2. **Accesos:** validar/renovar sesión, recuperar respuestas repetidas y actualizar rankings.
3. **Modelo:** HASH, STRING, ZSET y scripts Lua atómicos por ejecución.
4. **Estructura:** `fixture2030:h10:<scope>:sesion:<digest>` con TTL 1800 s; caché H12/H13 por clave con TTL de 15/120/300 s; ver [Redis](../../redis/README.md).
5. **Carga/recuperación:** GET/SET EX, lectura/renovación Lua y throttle de 60 s. La aplicación conserva el token opaco solo para el cliente; el prefijo de sesión usa su digest.
6. **Escala:** nodo único; Redis Cluster con slots y réplicas es propuesta, no implementación de esta entrega.
7. **Consistencia/CAP:** un comando/script es atómico en el nodo, no una transacción distribuida entre motores. Replicación asíncrona y failover pueden perder escrituras; `min-replicas-to-write` reduce riesgos pero no establece consistencia fuerte absoluta.
8. **Falla:** caché puede fallar abierto hacia la fuente, sesiones fallan cerrado con 503. Por eso una ruta autenticada no puede prometer 200 solo porque la capa de caché tolere Redis caído. Las conexiones/sondas H13 se acotan y coordinan con el cierre para no reabrir sockets.
9. **Trade-off:** memoria, frescura limitada por TTL, reconstrucción y eventual pérdida de sesiones. No usar TTL largo sin considerar el significado deportivo del dato.
10. **Evidencia:** [O2 aislada](../../hito-12-carga-optimizacion/docs/evidencia/comparacion_isolated_o2.md) logra 4028.12 ops/s y p95 9.539 ms frente a 1103.48/31.381 de base; el [conjunto](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md) registra hit ratio 99.94 % y 63452 renovaciones omitidas en su ventana, no para siempre. El [ciclo Redis real](../../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion_real.md) conserva sesión, entidad, contenedor y mounts al detener/iniciar Redis.

### InfluxDB 3 Core — series temporales

1. **Datos:** posesión, tiros y pases por partido/equipo/tiempo.
2. **Accesos:** ingesta temporal y agregados por intervalo en `/partidos/:id/estadisticas`.
3. **Modelo:** TSDB con almacenamiento columnar y consultas SQL.
4. **Estructura:** `fixture2030_h8_lab_detalle.estadisticas_equipo` y `fixture2030_h8_lab_resumen.estadisticas_minuto`; [modelo H8](../../influxdb/README.md).
5. **Carga/recuperación:** lotes Line Protocol y consultas HTTP SQL parametrizadas; el resumen exige minuto completo y aplica reglas diferentes a promedios y contadores.
6. **Escala:** retención 7d para detalle/90d para resumen y downsampling. Una proyección de sensores a gran volumen no acredita ingestión distribuida real del laboratorio.
7. **Consistencia:** la aplicación debe fijar cortes temporales y tratar muestras incompletas; un agregado temporal no tiene las mismas garantías que una transacción de objetos IRIS.
8. **Falla:** timeout/indisponibilidad produce 503 en estadísticas. H13 supervisa TCP; H11 separa health, autorización/base y consulta de datos.
9. **Trade-off:** agregación/compresión temporal a cambio de no usarlo como catálogo relacional general o transacciones de todo el torneo.
10. **Evidencia:** [H8](../../influxdb/docs/), diagnóstico y consulta HTTP reales. La validación actual usa el motor oficial bajo emulación, con gestión opcional de paquetes de plugins deshabilitada; no es certificación de capacidad nativa de CPU.

### InterSystems IRIS — objetos persistentes y multimodelo

1. **Datos:** agregado oficial de partido, árbitro, técnicos y eventos con reglas de negocio.
2. **Accesos:** detalle, transición de estado y registro de eventos; SQL de lectura para análisis.
3. **Modelo:** objetos persistentes con proyección SQL; el Data Mart Kimball es una propuesta separada.
4. **Estructura:** namespace USER, clases `Fixture.Partido`, `Persona`, `Arbitro`, `Tecnico`, `Evento`; [fuentes](../../iris/src/), relación padre/hijos y triggers de protección SQL.
5. **Carga/recuperación:** ObjectScript y SDK Node oficial por SuperServer1972; `%Prepare/%Execute/%Next`, apertura de objetos y métodos del dominio. `%Status` exitoso puede ser `1n`; SQLCODE se comprueba aparte. El código de demostración es configurable según la entidad realmente persistida.
6. **Escala:** servidor único en el laboratorio. Separar carga analítica sería evolución; no hay pipeline ETL ni clúster multirregión desplegado.
7. **Consistencia:** transiciones oficiales e invariantes requieren atomicidad transaccional del motor; no se promete ACID entre IRIS, MongoDB y Neo4j.
8. **Falla:** el adaptador devuelve 503 y cierra la conexión; portal200 no acredita SuperServer ni acceso al namespace. La sonda TCP H13 no sustituye la prueba de objeto.
9. **Trade-off:** reglas encapsuladas y SQL del mismo agregado a cambio de dependencia del runtime/SDK y compatibilidad de plataforma. El cliente se verificó en Ubuntu24.04/Node24.13 sin modificar el SDK, servidor IRIS2026.2 en VM QEMU TCG.
10. **Evidencia:** [H9](../../iris/README.md), diagnóstico H11 y suite de integración real: persistencia de transiciones/eventos, rechazo por rol, repetición y cambios tras el cierre. El Data Mart de [H12](../../hito-12-carga-optimizacion/docs/integracion_data_mart.md) tiene DDL/grano/reglas propuestas, no rendimiento analítico medido.

## 2. Ocho ejes transversales

1. **Una estructura única:** SQL podría modelar los datos. Elegimos modelos por acceso y dominio; no demostramos una imposibilidad física ni degradación exponencial de un motor único. El costo políglota es operar e integrar seis sistemas.
2. **Relación entre módulos:** códigos/UUID canónicos y puertos/adaptadores en Fastify; el partido combina grafo y catálogo, con caché en la versión optimizada.
3. **Operacional/analítico:** OLTP atiende rutas y mutaciones; el Data Mart propuesto separa hechos/dimensiones por grano de quince minutos. Se explicita cómo convertir minuto deportivo y timestamp UTC, sin sumar medidas repetidas por equipo como si fueran aditivas.
4. **Caché/frescura:** TTL acota la obsolescencia, no la elimina. No se presupone invalidación distribuida automática. `invalidateMatchCache` existe para la prueba controlada; una política futura debe definir coherencia tras cada escritura.
5. **Consultas acotadas:** validación/límites, paginación, claves de partición, ventanas temporales y deadlines de adaptadores. `requestTimeout` de Fastify no es por sí solo un deadline de toda la operación. El Data Mart todavía no descarga físicamente consultas de producción.
6. **Escala con muestra pequeña:** PRNG determinístico y consultas reales permiten comparar perfiles y detectar errores locales; no prueban tráfico real 2030 ni complejidad universal constante. Emulación, colocalización, una repetición y memoria visible variable limitan los resultados.
7. **Interpretar métricas:** correlacionar HTTP, motor, caché y disponibilidad. Target UP, protocolo saludable y dato accesible son capas distintas. Los cuantiles de histograma Prometheus son estimaciones, no los mismos percentiles exactos de H12.
8. **Respuesta a incidentes:** comprobar sesión, datasource/target, protocolo y datos; recuperar el componente propio sin borrar volúmenes y confirmar lectura. No alargar TTL o servir stale sin una política explícita de frescura/seguridad.

## 3. Métricas y objetivos globales (RF11)

| Objetivo | Evidencia y lectura |
| :--- | :--- |
| Concurrencia | H12 usa 24 VUs en bucle cerrado; no es número ilimitado de conexiones ni usuarios de producción. |
| Throughput | O2: 1103.48→4028.12 ops/s; conjunto: 3965.25 ops/s. Comparar ventanas completas y no atribuir el conjunto a una sola política. |
| Latencia | p95 E2E base31.381 ms, O2 9.539 ms, conjunto9.254 ms; [tablas](../../hito-12-carga-optimizacion/docs/evidencia/tablas_o_graficos.md). |
| Disponibilidad | H13: tres targets antes/después, dos durante la caída real del exporter; sonda Neo4j marcada caída por inyección simulada. Scrape5s no garantiza detectar y alertar cualquier falla en5s: intervienen evaluación y `for`. |
| Distribución de carga | Caché/sesiones tienen contadores propios; hit ratio99.94 % del conjunto. No significa que el99.94 % de todo tipo de tráfico no toque ninguna base. |
| Recuperación | [H13](../evidencia/prueba_de_falla.md) recupera target y simulación; [H11](../../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion_real.md) acredita stop/start Redis con la misma sesión/entidad y mounts conservados. |

## 4. Mejoras transversales (RF12)

1. **Implementada: O2 y O3.** O2 tiene comparación de una política, pools5 sin throttle. El conjunto reduce renovaciones en la ventana60s, pero no supera el caudal O2 en esta repetición. Conservar ese resultado evita atribución selectiva.
2. **Propuesta: singleflight.** Las expiraciones permiten misses concurrentes; medir cargas a la fuente por clave, p95/p99 y payload idéntico frente al control con varias repeticiones. No se afirma una causa de cold-start deducida de una sola captura.
3. **Propuesta: stale acotado.** La prueba simulada de Neo4j produce503 al invalidar caché. Servir una copia anterior exigiría edad máxima, señal de degradación y clasificación de datos permitidos; nunca reutilizar autorización expirada ni ocultar estado oficial desactualizado.
4. **Propuesta: ampliar telemetría nativa.** El inventario distingue sondas TCP de métricas internas. Evaluar exporters soportados por versión/edición y su costo antes de agregarlos; no inventar endpoints disponibles ni presentar la propuesta como desplegada.
