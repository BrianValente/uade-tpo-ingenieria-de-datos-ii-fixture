# Memoria y escalabilidad

**Estado: límite y política pendientes de decisión y configuración.**

El Compose inicial no fija `maxmemory`. El 1 de octubre de 2026 observamos `maxmemory=0` y `maxmemory-policy=noeviction` mediante `CONFIG GET`. Debemos elegir un límite antes de la prueba del módulo. La política observada es el valor inicial del servidor, no una decisión de diseño del grupo. Esta configuración inicial no cumple todavía RF10.

| Alternativa | Beneficio | Costo que debemos evaluar |
| --- | --- | --- |
| `noeviction` con límite | Evita eliminar sesiones por presión de memoria | Las escrituras que requieren memoria pueden fallar; definir respuesta del consumidor |
| `allkeys-lru` o `allkeys-lfu` con límite | Libera espacio para nuevos datos | Puede eliminar sesiones vigentes junto con copias de caché |

Las políticas `volatile-*` no protegen automáticamente las sesiones: estas también tienen TTL. La elección debe explicar el efecto sobre sesiones, caché y actividad temporal.

TTL significa vencimiento por una regla temporal. Evicción significa eliminación por presión de memoria. La prueba debe observar `expired_keys`, `evicted_keys`, `used_memory` y errores de escritura según la política elegida.

Este ambiente tiene un nodo. AOF y snapshots ayudan a recuperar datos locales; no brindan alta disponibilidad. Las réplicas copian datos y pueden quedar atrasadas. Sentinel coordina la recuperación ante fallas en una topología con réplicas. Redis Cluster reparte claves y requiere considerar el slot en operaciones con varias claves.

El diseño distribuido del Hito 3 sigue siendo una propuesta. Este laboratorio no demuestra replicación regional, failover, 99,99 % de disponibilidad ni capacidad para millones de sesiones.

Fuente: [Redis: políticas de memoria](https://redis.io/docs/latest/develop/reference/eviction/).
