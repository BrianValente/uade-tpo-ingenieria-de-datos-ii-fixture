# Cardinalidad y escalabilidad: ejercicios del grupo

## Caso observado

El laboratorio tiene una tabla, un partido y dos equipos participantes. Produce dos combinaciones distintas de tags y doce puntos. Los tres fields no multiplican por tres la cantidad de puntos del modelo de la Clase 9.

No usamos un identificador único por punto como tag. El tiempo ocupa su columna temporal. Posesión, tiros y pases son valores observados, no dimensiones.

## Análisis que debemos completar

1. Contar las combinaciones válidas de partido y equipo del torneo. Explicar por qué no corresponde multiplicar todos los equipos por todos los partidos.
2. Evaluar si agregar sede, fuente o jugador responde a una consulta prioritaria. Estimar las combinaciones realmente posibles.
3. Calcular el volumen con `series × observaciones por serie`. Usar duración y frecuencia explícitas.
4. Comparar ese resultado con 10M+ puntos. Si no alcanza, investigar fuentes o medidas de mayor frecuencia que tengan una necesidad real. No agregar identificadores aleatorios para inflar la carga.

El enunciado específico del Hito 8 fija el objetivo en 10M+ puntos **del torneo**. La guía general y el Hito 2 mencionan puntos por partido. Usamos el enunciado específico como alcance de este trabajo; la diferencia debe quedar explícita en la entrega.

## Primera demostración de doce puntos

La muestra usa un lote de doce puntos, concurrencia uno y ningún reintento automático. La generación, la carga y la validación están en scripts separados. `accept_partial=false` evita dar por válido un lote parcialmente aceptado por errores de formato.

El reporte de la demostración mide con `perf_counter` una escritura HTTP y una consulta. No mide la capacidad del servidor. El tiempo incluye la comunicación con la API y la lectura de la respuesta. No se extrapola a puntos por segundo ni a SLA.

Antes de ampliar la carga por encima del experimento acordado, debemos revisar lotes, concurrencia, distribución, errores y memoria. No cargar diez millones de puntos sin definir primero el experimento y acordar el volumen.

## Experimento acordado y ejecutado

Brian eligió 32 partidos existentes, 90 minutos por partido y captura cada diez segundos. El volumen se deriva de `32 × 2 × 540 = 34.560` puntos. Hay 64 series del detalle y 5.760 puntos resumidos (`32 × 2 × 90`). La tabla de resúmenes también tiene 64 combinaciones de tags.

El generador ordena puntos por partido, equipo y timestamp; no simula múltiples fuentes concurrentes en tiempo real. El cargador prueba lotes de 1.000 con concurrencia uno y de 2.000 con concurrencia dos. Verifica 540 puntos por serie y sus agregados, y registra reintentos. La validación de errores de red y autorización utiliza mocks; en las cargas medidas no se observaron reintentos.

Los resultados se registran en los archivos `carga-*.json`. Los lotes y el archivo se mantienen en memoria; no se afirma que el mismo código cargue 10M puntos con memoria acotada. La segunda carga repite los mismos puntos, con caché y estado previos: no es una comparación controlada.

## Relación con el objetivo de 10M+ puntos

El enunciado fija un objetivo de volumen del torneo. Para explicarlo, distinguimos tres cosas: el volumen ejecutado en el laboratorio, el volumen que produciría nuestro modelo actual y un escenario de mayor frecuencia que todavía debemos evaluar.

### Volumen del modelo implementado

Registramos un punto por equipo cada diez segundos. Cada punto contiene posesión, tiros acumulados y pases por intervalo. Tener tres fields no convierte esa observación en tres puntos.

En un partido de 90 minutos, cada equipo genera `90 × 60 / 10 = 540` puntos. Para los 127 partidos del caso académico:

```text
127 partidos × 2 equipos × 540 observaciones = 137.160 puntos
```

Por lo tanto, **nuestro modelo de estadísticas por equipo no genera por sí solo 10M+ puntos**. La prueba local usa los 32 partidos existentes y procesa 34.560 puntos. Es una validación de ese subconjunto, no una medición del volumen objetivo.

### Escenario propuesto: seguimiento temporal de jugadores

Una fuente de seguimiento podría informar cada segundo la posición y la velocidad de los jugadores activos. Esto permitiría responder preguntas distintas de las estadísticas por equipo: cómo cambió la velocidad de un jugador o qué zonas ocupó durante un intervalo.

Para estimar su volumen, usamos estos **supuestos**, no requisitos del profesor ni datos observados:

- 127 partidos, según el caso académico.
- 90 minutos de observaciones por partido; excluimos entretiempo, tiempo adicional y prórroga de esta cuenta.
- 22 jugadores observados en cada instante.
- Un punto por jugador por segundo.
- Una sola fuente de seguimiento y sin puntos adicionales por reenvíos.

La cuenta es:

```text
90 minutos × 60 segundos = 5.400 segundos por partido
22 jugadores × 5.400 observaciones = 118.800 puntos por partido
127 partidos × 118.800 puntos = 15.087.600 puntos del torneo
```

Si incorporáramos esa fuente junto con las estadísticas por equipo, el volumen estimado sería `15.087.600 + 137.160 = 15.224.760` puntos. Esta estimación explica cómo una necesidad de observación más frecuente puede superar 10M+ sin inventar partidos ni multiplicar puntos por la cantidad de fields.

El seguimiento sería otro conjunto de observaciones. Partido y jugador serían candidatos a tags porque permiten recuperar la evolución de un jugador en un partido. Posición y velocidad serían valores observados. El timestamp identificaría el instante de captura. Antes de incorporar ese modelo, debemos confirmar las consultas, la fuente y la utilidad de medir cada segundo.

En el supuesto simplificado de 22 identidades fijas por partido, habría `127 × 22 = 2.794` combinaciones de partido y jugador. No habría una serie por cada uno de los 15 millones de puntos. Si modelamos sustituciones, debemos contar todos los jugadores distintos observados por partido: esa cantidad de series puede aumentar, aunque sigamos observando 22 jugadores por instante.

### Alcance de la estimación y trabajo necesario

**El seguimiento de jugadores es una propuesta para evaluar. No está implementado, no tiene una fuente conectada y no fue probado en el laboratorio.** No lo presentamos como una decisión ya adoptada ni como evidencia de cumplimiento.

Si elegimos ese escenario, debemos ampliar el trabajo con estos pasos:

1. Justificar las preguntas que necesitan seguimiento y por qué un segundo es suficiente.
2. Reutilizar los identificadores de jugadores y partidos del TPO, y definir tipos, precisión y tratamiento de datos faltantes.
3. Generar un subconjunto reproducible con esa distribución. Si es sintético, declararlo.
4. Generar y cargar por lotes con memoria acotada, en lugar de mantener 15 millones de líneas en memoria.
5. Medir carga y consultas por partido, jugador y ventana. Registrar errores, reintentos y cantidad de identidades realmente almacenadas.
6. Definir resúmenes y conservación según el significado de posición y velocidad; no copiar automáticamente la agregación de posesión o de contadores.

Las mediciones de 34.560 puntos corresponden al modelo implementado. La cuenta de 15.087.600 es una **estimación de volumen**. No demuestra latencia, capacidad del servidor ni tiempo de carga para ese escenario. El README y las evidencias del repositorio deben conservar esa diferencia.

Fuente del objetivo y del alcance local: Hito 8, descripción general y apartados 5.3, 5.4 y 5.5. La frecuencia y la cantidad de jugadores de este ejemplo son supuestos de análisis.
