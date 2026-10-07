# Hito 8 — Laboratorio guiado de series temporales

Repositorio: https://github.com/BrianValente/uade-tpo-ingenieria-de-datos-ii-fixture

Este laboratorio ayuda a entender InfluxDB 3 Core con datos pequeños y verificables. **Es trabajo en desarrollo; no es la solución completa del Hito 8.** La guía de la materia permite usar IA para entender conceptos y prohíbe generar una solución completa para entregar. El grupo debe completar el análisis, la carga de mayor volumen y el ciclo de vida del dato.

## Decisiones confirmadas para estudiar

- Estadísticas deportivas: posesión, tiros acumulados y pases completados por intervalo.
- Una captura cada diez segundos, con timestamps UTC expresados en segundos.
- Detalle conservado siete días.
- Resúmenes por minuto conservados noventa días.

La muestra tiene doce puntos, seis por equipo, durante un minuto. Cada punto contiene las tres medidas. Los valores son sintéticos y no representan estadísticas reales. El timestamp se desplaza al presente para que la retención no excluya la muestra. El partido y los equipos conservan identificadores del TPO; la fecha de la muestra no es la fecha del fixture de 2030.

## Excepción del entorno pendiente de aprobación docente

El enunciado exige `influxdb:latest`. El 7 de octubre de 2026, esa etiqueta descargó **InfluxDB 2.9.1**, sin el binario `influxdb3`. El comando de la Clase 9 falló con `influxdb3: not found`.

Con autorización de Brian, el laboratorio usa la imagen oficial **`influxdb:3-core`**, que ejecutó Core 3.12.0. Esto permite practicar el SQL de la clase, pero **no cumple la restricción literal de imagen**. Hay que consultar al docente antes de cerrar la entrega. Ver [la evidencia de la diferencia](docs/evidencia/imagen.md).

No sustituir esta imagen por `latest` sobre los datos de Core sin comprobar primero la versión y la compatibilidad. Registrar nuevamente versión y digest si cambia la etiqueta.

## Ejecución

Requisitos: Docker Compose y Python 3.9 o posterior. Los scripts usan la biblioteca estándar de Python. Ejecutar desde la raíz del repositorio:

```bash
make up influxdb
docker compose ps influxdb
docker compose exec -T influxdb influxdb3 --version
python3 influxdb/scripts/inicializacion.py
python3 influxdb/scripts/generacion_muestra.py
python3 influxdb/scripts/carga_muestra.py
python3 influxdb/scripts/consultas_temporales.py
python3 influxdb/scripts/validacion.py
```

La inicialización crea dos bases de laboratorio si faltan. Comprueba la autorización existente y no borra ni reemplaza bases. La validación comprueba que las retenciones existentes sean siete y noventa días.

El token se guarda en `influxdb/.local/admin-token`, con permiso de archivo `600`. La carpeta `.local/` queda excluida de Git. El script captura el token sin imprimirlo y lo pasa al CLI por entrada estándar. Las escrituras y consultas HTTP siguen requiriendo autorización; solo `/health` permite la comprobación del contenedor sin token. El puerto está publicado en `127.0.0.1:8181`.

Si el archivo de token está vacío o no autoriza contra el servidor, detener el proceso y revisar el bootstrap. No generar una autorización nueva ni eliminar el archivo sin comprobar la causa. El primer token del servidor se muestra una sola vez.

### Repetir la carga

```bash
python3 influxdb/scripts/carga_muestra.py
python3 influxdb/scripts/validacion.py
```

Reutilizar el mismo archivo conserva tabla, tags y timestamps. La validación espera doce puntos, aunque se envíe el mismo lote otra vez. No hay reintentos automáticos: un error detiene el script. Esta estrategia es suficiente para la demostración pequeña; el grupo debe diseñar el tratamiento de errores de carga masiva.

El generador se niega a sobrescribir la muestra. Para estudiar otra ventana, mover `muestra.lp` y `manifest.json` a una carpeta local de respaldo antes de generar nuevamente. Para reconstruir un caso con el mismo timestamp:

```bash
python3 influxdb/scripts/generacion_muestra.py --inicio <timestamp_del_manifiesto>
```

Usar un timestamp alineado al minuto y dentro de la retención del detalle. Una muestra de más de siete días debe renovarse para que las consultas puedan recuperarla.

### Reiniciar o detener

```bash
docker compose restart influxdb
docker compose stop influxdb
make up influxdb
```

Los datos persisten en `~/docker/data/influxdb`. No eliminar esa carpeta. El laboratorio no incluye limpieza destructiva.

## Resultados esperados

| Equipo | Puntos | Posesión promedio | Último contador de tiros | Pases del minuto |
| --- | ---: | ---: | ---: | ---: |
| Argentina | 6 | 55 % | 2 | 18 |
| Brasil | 6 | 45 % | 1 | 12 |

La consulta de ventana devuelve seis puntos de Argentina. La comparación y el resumen por minuto devuelven dos filas. Una ventana posterior sin datos devuelve una lista vacía, no valores cero.

`MAX(tiros_acumulados)` coincide con el último valor solo en esta muestra sin correcciones ni reinicios del contador. No significa tiros nuevos del minuto. El grupo debe resolver el cálculo de aumentos y los casos de corrección antes de ampliar el modelo.

## Evidencia y documentación

- [Patrones de acceso](docs/patrones_de_acceso.md).
- [Modelo para estudiar](docs/modelo_multidimensional.md).
- [Cardinalidad y trabajo de escala](docs/cardinalidad_y_escalabilidad.md).
- [Retención y granularidad](docs/retencion_y_granularidad.md).
- [Evidencia local](docs/evidencia/README.md).

Para registrar nuevamente el reporte sin secretos:

```bash
python3 influxdb/scripts/validacion.py --evidencia
```

Revisar los resultados antes de versionarlos. El reporte incluye fecha, versión, digest, recursos de Docker, esquema, retenciones y resultados de consultas. Los tokens y archivos generados no se versionan.

## Trabajo que debe completar el grupo

1. Justificar las necesidades de consulta, la frecuencia y la retención. Identificar fuente y consumidor de cada medida.
2. Implementar un generador de mayor volumen y una carga por lotes con manejo de errores. Explicar cómo llega al objetivo de 10M+ puntos del torneo sin agregar dimensiones artificiales.
3. Medir carga y consulta con el volumen que permita el hardware. Registrar datos realmente procesados y método.
4. Almacenar los resúmenes en la base histórica antes de que expire el detalle. Resolver minutos incompletos, datos tardíos y correcciones del contador.
5. Probar tipos, distribución, expiración y repetición del resumen. Pedir a otro integrante que ejecute el README.
6. Obtener aprobación docente para la imagen o ajustar el entorno a su respuesta.

## Fuentes

- Hito 8, requisitos funcionales, restricciones y entregables.
- Clase 9, modelo de puntos, consultas y agregaciones.
- [Modelo de InfluxDB 3 Core](https://docs.influxdata.com/influxdb3/core/write-data/best-practices/schema-design/).
- [Consultas SQL](https://docs.influxdata.com/influxdb3/core/query-data/sql/).
- [Retención](https://docs.influxdata.com/influxdb3/core/admin/databases/create/).
