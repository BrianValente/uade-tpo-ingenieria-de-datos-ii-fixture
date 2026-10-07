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

## Carga y medición pendientes

La muestra usa un lote de doce puntos, concurrencia uno y ningún reintento automático. La generación, la carga y la validación están en scripts separados. `accept_partial=false` evita dar por válido un lote parcialmente aceptado por errores de formato.

El reporte de la demostración mide con `perf_counter` una escritura HTTP y una consulta. No mide la capacidad del servidor. El tiempo incluye la comunicación con la API y la lectura de la respuesta. No se extrapola a puntos por segundo ni a SLA.

Para la carga de mayor volumen debemos definir tamaño de lote, concurrencia, orden temporal, reintentos, validación de distribución y límites de memoria. Antes de aumentar los datos, describir el experimento y su resultado esperado. No cargar diez millones de puntos sin acordar el volumen de prueba.
