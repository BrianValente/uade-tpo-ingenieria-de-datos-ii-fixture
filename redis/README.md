# Hito 7 — Caché de usuarios y sesiones

**Grupo 5:** Brian Valente, Tomás Bravo y Julián Curi.

Implementamos sesiones en Redis, caché de fichas de equipos y un contador/ranking de consultas por hora. MongoDB sigue siendo la fuente de verdad de las fichas. Para esta muestra usamos una fuente simulada en memoria; no conectamos ni modificamos MongoDB.

## Inicio

Requisitos: Docker con Compose y Python 3.9 o posterior. Ejecutar desde la raíz del repositorio, con `.env` configurado según el README general:

```bash
docker compose up -d --wait redis
docker compose ps redis
make inspect-redis
python3 -m venv redis/.venv
redis/.venv/bin/python -m pip install -r redis/requirements.txt
```

El servicio usa `redis:latest`, escucha en `127.0.0.1:6379` y monta `~/docker/data/redis` en `/data`. Configuramos AOF, `appendfsync everysec`, snapshots `save 60 1`, `maxmemory 256mb` y `noeviction`. El límite es para el laboratorio, no para millones de usuarios. Si cambia el puerto, usar el mismo `REDIS_PORT` en Compose y en los scripts Python. Estos no leen `.env` automáticamente; se puede ejecutar `REDIS_PORT=6380 redis/.venv/bin/python ...`.

Para abrir el cliente:

```bash
docker compose exec redis redis-cli
```

## Carga y operaciones

```bash
redis/.venv/bin/python redis/scripts/carga_muestra.py
redis/.venv/bin/python redis/scripts/sesiones.py
redis/.venv/bin/python redis/scripts/cache.py
redis/.venv/bin/python redis/scripts/concurrencia.py
make metrics-redis
```

- **Carga:** 10 usuarios sintéticos, 20 sesiones, 4 fichas y un ranking. Todas las claves Redis tienen vencimiento. La carga registra 6 consultas a ARG, 2 a BRA, 1 a ESP y 1 a MAR.
- **Sesiones:** creación, consulta, renovación por request autenticado y cierre de una sesión sin afectar el otro dispositivo.
- **Caché:** miss, hit, actualización de fuente simulada, invalidación y recuperación del dato nuevo.
- **Concurrencia:** 8 clientes con 100 incrementos cada uno, comparación contra 800 y medición del tiempo local. No ejecutar esta medición en los últimos 20 segundos de una hora: el ranking vence al terminarla.
- **Métricas:** `INFO stats`, `INFO memory`, `INFO keyspace` y `DBSIZE`.

Cada demostración genera un namespace nuevo y lo imprime. El contenido y la distribución son reproducibles; las ejecuciones no sobrescriben los datos de otras muestras. Los identificadores de sesión son sintéticos, no tokens reales. La autenticación de credenciales queda fuera de este módulo.

Para inspeccionar un namespace, reemplazar el sufijo por el impreso y continuar con el cursor hasta que vuelva a cero:

```text
SCAN 0 MATCH fixture2030:h7:muestra-SUFIJO:* COUNT 100
```

No usamos `KEYS`, `FLUSHDB` ni `FLUSHALL`.

## Pruebas

```bash
redis/.venv/bin/python redis/scripts/pruebas.py --memoria
```

Para guardar evidencia, elegir un nombre nuevo:

```bash
redis/.venv/bin/python redis/scripts/pruebas.py --memoria \
  --salida redis/docs/evidencia/mi_ejecucion.json
```

Las pruebas tienen aserciones y terminan con error si un control falla. Verifican sesiones, ausencia de recreación tras cierre o vencimiento, hit/miss, invalidación, vencimiento de caché, ranking fijo, concurrencia y respuesta ante Redis inaccesible. Usan TTL de 2 a 4 segundos solo para acelerar las pruebas; no cambian los 1800 y 300 segundos del módulo normal.

`--memoria` crea un contenedor aislado, sin volumen persistente, con 2 MiB de `maxmemory`. Lo llena con datos sintéticos hasta obtener OOM. Luego reduce solo ese límite a 1 MiB para mantener la memoria existente por encima del umbral y comprobar el rechazo de sesiones y la recuperación de fuente para caché. Un OOM aislado no garantiza que siga faltando memoria después de liberar buffers. Retira solo ese contenedor al terminar. La instancia principal conserva sus 256 MiB. El fallo de invalidación se simula explícitamente; el fallo de conexión y la presión de memoria son reales.

## Decisiones

- [Patrones de acceso](docs/patrones_de_acceso.md).
- [Modelo clave/valor](docs/modelo_clave_valor.md).
- [Ciclo de vida e invalidación](docs/ciclo_de_vida_e_invalidacion.md).
- [Memoria y escalabilidad](docs/memoria_y_escalabilidad.md).
- [Pruebas y evidencia](docs/evidencia/README.md).

## Reinicio y detención

```bash
docker compose stop redis
docker compose up -d --wait redis
docker compose restart redis
```

El montaje conserva los archivos entre recreaciones del contenedor. AOF con sincronización cada segundo puede perder escrituras recientes ante una caída abrupta. No sustituye un backup. Un TTL conserva su fecha de vencimiento durante la parada; reiniciar no renueva sesiones.

La limpieza de la muestra ocurre por TTL. Los scripts de cierre e invalidación borran solo claves sintéticas de su propia ejecución. No incluimos una limpieza global ni eliminación del directorio persistente.

## Límites y fuentes

El nodo local no demuestra replicación, Sentinel, Redis Cluster ni capacidad para millones de usuarios. La fuente simulada y su lock permiten probar coherencia dentro de un proceso. No demuestran coherencia entre aplicaciones independientes ni entre Redis y MongoDB. Las mediciones incluyen el cliente Python y la red local.

El PDF específico permite una muestra acotada y no exige los 100.000 usuarios ni las 20 operaciones de la guía general anterior. No solicita API, presentación, video ni ZIP.

- Enunciado: `Hitos/Hito_7_Requisitos_Técnicos_Caché_de_Usuarios_y_Sesiones.pdf`.
- Clase: `Clases/Clase_08.html`.
- [Redis: scripting y atomicidad](https://redis.io/docs/latest/develop/programmability/eval-intro/).
- [Redis: TTL](https://redis.io/docs/latest/commands/expire/).
- [Redis: memoria](https://redis.io/docs/latest/develop/reference/eviction/).
- [Redis: persistencia](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
- [redis-py: scripts Lua](https://redis.readthedocs.io/en/stable/lua_scripting.html).
