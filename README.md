# Fixture 2030

Repositorio del TPO de Ingenieria de Datos II para desarrollar la plataforma Fixture 2030.

## Requisitos

- Docker con Docker Compose.
- Espacio libre para las imagenes y los volumenes.
- MongoDB Compass, `mongosh` y Neo4j Desktop son opcionales.

No se necesita instalar Node.js, MongoDB, Neo4j, Cassandra ni Redis en la computadora. La carga masiva del Hito 6 y el modulo del Hito 7 requieren Python 3.9 o posterior. El Hito 7 instala redis-py en su entorno virtual; consultar `redis/README.md`.

## Inicio y carga

1. Crear el archivo local de variables:

   ```bash
   cp .env.example .env
   ```

2. Cambiar `MONGO_ROOT_PASSWORD` y `NEO4J_PASSWORD` en `.env`.

3. Iniciar las bases de datos:

   ```bash
   make up
   ```

   Tambien se puede iniciar una sola base:

   ```bash
   make up mongodb
   make up neo4j
   make up cassandra
   make up redis
   ```

4. Comprobar el estado:

   ```bash
   make status
   ```

   Cada servicio esta listo cuando su estado muestra `healthy`.

5. Configurar las validaciones, cargar los datos y verificar su integridad:

   ```bash
   ./scripts/load-data.sh
   ```

La carga usa UUID v5 determinísticos y operaciones `upsert`. Se puede ejecutar varias veces. Cada ejecucion conserva 64 equipos participantes y 1.536 jugadores asociados sin crear duplicados.

6. Cargar y verificar el modulo Neo4j:

   ```bash
   make load-neo4j
   ```

La carga de Neo4j reutiliza los UUID del modulo documental y agrega una muestra sintetica de partidos, sedes y eventos. Consultar [las instrucciones del Hito 5](neo4j/README.md) para repetir la carga y ejecutar las consultas.

7. Cargar y verificar el modulo Cassandra:

   ```bash
   make load-cassandra
   ```

La carga usa una muestra idempotente. Consultar [las instrucciones del Hito 6](cassandra/README.md) para generar mas de un millon de comentarios y ejecutar la medicion.

## Consultas y operaciones

### Inicio del Hito 7

El módulo Redis administra sesiones con 30 minutos de inactividad, caché de fichas de equipos y ranking de consultas por hora. Consultar [las instrucciones y pruebas del Hito 7](redis/README.md).

```bash
make up redis
make inspect-redis
make metrics-redis
```

Ejecutar cada archivo desde la raiz del repositorio:

```bash
./scripts/run-mongosh.sh queries/00-validate.js
./scripts/run-mongosh.sh queries/01-read.js
./scripts/run-mongosh.sh queries/03-aggregate.js
./scripts/run-mongosh.sh queries/04-performance.js
./scripts/run-mongosh.sh queries/02-insert-update.js
./scripts/run-mongosh.sh queries/05-verify.js
```

- `00-validate.js` comprueba que MongoDB rechaza un jugador con datos criticos invalidos.
- `01-read.js` demuestra identificacion directa, filtrado, proyeccion, ordenamiento y paginacion.
- `02-insert-update.js` inserta y actualiza un equipo y un jugador de demostracion. Estos documentos tienen `participaFixture2030: false` y no alteran los 64 participantes.
- `03-aggregate.js` consolida equipos, jugadores y altura promedio por confederacion.
- `04-performance.js` compara un plan forzado que no usa el indice con el plan que usa el indice compuesto.
- `05-verify.js` comprueba volumen, referencias y cantidad de jugadores por plantel.

## Conexion

### MongoDB

MongoDB escucha solamente en `localhost`. La URI para MongoDB Compass es:

```text
mongodb://admin:<password>@localhost:27017/?authSource=admin
```

Reemplazar `admin`, `<password>` y el puerto si se modificaron en `.env`.

Para abrir `mongosh` dentro del contenedor sin escribir la contraseña en el historial:

```bash
docker compose exec mongodb mongosh \
  --username admin \
  --authenticationDatabase admin \
  --password
```

### Neo4j

Neo4j Browser queda disponible en:

```text
http://localhost:7474
```

La conexion Bolt para aplicaciones y clientes externos es:

```text
neo4j://localhost:7687
```

El usuario es `neo4j`. La contrasena se debe definir con `NEO4J_PASSWORD` en `.env`. Para abrir `cypher-shell` y escribir la contrasena de forma interactiva:

```bash
docker compose exec neo4j cypher-shell \
  --username neo4j
```

Los archivos que se usen con `LOAD CSV` se guardan en `neo4j/import/`.

### Cassandra

Cassandra escucha solamente en `localhost:9042` de forma predeterminada. Para comprobar el nodo y abrir el cliente:

```bash
docker compose exec cassandra nodetool status
docker compose exec cassandra cqlsh
```

Los datos persisten en `~/docker/data/cassandra`.

## Reinicio y detencion

Reiniciar el servicio sin perder datos:

```bash
docker compose restart mongodb
```

Detener y retirar el contenedor sin eliminar el volumen:

```bash
make down
```

Para detener una sola base sin eliminar sus datos:

```bash
make down neo4j
make down mongodb
make down cassandra
```

El target `volumes` equivale a `docker compose down -v`. Elimina de forma permanente los datos de los servicios seleccionados:

```bash
make down neo4j volumes
```

No agregar `volumes` salvo que se quiera borrar la informacion local de la base seleccionada. `make down volumes` elimina los volumenes de todas las bases.

## Estructura

```text
.
|-- Makefile
|-- compose.yaml
|-- data/
|   `-- load-data.js
|-- docs/
|   |-- Grupo_5_Hito_4_Decisiones_Documentales_Fixture2030.md
|   `-- evidencia.md
|-- init-scripts/
|   `-- 01-create-collections.js
|-- lib/
|   `-- uuid.js
|-- neo4j/
|   |-- docs/
|   |-- import/
|   |-- queries/
|   `-- README.md
|-- cassandra/
|   |-- data/
|   |-- docs/
|   |-- scripts/
|   `-- README.md
|-- queries/
|   |-- 00-validate.js
|   |-- 01-read.js
|   |-- 02-insert-update.js
|   |-- 03-aggregate.js
|   |-- 04-performance.js
|   `-- 05-verify.js
|-- schemas/
|   `-- collections.js
`-- scripts/
    |-- load-data.sh
    `-- run-mongosh.sh
```

## Limitaciones

- Los nombres y datos deportivos de los jugadores son sinteticos. No representan personas reales.
- Los 64 equipos forman un conjunto academico para Fixture 2030. No son una lista oficial del Mundial 2030.
- Los partidos, sedes y eventos de Neo4j son una muestra sintetica. No representan el fixture oficial.
- MongoDB no aplica integridad referencial entre colecciones. `05-verify.js` comprueba la relacion despues de cada carga.
- La carga actualiza los documentos canonicos, pero no elimina documentos ajenos al dataset. Esta conducta evita borrar datos agregados por el usuario.
- La prueba de rendimiento usa un volumen academico de 1.536 jugadores. No demuestra el cumplimiento de los objetivos distribuidos del escenario completo.
- Cassandra usa un nodo local. No demuestra replicacion, alta disponibilidad ni distribucion fisica entre nodos.

## Documentacion

- [Decisiones documentales](docs/Grupo_5_Hito_4_Decisiones_Documentales_Fixture2030.md)
- [Evidencia de ejecucion](docs/evidencia.md)
- [Modulo de grafos del Hito 5](neo4j/README.md)
- [Modulo de comentarios del Hito 6](cassandra/README.md)
- [Módulo de sesiones y caché del Hito 7](redis/README.md)
