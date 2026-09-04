# Fixture 2030

Repositorio del TPO de Ingenieria de Datos II para desarrollar la plataforma Fixture 2030.

## Requisitos

- Docker con Docker Compose.
- Espacio libre para las imagenes y los volumenes.
- MongoDB Compass, `mongosh` y Neo4j Desktop son opcionales.

No se necesita instalar Python, Node.js, MongoDB ni Neo4j en la computadora.

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
   make mongodb
   make neo4j
   make up neo4j
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

## Consultas y operaciones

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

El usuario es `neo4j`. La contrasena se define con `NEO4J_PASSWORD` en `.env`. Si la variable no existe, el entorno local usa `fixture2030`. Para abrir `cypher-shell` y escribir la contrasena de forma interactiva:

```bash
docker compose exec neo4j cypher-shell \
  --username neo4j
```

Los archivos que se usen con `LOAD CSV` se guardan en `neo4j/import/`.

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
|   `-- import/
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
- MongoDB no aplica integridad referencial entre colecciones. `05-verify.js` comprueba la relacion despues de cada carga.
- La carga actualiza los documentos canonicos, pero no elimina documentos ajenos al dataset. Esta conducta evita borrar datos agregados por el usuario.
- La prueba de rendimiento usa un volumen academico de 1.536 jugadores. No demuestra el cumplimiento de los objetivos distribuidos del escenario completo.

## Documentacion

- [Decisiones documentales](docs/Grupo_5_Hito_4_Decisiones_Documentales_Fixture2030.md)
- [Evidencia de ejecucion](docs/evidencia.md)
