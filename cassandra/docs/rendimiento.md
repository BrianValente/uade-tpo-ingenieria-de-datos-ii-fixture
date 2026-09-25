# Rendimiento y distribución

## Método

`generar_carga.py` crea por defecto 1.000.016 comentarios sintéticos reproducibles. Los distribuye entre:

- 32 partidos académicos, `F2030-001` a `F2030-032`;
- 100.000 usuarios sintéticos;
- 90 minutos desde el instante inicial;
- 16 grupos calculados a partir del UUID del comentario;
- estados `visible` y `pendiente`, con 2 % pendientes.

Cada comentario genera dos filas físicas porque existe una vista por partido y otra por usuario. `carga_o_prueba.sh` carga ambos CSV con `cqlsh COPY`. El reporte registra fecha, versión, contexto Docker, sistema, duración, comentarios por segundo y escrituras físicas por segundo.

El proceso se puede repetir. Los UUID se derivan del índice del comentario mediante UUID v5. Por lo tanto, la misma entrada produce las mismas claves y Cassandra aplica upsert.

## Interpretación

El objetivo de la cátedra es 10.000 o más escrituras por segundo cuando el hardware lo permita. Debemos comparar ese objetivo con la tasa real. No debemos reemplazarla con una estimación.

La medición incluye generación previa de CSV, dos ejecuciones de `COPY`, conversión del cliente y escritura local en un nodo. No representa latencia de red entre datacenters ni tolerancia a fallas. Si no llega al objetivo, debemos registrar CPU, memoria, disco, configuración, cantidad de procesos y el cuello de botella observado.

## Resultado observado

Ejecutamos la prueba el 12 de septiembre de 2026 a las 00:13 UTC en Docker Desktop sobre macOS ARM64. Docker asignó 11 CPU y 8.216.719.360 bytes de memoria. La imagen `cassandra:latest` reportó Cassandra 5.0.9 y el nodo quedó en estado `UN`.

| Medición | Resultado observado |
| --- | ---: |
| Comentarios generados | 1.000.016 |
| Filas físicas importadas | 2.000.032 |
| Filas omitidas por `COPY` | 0 |
| Tabla por partido | 1.000.016 filas en 17,337 s |
| Tasa media informada, tabla por partido | 57.681 filas/s |
| Tabla por usuario | 1.000.016 filas en 16,451 s |
| Tasa media informada, tabla por usuario | 60.788 filas/s |
| Duración conjunta medida por el script | 34 s |
| Tasa conjunta | 29.412 comentarios/s |
| Escrituras físicas conjuntas | 58.824 filas/s |

La prueba superó el objetivo de 10.000 escrituras por segundo en este ambiente. No extrapolamos el resultado a producción. `COPY` ejecutó cuatro procesos locales y escribió contra un solo nodo sin replicación por red.

El dataset produjo 46.080 particiones principales. Cada partición tuvo entre 5 y 44 filas, con un promedio de 21,70. Cada partido recibió 31.250 o 31.251 comentarios. Cada grupo recibió entre 62.160 y 62.875 comentarios. Esta distribución comprueba el generador, pero no reproduce un pico de un millón de comentarios sobre un solo partido.

La salida completa está en [`evidencia/carga-20260912T001314Z.txt`](evidencia/carga-20260912T001314Z.txt).
