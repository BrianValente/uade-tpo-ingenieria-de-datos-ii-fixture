# Pruebas y evidencia

**Estado: ambiente, reinicio normal y expiración comprobados. Pruebas funcionales pendientes.**

El primer intento no pudo conectar al motor Docker. Después de iniciar Docker Desktop, ejecutamos las comprobaciones el 1 de octubre de 2026, entre 17:45:07 y 17:48:26 UTC, en el contexto `desktop-linux`.

## Ambiente y resultados observados

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

## Método reproducible

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

## Interpretación y limitaciones

La clave conservó su valor y su fecha de vencimiento tras un reinicio normal. Después venció mediante Redis. Esta demostración usa una sola clave de infraestructura; no constituye un modelo de sesión ni una prueba de renovación por actividad. No demuestra recuperación ante caída abrupta, recreación del contenedor, concurrencia ni rendimiento.

## Evidencia funcional pendiente

Para la ejecución funcional debemos guardar:

- Fecha, versión observada de Redis e imagen utilizada.
- Comandos de inicio y estado del servicio.
- Origen, cantidad y distribución de usuarios, sesiones y claves de caché sintéticas.
- Creación, consulta, renovación y cierre de una sesión; TTL antes y después; vencimiento sin recreación.
- Miss, hit, actualización de fuente e invalidación; respuesta ante dato o servidor ausente.
- Clientes concurrentes, operaciones por cliente, total esperado y total observado.
- Métricas antes y después de la prueba; CPU, RAM y recursos de Docker si medimos rendimiento.
- Método, salida verificable y límites del laboratorio.

Los contadores de `INFO stats` corresponden a toda la instancia. No permiten atribuir una tasa de hit al módulo sin aislar la prueba y registrar los deltas apropiados.

Una demostración muestra operaciones. Una prueba automatizada incluye aserciones. Una medición requiere método y resultados observados. No hay mediciones de rendimiento en este avance.
