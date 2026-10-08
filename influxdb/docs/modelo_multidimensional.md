# Modelo del laboratorio

Tabla: `estadisticas_equipo`, dentro de `fixture2030_h8_lab_detalle`. Una observación representa un equipo en un partido durante un intervalo de diez segundos. El timestamp identifica el inicio del intervalo, expresado como tiempo UTC en segundos.

| Elemento | Tipo | Significado | Uso |
| --- | --- | --- | --- |
| `partido_id` | Tag de texto | Identificador del partido en Neo4j | Filtro de PA1, PA2 y PA3 |
| `equipo_id` | Tag de texto | UUID v5 del equipo compartido con MongoDB y Neo4j | Filtro y comparación de PA1, PA2 y PA3 |
| `posesion_pct` | Field flotante | Posesión observada en el intervalo de diez segundos | Promedio con muestras completas y equidistantes |
| `tiros_acumulados` | Field entero | Contador desde el inicio de la muestra | Máximo como último valor solo si no hay correcciones ni reinicios |
| `pases_intervalo` | Field entero | Pases completados durante ese intervalo | Suma de intervalos disjuntos |
| `time` | Timestamp | Inicio de la observación | Ventana semiabierta, orden y agrupación |

Los enteros terminan en `i` en line protocol. `posesion_pct` siempre se escribe como flotante. Una línea contiene un punto con tres fields, no tres puntos.

La identidad del punto incluye tabla, combinación de tags y timestamp. Repetir un punto con los mismos valores conserva el conteo observado. No usamos esa propiedad para sobrescribir valores distintos: la documentación de Core indica que la versión conservada no es determinista.

## Coherencia con el TPO

La muestra usa `F2030-001`, Argentina y Brasil, que corresponden al primer partido de `neo4j/import/partidos.csv`. Calcula los UUID de equipos con el namespace y la clave `equipo:<codigo>` de `lib/uuid.js`. InfluxDB no crea nuevas fichas ni relaciones del torneo.

Los timestamps pertenecen al laboratorio actual, no a la fecha de 2030. El generador desplaza un minuto sintético al presente para que pueda consultarse con retención de siete días. La muestra no representa un partido real ocurrido.

## Ejercicio de modelado pendiente

Comparar el uso de `sede_id` como tag con mantener la sede en el grafo. ¿Qué consulta nueva justificaría repetirla en cada punto? Explicar el costo y el beneficio antes de agregarla.

## Tabla de resúmenes implementada

`estadisticas_minuto` conserva los tags `partido_id` y `equipo_id`. Su timestamp es el inicio UTC del minuto. Los fields son `posesion_promedio` (flotante), `tiros_final` (entero), `pases` (entero), `muestras` (entero) y `source_hash` (texto).

`source_hash` verifica si el resumen corresponde a las mismas observaciones. Es un field, no un tag: no crea una serie por contenido. Se guardan solo minutos con seis timestamps exactos, separados por diez segundos. El contador se toma de la última lectura temporal, no se suma.

La muestra usa dos bases y el experimento otras dos, para no mezclar ventanas y conteos. Es una separación de laboratorio, no una propuesta de crear una base por partido.
