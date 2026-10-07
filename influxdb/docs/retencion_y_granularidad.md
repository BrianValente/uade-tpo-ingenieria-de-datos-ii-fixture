# Retención y granularidad

Decisión confirmada para estudiar: capturar cada diez segundos, conservar detalle siete días y conservar resúmenes por minuto noventa días.

| Representación | Base | Retención | Estado |
| --- | --- | --- | --- |
| Detalle | `fixture2030_h8_lab_detalle` | 7 días | Base creada y muestra cargada |
| Resúmenes por minuto | `fixture2030_h8_lab_resumen` | 90 días | Base creada; tabla y carga de resúmenes pendientes |

`show retention --format json` permite comprobar las políticas configuradas. Eso no demuestra que se haya probado la expiración. El laboratorio no espera siete días ni modifica el reloj del servidor.

`agregacion_minuto.sql` calcula el resumen de la muestra. No lo escribe ni lo programa. Debemos implementar su almacenamiento antes de que expire el detalle. Un resultado calculado durante una consulta no garantiza un histórico de noventa días.

## Semántica que necesitamos conservar

- Posesión: promedio de seis muestras equidistantes y completas. Con huecos, el promedio simple puede dejar de representar todo el minuto.
- Pases: suma de cantidades en intervalos disjuntos.
- Tiros: último contador bajo la condición de no tener correcciones ni reinicios. Para calcular tiros nuevos se requiere una lectura de referencia y una regla explícita de límites.

## Trabajo pendiente

Definir campos del resumen, criterio de minuto completo, tratamiento de datos tardíos, correcciones y forma de repetir la carga sin duplicar resultados. Probar qué preguntas se pierden al pasar de diez segundos a un minuto.

La Clase 9 describe la retención de Core como una decisión que se fija al crear la base. No cambiar ni recrear una base existente para ajustar la política sin revisar primero versión, compatibilidad e impacto en datos.

Fuente: Hito 8, apartado 5.5; Clase 9, retención, ventanas y downsampling; [documentación oficial](https://docs.influxdata.com/influxdb3/core/admin/databases/create/).
