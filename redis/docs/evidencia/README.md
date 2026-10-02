# Pruebas y evidencia

**Estado: 12 controles funcionales aprobados, con evidencia de ambiente, concurrencia y memoria.**

## Pruebas funcionales del módulo

Ejecutamos la suite el **2 de octubre de 2026 a las 00:32:48 UTC** (1 de octubre, 21:32:48 en Argentina). El archivo [pruebas_funcionales.json](pruebas_funcionales.json) conserva resultados, configuración y recursos observados. Todos los controles terminaron en `OK`.

```bash
redis/.venv/bin/python redis/scripts/pruebas.py --memoria \
  --salida redis/docs/evidencia/pruebas_funcionales.json
```

Para repetir, usar otro nombre de salida; el ejecutor no sobrescribe evidencia.

| Control | Resultado observado |
| --- | --- |
| Ambiente | Redis 8.10.2, standalone; `maxmemory=268435456`; `noeviction`; AOF activo |
| Carga | 10 usuarios sintéticos; 20 sesiones; 4 copias de caché; 1 ranking; 25 claves, todas con TTL |
| TTL normales | Sesión: 1800 s; caché: 300 s; ranking: 1630 s hasta fin de hora en esa ejecución |
| Lectura y renovación | PTTL bajó de 2892 a 2890 ms sin renovación; request autenticado lo renovó a 3999 ms en la prueba de 4 s |
| Múltiples dispositivos y cierre | Cerrar computadora no cerró teléfono; no se recreó la sesión cerrada; estado bloqueado rechazado |
| Expiración de sesión | Prueba acelerada de 2 s; después `TTL=-2`, sin recreación por actividad |
| Cierre concurrente | 20 repeticiones; 20 renovaciones en competencia con cada cierre; 0 sesiones recreadas |
| Caché | Hit, miss, invalidación y recuperación de versión 2; vencimiento y nueva carga; hit sin renovar TTL |
| Caché concurrente local | Lecturas y cambio dentro del mismo proceso; versión final 2 |
| Invalidación fallida | Fallo simulado explícitamente; copia omitida y respuesta con versión 2 de fuente |
| Redis inaccesible | Conexión real rechazada en un puerto sin servidor; error para sesión y fuente simulada para caché |
| Ranking fijo | Ventana acelerada de 3 s; incremento no extendió su vencimiento; `TTL=-2` al terminar |
| Contador concurrente | 8 clientes por 100 consultas; esperado 800, observado 800 |
| Presión de memoria | Contenedor aislado; OOM; sesión previa conservada; creación y renovación rechazadas; caché respondió desde fuente; 0 evicciones |

## Medición local

La operación medida registra una consulta: obtiene la hora con `TIME` y ejecuta el script de incremento. Usamos 8 hilos de Python, cada uno con 100 operaciones secuenciales. El cliente usa un pool de conexiones y comparte la instancia Redis. No usamos pipeline en esta medición.

- Tiempo total: **0,1697195 s** para 800 incrementos, aproximadamente **4713,66 consultas registradas/s**.
- Memoria global antes/después: 2002872 y 2095712 bytes. Incluye otras claves de laboratorio; no representa memoria por usuario.
- Redis 8.10.2; redis-py 6.4.0; Python 3.14.3; macOS arm64.
- Host: 11 CPU lógicas y 19327352832 bytes de RAM (18 GiB).
- Docker: 11 CPU y 8216719360 bytes de RAM, contexto `desktop-linux`.
- Imagen y digest registrados en el JSON. Se mantuvo `redis:latest` en Compose.

El tiempo incluye Python, hilos, red local, `TIME` y Lua. La muestra es pequeña, no mide percentiles ni representa carga de producción. No demuestra los objetivos de latencia, disponibilidad o volumen del escenario académico.

## Método de memoria

La suite crea un contenedor nuevo sin volumen persistente. Con límite de 2 MiB, carga bloques sintéticos de 1024 bytes hasta OOM: se confirmaron 285 escrituras en la ejecución registrada. Después reduce **solo ese límite aislado** a 1 MiB y comprueba que la memoria existente lo supere. Así mantiene presión sostenida para probar los errores de creación/renovación y la recuperación de fuente en caché.

Un error OOM de una escritura no garantiza que una operación posterior también falle: Redis puede liberar buffers entre comandos. Por eso el método fija el umbral bajo la memoria existente antes de comprobar esas respuestas. La instancia principal conserva su límite de 256 MiB. La suite retira únicamente el contenedor aislado al terminar.

## Evidencia inicial de infraestructura

El primer intento no pudo conectar al motor Docker. Después de iniciar Docker Desktop, ejecutamos las comprobaciones el 1 de octubre de 2026, entre 17:45:07 y 17:48:26 UTC, en el contexto `desktop-linux`.

### Ambiente y resultados observados el 1 de octubre

| Comprobación | Resultado |
| --- | --- |
| Inicio con `docker compose up -d --wait redis` | Servicio `healthy` |
| `make inspect-redis` | `PONG`; Redis 8.10.2; modo `standalone` |
| Sistema reportado por Redis | Linux 6.12.76-linuxkit aarch64; 64 bits |
| Montaje observado con `docker inspect` | Bind de `~/docker/data/redis` a `/data` |
| Persistencia | `appendonly=yes`; `appendfsync=everysec`; `save=60 1` |
| Estado AOF tras el reinicio | `aof_enabled=1`; `aof_last_write_status=ok` |
| Política de memoria observada | `noeviction`; `maxmemory=0` (sin límite explícito de Redis) |
| `make metrics-redis` antes de la prueba | `DBSIZE=0`; `used_memory=1478720` bytes; hits, misses, expiraciones y evicciones en cero |
| Clave de prueba antes del reinicio | `SET` devolvió `OK`; `TTL=120` |
| Clave de prueba después del reinicio normal | Valor `prueba-persistencia`; `TTL=114` |
| Después del vencimiento | `EXISTS=0`; `TTL=-2`; `expired_keys=1`; `evicted_keys=0` |

La imagen declarada fue `redis:latest`. El digest observado fue `redis@sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee`.

### Método reproducible de infraestructura

Ejecutar desde la raíz del repositorio, con Docker iniciado. La clave es sintética y tiene un TTL de 120 segundos. `NX` evita sobrescribir una clave existente. Si `SET` no devuelve `OK`, elegir otro sufijo de prueba antes de continuar.

```bash
docker compose up -d --wait redis
make inspect-redis
make metrics-redis
docker compose exec -T redis redis-cli -e SET fixture2030:lab:infra:20261001T174507Z prueba-persistencia EX 120 NX
docker compose exec -T redis redis-cli -e TTL fixture2030:lab:infra:20261001T174507Z
docker compose restart redis
docker compose up -d --wait redis
docker compose exec -T redis redis-cli -e GET fixture2030:lab:infra:20261001T174507Z
docker compose exec -T redis redis-cli -e TTL fixture2030:lab:infra:20261001T174507Z
sleep 125
docker compose exec -T redis redis-cli -e EXISTS fixture2030:lab:infra:20261001T174507Z
docker compose exec -T redis redis-cli -e TTL fixture2030:lab:infra:20261001T174507Z
docker compose exec -T redis redis-cli -e INFO stats
```

En la ejecución registrada esperamos 115 segundos después de otras comprobaciones del reinicio. El último control se realizó después del vencimiento. Para repetir la demostración, indicamos una espera de 125 segundos después de consultar el valor recuperado.

Guardamos [los extractos de salida observada](2026-10-01-infraestructura.txt). El TTL tras el reinicio depende del tiempo transcurrido; no debe esperarse exactamente 114 en otra ejecución.

### Interpretación de la prueba inicial

La clave conservó su valor y su fecha de vencimiento tras un reinicio normal. Después venció mediante Redis. Esta demostración usa una sola clave de infraestructura; no constituye un modelo de sesión ni una prueba de renovación por actividad. No demuestra recuperación ante caída abrupta, recreación del contenedor, concurrencia ni rendimiento.

## Límites de interpretación

La fuente de equipos es una simulación en memoria. La coherencia concurrente de caché está limitada a un proceso con fuente compartida; no demuestra integración con MongoDB. El fallo de invalidación es simulado, mientras que la falta de conexión y el OOM son reales. Los TTL cortos corresponden solo a las pruebas.

Los contadores de `INFO stats` corresponden a toda la instancia. No permiten atribuir una tasa de hit al módulo sin aislar la prueba y registrar los deltas apropiados.

Los scripts de demostración muestran operaciones. `pruebas.py` incluye aserciones y una medición concurrente local. No se probó failover, durabilidad ante caída abrupta ni comportamiento ante respuestas de escritura perdidas.
