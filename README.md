# Fixture 2030

Modulo documental del Hito 4 de Ingenieria de Datos II. MongoDB almacena las fichas de 64 equipos y 1.536 jugadores sinteticos.

## Requisitos

- Docker con Docker Compose.
- Al menos 1 GB de espacio libre para la imagen y el volumen.
- MongoDB Compass o `mongosh` son opcionales.

No se necesita instalar Python, Node.js ni MongoDB en la notebook.

## Inicio y carga

1. Crear el archivo local de variables:

   ```bash
   cp .env.example .env
   ```

2. Cambiar `MONGO_ROOT_PASSWORD` en `.env`.

3. Iniciar MongoDB:

   ```bash
   docker compose up -d
   ```

4. Comprobar el estado:

   ```bash
   docker compose ps
   ```

   El servicio esta listo cuando su estado muestra `healthy`.

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

## Reinicio y detencion

Reiniciar el servicio sin perder datos:

```bash
docker compose restart mongodb
```

Detener y retirar el contenedor sin eliminar el volumen:

```bash
docker compose down
```

No usar `docker compose down -v` salvo que se quiera borrar toda la informacion local.

## Estructura

```text
.
|-- compose.yaml
|-- data/
|   `-- load-data.js
|-- docs/
|   |-- Grupo_5_Hito_4_Decisiones_Documentales_Fixture2030.md
|   `-- evidencia.md
|-- init-scripts/
|   `-- 01-create-collections.js
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
