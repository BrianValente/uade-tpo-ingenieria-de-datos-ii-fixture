# Módulo de comentarios del Fixture 2030

Este módulo implementa el Hito 6 con Apache Cassandra. Guarda comentarios sintéticos y permite leerlos por partido y por usuario. No incluye una API ni una interfaz web.

## Preparación

Desde la raíz del repositorio:

```bash
cp .env.example .env
make up cassandra
```

Cassandra usa la imagen oficial `cassandra:latest`. El primer inicio puede tardar. Los datos quedan en `~/docker/data/cassandra`, como pide el enunciado.

Comprobar el nodo y abrir `cqlsh`:

```bash
docker compose exec cassandra nodetool status
docker compose exec cassandra cqlsh
```

El estado `UN` significa que el nodo está activo y normal.

## Esquema y muestra

```bash
make load-cassandra
```

El comando crea el keyspace y las tablas, carga tres comentarios con claves fijas y ejecuta controles. Se puede repetir sin duplicar esas filas porque Cassandra aplica upsert sobre la misma clave primaria.

## CRUD y consultas

```bash
./scripts/run-cql.sh cassandra/scripts/02_crud.cql
make queries-cassandra
make verify-cassandra
```

La consulta del feed necesita conocer `partido_id`, `bucket_minuto` y `grupo`. Para recorrer los 16 grupos de un minuto:

```bash
./cassandra/scripts/consultar_feed.sh F2030-DEMO 2030-06-13T20:01:00Z
```

Cada grupo devuelve hasta 20 comentarios en orden descendente. Una aplicación futura deberá unir esas respuestas y aplicar un límite global. Esa integración está fuera del alcance de este hito.

## Carga superior a un millón

La carga completa genera 1.000.016 comentarios y dos filas físicas por comentario:

```bash
make benchmark-cassandra
```

El proceso requiere Python 3.9 o posterior. Crea dos CSV en `cassandra/data/generated/`, los carga con `COPY` y guarda la salida en `cassandra/docs/evidencia/`. Los CSV no se versionan.

Para cambiar la cantidad:

```bash
CANTIDAD=100000 make benchmark-cassandra
```

La tasa informada es una medición local. Incluye la conversión de CSV, el cliente `cqlsh` y la escritura de las dos vistas. No representa un clúster productivo.

Repetir la misma carga hace upsert sobre las mismas claves. Ejecutar luego una carga más pequeña no elimina las filas anteriores. El proceso evita borrados implícitos para no destruir datos del entorno local.

Para reproducir el escenario focalizado de un partido con 10.000 comentarios por segundo durante 100 segundos:

```bash
make benchmark-cassandra-hotspot
```

Esta prueba carga solamente la tabla principal con el partido sintético `F2030-HOT`. Cada prueba conserva una copia fechada de su metadata en `cassandra/docs/evidencia/`.

Para registrar el esquema, la muestra, el CRUD y las consultas en un archivo fechado:

```bash
./cassandra/scripts/registrar_evidencia.sh
```

## Nodo local y producción

El keyspace usa `SimpleStrategy` y factor de replicación 1 porque el laboratorio tiene un solo nodo. Este entorno no ofrece alta disponibilidad ni tolerancia a la pérdida del nodo. El Hito 3 propuso tres copias regionales y consistencia `ONE`; esa topología no se implementa ni se demuestra aquí. En producción se debería evaluar `NetworkTopologyStrategy`, réplicas por datacenter y niveles de consistencia según cada operación.

## Documentación

- [Patrones de acceso](docs/patrones_de_acceso.md)
- [Modelo tabular](docs/modelo_tabular.md)
- [Decisiones de particionamiento](docs/decisiones_de_particionamiento.md)
- [Rendimiento](docs/rendimiento.md)
- [Evidencia](docs/evidencia/README.md)
