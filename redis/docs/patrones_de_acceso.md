# Patrones de acceso

## Problema de concurrencia

El escenario académico prevé millones de usuarios simultáneos. Necesitamos consultar sesiones, renovar actividad y responder consultas repetidas sin convertir Redis en la fuente de verdad de las fichas. Las frecuencias de esta tabla son expectativas de diseño, no mediciones de tráfico real.

| Patrón | Solicitante y entrada | Respuesta | Frecuencia esperada | Vida y fuente | Estructura elegida |
| --- | --- | --- | --- | --- | --- |
| Crear sesión | Consumidor del módulo tras login; sesión, usuario y dispositivo | Sesión creada o ID ya existente | Una escritura por login | Estado temporal; 30 min de inactividad | Hash: actualizar atributos sin reemplazar toda la sesión |
| Recuperar sesión | Consumidor con ID de sesión | Atributos válidos o ausencia | Lectura por request que usa sesión | Redis administra el estado temporal | Hash por sesión, sin buscar por usuario |
| Registrar actividad | Consumidor con sesión y request autenticado | Última actividad y TTL renovados | Escritura por request autenticado | 1800 s desde la última actividad válida | Hash y TTL, con secuencia Lua protegida |
| Cerrar o invalidar sesión | Usuario o consumidor; ID de sesión | Esa sesión deja de autorizar | Ocasional, por cierre o invalidación | Eliminación explícita | `DEL` de la clave exacta |
| Consultar ficha de equipo | Visitante; ID estable de equipo, obtenido por su código en la muestra | Ficha copiada o recuperada de fuente | Muchas lecturas; carga solo tras miss | MongoDB es fuente de verdad; copia de hasta 300 s | String JSON: recuperar la ficha de muestra completa con `GET` |
| Cambiar ficha | Escritor de la fuente; equipo y cambio | Fuente actualizada y resultado de invalidación | Menos frecuente que lectura | Fuente simulada en laboratorio; invalidación de copia | `DEL` de la caché exacta |
| Contar consulta | Consumidor; equipo y hora UTC del servidor | Conteo del equipo incrementado | Una escritura por consulta registrada | Ventana fija de una hora | Sorted Set: un score por equipo |
| Recuperar Top N | Consumidor; hora y límite | Equipos más consultados y conteos | Lecturas periódicas, menos que incrementos | Hasta terminar la hora actual | `ZREVRANGE ... WITHSCORES`, sin ordenar todo en Python |

## Decisiones del grupo

Elegimos 30 minutos de inactividad porque suponemos que después de ese período el usuario no volverá pronto. Una request autenticada renueva la sesión. Las consultas públicas no generan renovaciones; así evitamos escrituras por lecturas que no necesitan autenticación. Cada request autenticada sí escribe en Redis.

Permitimos varias sesiones por usuario para computadora y teléfono. Si la sesión vence, el consumidor debe pedir login. Si Redis no responde, devolvemos error y no autorizamos: preferimos rechazar el acceso antes que conceder permisos sin comprobarlos.

Elegimos fichas de equipos porque esperamos consultas repetidas y pocos cambios en comparación con resultados en vivo. El contador y el ranking usan una ventana fija de una hora. Su propósito es mostrar qué equipos concentran las consultas de ese período, no conservar estadísticas históricas.

## Coherencia con el TPO

Conservamos Redis para sesiones según el Hito 3. MongoDB sigue siendo la fuente de verdad de equipos y jugadores. Neo4j conserva partidos, eventos y relaciones; Cassandra conserva comentarios. No modificamos sus modelos.

Los identificadores de equipo se calculan con la misma regla UUID v5 del módulo documental. Los usamos por unicidad y estabilidad. La fuente en memoria es una simulación explícita, no una integración física de motores.
