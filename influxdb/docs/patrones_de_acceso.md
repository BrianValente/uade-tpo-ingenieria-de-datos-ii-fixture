# Patrones de acceso para estudiar

Estado: hipótesis de laboratorio. Brian confirmó estadísticas deportivas y la política de detalle corto con histórico. Debemos completar la justificación antes de la entrega.

| Patrón | Pregunta | Ventana | Dimensión | Medida y operación |
| --- | --- | --- | --- | --- |
| PA1 | ¿Cómo cambió la posesión de un equipo? | Un minuto en la muestra; cinco minutos como necesidad a evaluar | Partido y equipo | Puntos de posesión ordenados por tiempo |
| PA2 | ¿Cómo se comparan ambos equipos? | El minuto de la muestra | Partido, agrupado por equipo | Promedio de posesión, total de pases por intervalo y último contador de tiros |
| PA3 | ¿Qué resumen conservamos por minuto? | Minutos completos | Partido y equipo | Agregado por minuto y almacenamiento manual en la base histórica |

La fuente del laboratorio es `generacion_muestra.py`. Un integrante consulta mediante `consultas_temporales.py`. La muestra emite una observación por equipo cada diez segundos y declara precisión de segundos. No hay fuente externa conectada.

Una ventana sin puntos devuelve una lista vacía. Esto no significa cero tiros ni cero posesión. Si un minuto tiene menos de seis lecturas o timestamps fuera de la grilla esperada, se informa como incompleto y no se almacena su resumen. Al repetir el comando después de recibir la lectura faltante, el minuto se completa. No hay detección automática de fuente retrasada ni planificador.

## Preguntas que debemos resolver

- ¿Quién produciría estas medidas en el Fixture y quién las consultaría?
- ¿Por qué diez segundos de captura son suficientes para estas preguntas?
- ¿La posesión representa la ventana reciente o el acumulado del partido? La muestra interpreta cada valor como una observación de la ventana de diez segundos que empieza en su timestamp.
- ¿Cómo vamos a mostrar un dato atrasado y cuánto atraso toleramos?
- ¿Cómo vamos a versionar una corrección de un resumen que ya se guardó? Esperar el dato faltante resuelve minutos todavía incompletos, no cambios posteriores.
- ¿Qué necesidad justifica siete días de detalle y noventa días de resumen?

Fuente: Hito 8, apartados 5.2 y 8; Clase 9, diseño dirigido por consultas.
