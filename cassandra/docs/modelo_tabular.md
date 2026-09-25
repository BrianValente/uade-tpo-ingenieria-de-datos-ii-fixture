# Modelo tabular

## Keyspace

`fixture2030_comentarios` usa `SimpleStrategy` con factor de replicación 1. Esta configuración corresponde solo al laboratorio local de un nodo. No demuestra replicación ni alta disponibilidad.

## Comentarios por partido

La tabla principal responde PA1 y PA2.

```text
PRIMARY KEY ((partido_id, bucket_minuto, grupo), creado_en, comentario_id)
```

| Tipo | Columnas | Función |
| --- | --- | --- |
| Clave de partición | `partido_id`, `bucket_minuto`, `grupo` | Ubica juntos los comentarios de un partido, minuto y grupo. Distribuye el pico entre 16 particiones lógicas. |
| Clustering | `creado_en DESC`, `comentario_id ASC` | Ordena del comentario más nuevo al más antiguo. El identificador distingue mensajes creados en el mismo instante. |
| Regulares | `usuario_id`, `usuario_nombre`, `contenido`, `estado`, `likes`, `respuestas` | Contienen autor, contenido, moderación e interacción. |

El bucket se calcula al truncar `creado_en` al inicio del minuto. El grupo se calcula como el resto entre el valor entero del UUID del comentario y 16. Los clientes deben usar la misma regla.

## Comentarios por usuario

La tabla secundaria responde PA3.

```text
PRIMARY KEY ((usuario_id, bucket_mes), creado_en, comentario_id)
```

El mes evita que el historial de un usuario crezca en una sola partición. La tabla repite el contenido necesario para responder sin consultar la tabla principal. Este diseño ocupa más espacio y exige mantener ambas vistas.

Para esta tabla suponemos hasta 100 comentarios diarios por usuario habitual. Un mes de 31 días produce 3.100 filas, cerca de 0,93 MB si usamos la estimación simple de 300 bytes útiles por fila. Las escrituras se distribuyen por `usuario_id`, por lo que usuarios distintos no concentran la misma partición.

Un usuario automatizado podría superar el supuesto. Como escenario excepcional, 10.000 comentarios diarios producirían 310.000 filas y cerca de 93 MB útiles en un mes. El bucket mensual deja de ser conveniente si ese comportamiento se vuelve frecuente. En ese caso deberíamos aplicar límites de publicación o cambiar a un bucket diario. El bucket diario reduce cada partición, pero obliga a consultar hasta 31 particiones para recuperar un mes. El control de publicación corresponde a la futura API y no se implementa en este hito.

## Escritura y coherencia entre vistas

Cada alta escribe una fila en `comentarios_por_partido` y otra en `comentarios_por_usuario`. La muestra y el generador crean ambas filas. No usamos un batch como acelerador porque las filas suelen pertenecer a particiones distintas.

Sin una API, el módulo no puede garantizar una escritura atómica entre las dos tablas. Una falla intermedia puede dejar una vista atrasada. En un hito de integración se deberá definir idempotencia, reintentos y reparación. Los UUID determinísticos de la carga permiten repetirla sin crear otras claves.

## Moderación, TTL y borrado

`estado` puede contener valores como `pendiente` o `visible`. No agregamos una consulta global por estado porque no es uno de los patrones elegidos.

No usamos TTL automático. Conservamos la muestra y evitamos una expiración masiva que genere tombstones. El CRUD incluye una eliminación precisa y documenta que `DELETE` también genera tombstones.
