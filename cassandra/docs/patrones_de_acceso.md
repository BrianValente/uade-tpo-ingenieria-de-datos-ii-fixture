# Patrones de acceso

## Problema de volumen

El enunciado general plantea más de un millón de comentarios por partido y picos de más de 100.000 solicitudes por segundo para toda la plataforma. Para diseñar este módulo suponemos un pico de 10.000 comentarios por segundo en un partido muy popular. Es un supuesto de diseño. Todavía no es un resultado observado.

Durante un partido esperamos muchas escrituras concurrentes y lecturas repetidas de ventanas breves. No necesitamos joins, búsquedas globales por contenido ni reportes históricos en este hito.

## Consultas prioritarias

| ID | Pregunta | Entrada conocida | Orden y límite | Frecuencia esperada | Tabla |
| --- | --- | --- | --- | --- | --- |
| PA1 | ¿Cuáles son los comentarios recientes de un partido durante un minuto? | Partido, minuto y los 16 grupos | Fecha descendente, hasta 20 por grupo | Muy alta durante el partido | `comentarios_por_partido` |
| PA2 | ¿Qué comentarios llegaron en un rango de segundos de un grupo? | Partido, minuto, grupo, inicio y fin | Fecha descendente, hasta 20 | Alta para actualizar el feed | `comentarios_por_partido` |
| PA3 | ¿Qué comentarios publicó un usuario durante un mes? | Usuario y mes | Fecha descendente, hasta 20 | Media desde el perfil | `comentarios_por_usuario` |
| PA4 | ¿Cómo se modifica o elimina un comentario concreto? | Clave primaria completa de cada vista | Una fila | Baja y controlada | Ambas tablas |

PA1 consulta 16 particiones porque el grupo distribuye el pico de escritura. Cassandra devuelve cada grupo ordenado. Una aplicación futura deberá unir los resultados y conservar los más recientes. No implementamos esa aplicación porque el enunciado excluye la API REST.

## Operaciones no admitidas como acceso frecuente

No usamos `ALLOW FILTERING`. Tampoco buscamos comentarios por texto o por estado en todo el torneo. Esas preguntas necesitarían otra tabla, un índice justificado o una tecnología orientada al análisis.
