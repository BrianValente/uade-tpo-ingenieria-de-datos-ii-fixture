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

Con el mismo modelo para 127 partidos, 90 minutos y diez segundos, la cuenta da `127 × 2 × 540 = 137.160` puntos. Esto no alcanza 10M+. El grupo debe explicar qué fuentes y frecuencia adicionales justificarían ese objetivo o analizar la diferencia con el escenario. No se inventaron partidos, tags por punto ni datos para aparentar ese volumen.
