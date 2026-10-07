# Evidencia del laboratorio

Estado: demostración didáctica con datos sintéticos. No es una prueba de capacidad del objetivo de 10M+ puntos.

- `imagen.md`: diferencia observada entre la etiqueta requerida y la versión de Core del material.
- `laboratorio.json`: reporte exportado por `validacion.py --evidencia`, con versión, digest, recursos Docker, tipos, retención y consultas.
- La prueba de repetición y reinicio se describe a continuación.

El token y los archivos locales generados están excluidos de Git. La evidencia no debe incluir el contenido de `influxdb/.local/admin-token`.

## Ejecución observada

Fecha: 7 de octubre de 2026. Python 3.14.3, Docker 29.6.1, arquitectura ARM64. Docker informó once CPU y 8.216.719.360 bytes de memoria total disponible. El equipo anfitrión informó modelo `Mac15,6` y dieciocho GiB de RAM. Estos recursos describen el entorno; no son una medición de recursos consumidos por el lote.

1. La inicialización creó las bases de detalle y resumen y guardó la autorización fuera de los archivos versionados.
2. La primera carga registró doce puntos. Argentina devolvió promedio de posesión 55 %, contador final dos y dieciocho pases; Brasil devolvió 45 %, uno y doce.
3. Se repitió la inicialización. Recuperó la autorización existente y conservó ambas bases.
4. Se repitió exactamente el mismo lote. La consulta siguió devolviendo seis puntos por equipo, doce en total en la ventana.
5. Se ejecutó `docker compose restart influxdb` y se esperó el estado saludable. La validación posterior recuperó los mismos resultados.
6. `validacion.py --evidencia` verificó separación de diez segundos, ventana semiabierta, tipos de columnas, agregados y retenciones. Resultado: `PASS` a las 18:12:11 UTC.
7. Una ventana posterior sin puntos devolvió `[]`. El generador rechazó sobrescribir los archivos de la muestra existente.

Comandos de la comprobación final:

```bash
python3 -m compileall -q influxdb/scripts
docker compose config --quiet
python3 influxdb/scripts/inicializacion.py
python3 influxdb/scripts/carga_muestra.py
docker compose restart influxdb
docker compose up -d --wait --wait-timeout 60 influxdb
python3 influxdb/scripts/validacion.py --evidencia
git diff --check
make -n up influxdb
make -n up mongodb neo4j cassandra redis
```

## Medición limitada

La repetición del lote tomó 0,8133 segundos para una solicitud de escritura HTTP y 0,0095 segundos para una consulta de comprobación. Se midió cada operación una sola vez con `perf_counter`, incluido el intercambio con la API. Se enviaron doce puntos en un lote, con concurrencia uno.

Estos tiempos corresponden a esta demostración. No permiten afirmar capacidad de carga masiva, percentil 95, rendimiento sostenido ni cumplimiento del objetivo de 10M+ puntos.

La retención configurada fue comprobada; la expiración por antigüedad no fue probada. La base histórica está creada, pero todavía no recibe resúmenes.
