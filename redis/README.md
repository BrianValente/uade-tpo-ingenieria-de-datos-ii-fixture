# Hito 7 — Caché de usuarios y sesiones

**Estado: inicio del módulo. El diseño funcional está pendiente.**

Este avance prepara el ambiente y la inspección. Los patrones, TTL, invalidación y política de memoria requieren una decisión del grupo antes de implementar sesiones y caché.

## Ambiente local

Desde la raíz del repositorio, con Docker iniciado y `.env` configurado según el README general:

```bash
docker compose up -d redis
docker compose ps redis
make inspect-redis
docker compose exec redis redis-cli
make metrics-redis
```

El servicio usa `redis:latest`, escucha en `127.0.0.1:6379` y monta `~/docker/data/redis` en `/data`. Se puede cambiar el puerto con `REDIS_PORT`. El montaje conserva los archivos entre recreaciones del contenedor.

Activamos AOF y snapshots como en la Clase 8. `appendfsync everysec` no garantiza conservar cada escritura ante una caída abrupta. Este montaje no sustituye un backup.

Para ejecutar un archivo de comandos:

```bash
bash scripts/run-redis.sh redis/scripts/inicializacion.redis
bash scripts/run-redis.sh redis/scripts/metricas.redis
```

El ejecutor omite comentarios que empiezan con `#` y líneas vacías. Cada línea debe contener un comando completo. `redis-cli -e` informa fallos mediante su código de salida; el ejecutor no ofrece una transacción para todo el archivo.

Para detener, iniciar o reiniciar sin borrar el directorio montado:

```bash
docker compose stop redis
docker compose up -d redis
docker compose restart redis
```

## Diseño y desarrollo pendientes

- [Patrones de acceso](docs/patrones_de_acceso.md): declarar primero las operaciones.
- [Modelo clave/valor](docs/modelo_clave_valor.md): derivar las claves y atributos de esas operaciones.
- [Ciclo de vida e invalidación](docs/ciclo_de_vida_e_invalidacion.md): decidir TTL y coherencia.
- [Memoria y escalabilidad](docs/memoria_y_escalabilidad.md): elegir y configurar el límite y la política.
- [Pruebas y evidencia](docs/evidencia/README.md): registrar solo resultados ejecutados.

Faltan la carga reproducible, los flujos de sesiones y caché, la operación concurrente, el ranking si corresponde y las pruebas funcionales. No se incluyen scripts vacíos que aparenten implementar esos flujos.

El enunciado específico permite una muestra acotada. No exige los 100.000 usuarios ni las 20 operaciones de la versión anterior de la guía general. No solicita API, presentación, video ni ZIP.

## Fuentes

- `Hitos/Hito_7_Requisitos_Técnicos_Caché_de_Usuarios_y_Sesiones.pdf`, apartados 3 a 9.
- `Clases/Clase_08.html`: entorno, persistencia, TTL, Cache-Aside y atomicidad.
- [Redis: persistencia](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
- [Redis: cliente redis-cli](https://redis.io/docs/latest/develop/tools/cli/).
