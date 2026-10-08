# Avance: carga y resúmenes

Decisiones de Brian: usar la imagen utilizada por el docente, esperar la lectura faltante antes de guardar un minuto y probar los 32 partidos existentes durante 90 minutos.

## Cargas observadas

Ambiente: InfluxDB 3 Core 3.12.0, Docker 29.6.1, ARM64, once CPU y 8.216.719.360 bytes de memoria informados por Docker. Cassandra y Redis también estaban en ejecución. No se midió consumo exclusivo de recursos.

| Ensayo | Puntos enviados y verificados | Lote | Concurrencia | Lotes | Tiempo de carga | Mediana de cinco consultas |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Inserción del experimento | 34.560 | 1.000 | 1 | 35 | 34,4898 s | 12,10 ms |
| Recarga de las mismas identidades | 34.560 | 2.000 | 2 | 18 | 8,9244 s | 13,77 ms |
| Recarga en la validación final | 34.560 | 2.000 | 2 | 18 | 8,9949 s | 13,38 ms |

Fechas UTC: 7 de octubre de 2026, 23:47 y 23:48. Los reportes completos son `carga-20261007T234751Z.json` y `carga-20261007T234828Z.json`. Cada serie conserva 540 puntos; las 64 series suman 34.560. Ambos ensayos verificaron sus agregados y observaron cero reintentos.

La comprobación final se ejecutó el 8 de octubre a las 00:13 UTC. Su carga queda en `carga-20261008T001330Z.json`. También observó cero reintentos y conservó 34.560 puntos. La suite final verificó compilación, Compose, inicialización, muestra original, distribución de la prueba, resúmenes de ambas ventanas y casos; todos dieron `PASS`. El ensayo corto fallido de retención se conserva como limitación, no como parte de los casos exitosos.

Medimos con `perf_counter`, incluida la respuesta HTTP. No sumamos generación ni validación al tiempo de carga. Los cocientes locales fueron aproximadamente 1.002 y 3.873 puntos enviados por segundo. La segunda carga tiene datos y caché previos; cambia también la concurrencia. No atribuimos toda la diferencia a una sola variable ni afirmamos SLA o capacidad para 10M+.

## Resúmenes y casos

`resumenes_prueba.json` registra 5.760 minutos completos y verifica su cobertura, distribución y retenciones. El reporte final de repetición informa que ya existen y que no vuelve a escribirlos. `resumenes_muestra.json` corresponde a los dos minutos de la muestra didáctica.

`casos.json` prueba en la instancia local:

- Cinco lecturas: no se escribe el minuto y se informa como incompleto.
- Llegada de la sexta: se guarda el minuto con posesión 55 %, contador final dos y dieciocho pases.
- Repetición: no se escribe otro resumen.
- Retención de siete días: un punto de ocho días no aparece y un punto reciente sí.

La corrección conflictiva del resumen y los errores 503/401 se simulan con mocks. El 503 provoca un reintento; el 401 no se reintenta. No se presentaron esos errores durante las cargas medidas.

## Límites encontrados y ensayo fallido

Core respondió `Adding a new database would exceed limit of 5 databases` al intentar separar cada caso en una base nueva. Se comprobó que `fixture2030_h8_casos_detalle_20261007T234818` no tenía tablas. Brian autorizó borrar únicamente esa base vacía. No se borró ninguna de las cuatro bases con datos.

Se creó `fixture2030_h8_casos_retencion` con `1m` y se intentó comprobar exclusión tras veinte segundos de espera. El CLI aceptó la configuración, pero la prueba no obtuvo el resultado esperado. No se registra como una prueba exitosa. La [documentación oficial de Core](https://docs.influxdata.com/influxdb3/core/reference/internals/data-retention/) describe una hora como mínimo práctico y no admite minutos o segundos como política recomendada.

La base del ensayo corto queda conservada y no se usa como evidencia de expiración válida. No hay limpieza automática. La prueba reproducible actual usa la política de siete días existente, con puntos ya antiguos; no espera siete días ni demuestra borrado físico.

## Pendientes del grupo

Justificar las fuentes, los patrones de acceso y la política elegida; analizar el volumen de 10M+; decidir versionado de correcciones; pedir a otro integrante que ejecute el README. No se agregó API, dashboard ni un planificador de producción.
