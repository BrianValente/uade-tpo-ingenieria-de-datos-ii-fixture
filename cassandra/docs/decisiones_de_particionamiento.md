# Decisiones de particionamiento

## Decisión principal

Elegimos una clave de partición compuesta por partido, minuto y grupo:

```text
(partido_id, bucket_minuto, grupo)
```

Mantenemos la decisión del Hito 3 de combinar partido, período y grupo. En este hito fijamos el período en un minuto y la cantidad en 16 grupos.

## Supuestos y estimación

Para un partido muy popular suponemos 10.000 comentarios por segundo durante un minuto. Si el reparto es uniforme:

| Magnitud | Estimación |
| --- | ---: |
| Escrituras del partido por segundo | 10.000 |
| Grupos por minuto | 16 |
| Escrituras por grupo por segundo | 625 |
| Filas por partición después de un minuto | 37.500 |
| Tamaño con 300 bytes útiles por fila | 11,25 MB |

Los 300 bytes por fila son un supuesto simple. No incluyen todo el overhead interno de Cassandra, índices ni compresión. La ejecución local deberá medir tamaños reales antes de usar esta cifra para capacidad.

## Alternativas consideradas

| Alternativa | Ventaja | Problema | Decisión |
| --- | --- | --- | --- |
| Solo `partido_id` | Una lectura simple | Un partido popular concentra toda la escritura y crea una partición sin límite | Descartada |
| Partido y minuto | Limita el crecimiento temporal | Todo el pico del minuto todavía llega a una partición | Descartada para el escenario de pico |
| Partido, minuto y 16 grupos | Reparte la escritura y limita la partición | PA1 necesita 16 lecturas y una unión ordenada | Elegida |
| Partido, minuto y 32 grupos | Reduce más la carga por partición | Duplica el fan-out de lectura | Reservada si las mediciones muestran saturación |
| Partido, cinco minutos y 16 grupos | Reduce cambios de período | Mantiene cada partición caliente más tiempo y puede quintuplicar sus filas | Descartada |

## Riesgos

El hash puede producir una diferencia temporal entre grupos. Debemos revisar la distribución con el dataset generado. Además, un solo nodo físico sigue recibiendo todas las escrituras del laboratorio aunque existan varias particiones lógicas. El reparto entre nodos solo se puede observar en un clúster real, fuera del alcance de este hito.

La lectura de varios minutos multiplica el número de particiones. Por eso el feed operativo usa ventanas breves. Los reportes históricos extensos no pertenecen a esta tabla.
