# Memoria y escalabilidad

## Política elegida

Elegimos `maxmemory 256mb` y `maxmemory-policy noeviction` para el nodo local. Preferimos rechazar escrituras antes que eliminar sesiones vigentes por presión de memoria. La alternativa `allkeys-lru` o `allkeys-lfu` permite liberar espacio, pero puede expulsar sesiones además de copias de caché.

El límite de 256 MiB es un parámetro inicial del laboratorio acordado por el grupo. No estima la capacidad necesaria para millones de usuarios. Debemos revisar uso por clave y cantidad de sesiones antes de aumentar la carga.

| Dato | Vencimiento por TTL | Presión de memoria con noeviction |
| --- | --- | --- |
| Sesión | Ausencia; pedir login | Una creación o renovación puede fallar; devolver error, sin autorizar |
| Caché | Miss; reconstruir desde fuente | Una carga puede fallar; responder desde fuente sin guardar copia |
| Contador/ranking | Se descarta al terminar la hora | Un incremento puede fallar; informar error, no afirmar que se contó |

Las lecturas nativas de datos existentes pueden continuar con presión de memoria. Una request autenticada también necesita renovar, por lo que puede fallar aunque su sesión siga almacenada. Las políticas `volatile-*` no protegerían automáticamente las sesiones: estas también tienen TTL.

TTL y evicción son distintos. TTL determina cuándo un dato deja de ser válido; evicción descarta datos por falta de memoria. Observamos `expired_keys`, `evicted_keys`, `used_memory`, `maxmemory` y errores OOM. Con `noeviction` esperamos cero expulsiones por memoria.

`maxmemory` no es un límite absoluto del consumo total del contenedor. Redis tiene sobrecostos y buffers; un script puede cruzar el umbral durante su ejecución. Dejamos margen entre ese límite y los recursos de Docker. AOF y snapshots también consumen memoria y disco.

## Persistencia local

Usamos AOF con sincronización cada segundo y snapshots `save 60 1`, como en la Clase 8. Montamos `~/docker/data/redis` en `/data`. La prueba inicial conservó valor y vencimiento de una clave tras un reinicio normal. No demuestra recuperación sin pérdida ante una caída abrupta. Una sesión cuyo TTL venció durante la parada no debe recuperar acceso al reiniciar.

## Escala y disponibilidad

Este ambiente usa un nodo: es un punto único de falla y tiene límites de RAM y escritura. No demuestra los objetivos distribuidos del Hito 3.

- **Réplicas:** copian datos y pueden ayudar con lecturas o recuperación; pueden estar atrasadas.
- **Sentinel:** monitorea una topología con réplicas y coordina el cambio de primary ante fallos.
- **Redis Cluster:** reparte claves entre slots. Las operaciones sobre varias claves deben considerar su ubicación.

Como paso futuro, revisaríamos memoria por sesión, distribución de carga y topología según el límite medido. No configuramos esas topologías en este hito. El ranking local no conserva historial ni reemplaza estadísticas en InfluxDB.

Fuente: [Redis: políticas de memoria](https://redis.io/docs/latest/develop/reference/eviction/).
