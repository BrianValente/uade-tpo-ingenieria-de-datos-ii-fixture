# Hito 8 — Laboratorio guiado de series temporales

Repositorio: https://github.com/BrianValente/uade-tpo-ingenieria-de-datos-ii-fixture

Este laboratorio ayuda a entender InfluxDB 3 Core con datos verificables. **Es trabajo en desarrollo; no es la solución completa del Hito 8.** La guía permite usar IA para entender conceptos y prohíbe generar una solución completa para entregar. El grupo debe completar su justificación y el análisis del objetivo de 10M+ puntos. Incluye una muestra de doce puntos y el experimento acordado de 34.560 puntos.

## Decisiones confirmadas para estudiar

- Estadísticas deportivas: posesión, tiros acumulados y pases completados por intervalo.
- Una captura cada diez segundos, con timestamps UTC expresados en segundos.
- Detalle conservado siete días.
- Resúmenes por minuto conservados noventa días.
- Guardar un resumen solo cuando llegan las seis lecturas del minuto. Si falta una, esperar y volver a calcular.
- Medir 32 partidos del CSV existente, con 90 minutos por partido.

La muestra tiene doce puntos, seis por equipo, durante un minuto. Cada punto contiene las tres medidas. Los valores son sintéticos y no representan estadísticas reales. El timestamp se desplaza al presente para que la retención no excluya la muestra. El partido y los equipos conservan identificadores del TPO; la fecha de la muestra no es la fecha del fixture de 2030.

## Imagen del entorno

El enunciado exige `influxdb:latest`. El 7 de octubre de 2026, esa etiqueta descargó **InfluxDB 2.9.1**, sin el binario `influxdb3`. El comando de la Clase 9 falló con `influxdb3: not found`.

Brian confirmó que el docente utilizó **`influxdb:3-core`**. Usamos esa imagen para seguir la práctica de clase; ejecutó Core 3.12.0. La confirmación proviene de Brian, no de una grabación revisada en este laboratorio. Conservamos [la evidencia de la diferencia con `latest`](docs/evidencia/imagen.md), pero la imagen ya no es un pendiente del grupo.

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

La inicialización crea cuatro bases si faltan: detalle y resumen de la muestra, y detalle y resumen del experimento. Comprueba la autorización existente y no borra ni reemplaza bases. La validación comprueba que las retenciones existentes sean siete y noventa días. Core permite cinco bases; no crear una nueva por cada ejecución de prueba.

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

## Experimento de 32 partidos

El experimento mantiene los identificadores de `neo4j/import/partidos.csv` y los UUID de equipos. Desplaza una ventana de 90 minutos al presente del laboratorio; no reproduce el calendario oficial ni fechas reales del Mundial.

```bash
python3 influxdb/scripts/generacion_prueba.py
python3 influxdb/scripts/carga_lotes.py --lote 1000 --concurrencia 1 --evidencia
python3 influxdb/scripts/carga_lotes.py --lote 2000 --concurrencia 2 --evidencia
python3 influxdb/scripts/resumenes.py --prueba --evidencia
```

El generador rechaza sobrescribir sus archivos. Para repetir el experimento, reutilizar la misma prueba y omitir la generación. Para crear otra, respaldar primero los archivos de `influxdb/data/generated/prueba/`. Los dos ensayos escriben las mismas identidades con valores idénticos: el segundo es una recarga, no 34.560 puntos nuevos.

La carga verifica 64 series y 540 puntos por serie, con agregados esperados. Cada prueba guarda fecha, versión, recursos, tamaño de lote, concurrencia, reintentos observados, tiempo total y cinco tiempos de consulta. El lote se reintenta como máximo dos veces ante errores de red, timeout, 429 y ciertos errores 5xx. No reintenta errores de autorización o formato. Solo es válido reenviar este conjunto inmutable, sin modificar valores.

El archivo de 34.560 puntos se mantiene en memoria. Este código es un ejercicio de carga local, no un cargador de 10M puntos. Los ensayos tienen condiciones distintas de caché y no permiten atribuir toda diferencia de tiempo al tamaño de lote o a la concurrencia.

### Cómo explicamos el objetivo de 10M+ puntos

El modelo actual produciría 137.160 puntos para 127 partidos de 90 minutos, con dos equipos y una observación cada diez segundos. No alcanza por sí solo el volumen objetivo. Como escenario para evaluar, el seguimiento de 22 jugadores a un punto por segundo produciría 15.087.600 puntos del torneo.

Esa segunda cuenta es una estimación con supuestos, no una funcionalidad implementada ni una prueba de capacidad. El repositorio contiene [la explicación, la cardinalidad estimada y el trabajo necesario para evaluar ese escenario](docs/cardinalidad_y_escalabilidad.md#relación-con-el-objetivo-de-10m-puntos).

## Guardar resúmenes

```bash
python3 influxdb/scripts/resumenes.py --evidencia
python3 influxdb/scripts/resumenes.py --prueba --evidencia
```

El primer comando guarda dos resúmenes de la muestra. El segundo guarda 5.760 resúmenes del experimento. Los comandos son manuales; ejecutarlos antes de que expire el detalle. No se agregó un planificador automático.

Solo se guardan minutos con los seis timestamps esperados. Un minuto con cinco lecturas se informa como incompleto. Cuando llega la sexta, se calcula y escribe. Se compara un hash de las observaciones de origen antes de repetir un resumen: si ya existe y coincide, no se vuelve a escribir.

Core no garantiza qué versión queda si se sobrescribe un punto con valores distintos. Por eso un resumen existente con otra fuente produce un error; no se reemplaza. Esta comprobación no garantiza detectar todas las correcciones conflictivas del detalle, porque su lectura también puede devolver una versión no determinista. El grupo debe definir versionado antes de admitir esas correcciones.

## Pruebas de casos

```bash
python3 influxdb/scripts/pruebas_casos.py
```

Cargar primero la muestra. El script usa un minuto anterior al primer punto de `estadisticas_equipo`; conserva la ventana original de doce puntos. Ejecutarlo de forma secuencial. Verifica hueco, dato tardío, repetición, valores agregados y exclusión de un punto de ocho días bajo retención de siete días. No espera siete días ni mide borrado físico de disco.

Los errores HTTP y una corrección conflictiva se prueban con mocks y se registran como simulaciones. Los huecos, la llegada tardía y el filtro de retención usan la instancia local real. No hay limpieza destructiva automática. Ver [los límites y el ensayo de retención corta](docs/evidencia/avance.md).

## Trabajo que debe completar el grupo

1. Justificar las necesidades de consulta, la frecuencia y la retención. Identificar fuente y consumidor de cada medida.
2. Evaluar y justificar el escenario propuesto para 10M+ puntos y decidir si incorporamos otra fuente de observaciones. La explicación está en el repositorio; el modelo de seguimiento y su carga no están implementados.
3. Definir el tratamiento de correcciones ya resumidas y su versionado. El ejercicio actual espera datos faltantes, pero rechaza cambios detectados en resúmenes existentes.
4. Pedir a otro integrante que ejecute el README y registre su experiencia.

## Fuentes

- Hito 8, requisitos funcionales, restricciones y entregables.
- Clase 9, modelo de puntos, consultas y agregaciones.
- [Modelo de InfluxDB 3 Core](https://docs.influxdata.com/influxdb3/core/write-data/best-practices/schema-design/).
- [Consultas SQL](https://docs.influxdata.com/influxdb3/core/query-data/sql/).
- [Retención](https://docs.influxdata.com/influxdb3/core/admin/databases/create/).
- [Duplicados y sobrescrituras en Core](https://docs.influxdata.com/influxdb3/core/reference/line-protocol/#duplicate-points).
