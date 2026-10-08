# Retención y granularidad

Decisión confirmada para estudiar: capturar cada diez segundos, conservar detalle siete días y conservar resúmenes por minuto noventa días.

| Representación | Base | Retención | Estado |
| --- | --- | --- | --- |
| Detalle | `fixture2030_h8_lab_detalle` | 7 días | Base creada y muestra cargada |
| Resúmenes por minuto | `fixture2030_h8_lab_resumen` | 90 días | Dos resúmenes de la muestra almacenados |

`show retention --format json` permite comprobar las políticas configuradas. Además, el caso real escribe un punto de ocho días y otro reciente en una tabla de prueba del detalle: la consulta antigua no devuelve el vencido y la reciente devuelve el vigente. No esperamos siete días ni medimos liberación física del disco.

`agregacion_minuto.sql` calcula un resumen durante la consulta. `resumenes.py` lo calcula a partir de las observaciones y escribe `estadisticas_minuto` en la base histórica. La ejecución es manual y debe hacerse antes de que expire el detalle. El experimento usa `fixture2030_h8_prueba_detalle` (7 días) y `fixture2030_h8_prueba_resumen` (90 días), con 5.760 resúmenes.

## Semántica que necesitamos conservar

- Posesión: promedio de seis muestras equidistantes y completas. Con huecos, el promedio simple puede dejar de representar todo el minuto.
- Pases: suma de cantidades en intervalos disjuntos.
- Tiros: última lectura por tiempo, sin sumar contadores. No representa tiros nuevos del minuto. Para calcular aumentos se requiere una lectura de referencia y reglas para correcciones y reinicios.

## Trabajo pendiente

Brian eligió esperar la lectura faltante: un minuto solo se almacena cuando tiene los seis timestamps esperados. La prueba pasa de cinco a seis lecturas y guarda el resumen correcto. Repetir el comando no escribe otro resumen si su fuente coincide.

Queda pendiente definir versionado de correcciones de observaciones ya resumidas. Core no garantiza la versión retenida en una sobrescritura conflictiva; el script rechaza un cambio detectado por hash. También debemos explicar qué preguntas se pierden al reducir el detalle a un minuto.

La Clase 9 describe la retención de Core como una decisión que se fija al crear la base. No cambiar ni recrear una base existente para ajustar la política sin revisar primero versión, compatibilidad e impacto en datos.

Fuente: Hito 8, apartado 5.5; Clase 9, retención, ventanas y downsampling; [documentación oficial](https://docs.influxdata.com/influxdb3/core/admin/databases/create/).
