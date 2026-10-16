# Hito 10 — API integrada del Fixture 2030

Esta etapa integra los modelos ejecutables de MongoDB, Redis, Neo4j, Cassandra,
InfluxDB 3 Core e InterSystems IRIS. La guía de la materia permite usar IA para
aprender y revisar trabajo, pero prohíbe generar una solución completa para entregar.

## Decisiones del equipo

Elegimos Node.js, TypeScript y Fastify por nuestra experiencia con estas
herramientas en el TPO de baloncesto. Reutilizamos el criterio de separar la
creación del servidor de su inicio y generar OpenAPI desde esquemas Zod.

El enunciado específico del Hito 10 no fija lenguaje. Las clases 11 y 12 muestran
varios lenguajes. La guía general, página 12, indica Python con un framework REST.
Nuestra elección de Node.js debe comunicarse al docente; no consta una
autorización explícita en el material revisado.

El alcance acordado incluye usuarios de laboratorio con hashes Argon2id,
sesiones Redis, lecturas de los seis motores, escrituras de comentarios y objetos,
y una ficha de partido que combina Neo4j con MongoDB. Consultar
[los casos de uso y su estado](docs/casos_de_uso.md).

## Implementado

- Servidor Fastify con TypeScript y validación Zod.
- `GET /health`: estado del proceso HTTP, sin consultas a bases.
- Swagger UI en `/docs/`, contrato JSON en `/docs/json` y YAML en `/docs/yaml`.
- Configuración HTTP validada y archivo de ejemplo sin secretos.
- Formato común de error y UUID propio en el header `x-request-id`.
- Logs con método, plantilla de ruta, request ID, estado y duración.
- Pruebas unitarias HTTP sin puertos, con `Fastify.inject()` y Vitest.
- CI para ESLint, Prettier, tipos, pruebas, compilación y vigencia del contrato.
- Login con cuentas MongoDB y verificación Argon2id, basado en el flujo de baloncesto.
- Seed repetible de dos cuentas con roles `user` y `admin`.
- Sesiones Redis con token opaco, consulta y cierre de sesión.
- Renovación de sesiones por actividad en rutas de negocio.
- Consultas de equipos y jugadores en MongoDB.
- Ficha de partido compuesta con Neo4j y MongoDB, sin respuesta parcial.
- Eventos de partido consultados con Cypher parametrizado.
- Lectura y escritura repetible de comentarios en las dos vistas Cassandra.
- Resúmenes acotados de estadísticas mediante SQL parametrizado de InfluxDB.
- Lectura y escrituras mediante el modelo de objetos de IRIS.
- Permiso `admin` para cambios de estado y eventos de IRIS.

Los adaptadores de autenticación están implementados y tienen pruebas unitarias.
La integración de autenticación se ejecutó contra MongoDB y Redis reales;
consultar [la evidencia](docs/evidencia/integracion-autenticacion.md).
Consultar [autenticación y seed](docs/autenticacion.md) y
[contratos de integración](docs/integracion.md).
Las [correcciones verificadas](docs/evidencia/correcciones-integracion.md) incluyen
escrituras reales, competencia por claves y pruebas de permisos y repetición.

## Requisitos e instalación

- Node.js 24 LTS, indicado en `.nvmrc`. También admitimos Node.js 26 para trabajo local.
- pnpm 10.34.7, indicado en `packageManager`.

Los comandos `nvm install` y `nvm use` del ejemplo corresponden a nvm de macOS/Linux.
En Windows se puede instalar Node.js 24 directamente o usar `nvm install 24` y
`nvm use 24` de nvm-windows; después se ejecutan los mismos scripts de pnpm.

En un clon nuevo, **primero preparar el `.env` de Compose en la raíz** a partir
del `.env.example` raíz y configurar sus credenciales según el README general.
No sobrescribir un `.env` existente ni cambiar credenciales de volúmenes ya
inicializados. Después iniciar y cargar los motores con los procedimientos de
sus hitos. `pnpm env:local` no crea el `.env` raíz ni inventa sus contraseñas:
si falta, termina con una indicación explícita y no crea archivos.

Ejecutar desde la raíz del repositorio:

```bash
cd hito-10-api
nvm install
nvm use
npm install --global pnpm@10.34.7
pnpm install --frozen-lockfile
pnpm env:local
```

Si pnpm ya está instalado en la versión indicada, omitir su instalación global.
Revisar `.env` antes de iniciar. Este archivo está excluido de Git.
Configurar las credenciales de MongoDB que usa Compose y las contraseñas de seed
según [la guía de autenticación](docs/autenticacion.md).
`pnpm env:local` copia la conexión del entorno raíz y genera contraseñas de seed
aleatorias. Conserva cualquier `.env` existente sin modificarlo. El `.env.example`
también documenta los valores que pueden configurarse manualmente.

La API y el workflow usan LF mediante `.gitattributes`, incluso con
`core.autocrlf=true` en Windows. Prettier también declara `endOfLine: lf`.
Si un clon anterior conserva CRLF, `pnpm format:write` normaliza los archivos
de la API. El chequeo del contrato compara el contenido con CRLF normalizado,
sin ignorar cambios de rutas, esquemas u otros espacios.
Las comprobaciones de checkout, CRLF y setup están registradas en
[portabilidad](docs/evidencia/portabilidad.md), con su límite de no haber usado
Windows nativo.

## Iniciar y detener

Desde `hito-10-api/`:

```bash
pnpm dev:lab
```

Por defecto, la API escucha en `http://127.0.0.1:8000`. Abrir
`http://127.0.0.1:8000/docs/` para explorar el contrato.
El modo de laboratorio usa los seis servicios de Compose. Completa la conexión
Neo4j desde el `.env` raíz y el token InfluxDB desde su archivo local. Si falta
una cuenta IRIS, prepara una temporal y la elimina al cerrar. No hace falta crear
una cuenta manualmente ni cambiar la contraseña de `_SYSTEM`. Consultar los
[detalles del acceso local](docs/integracion.md).

`pnpm dev` conserva el inicio directo con recarga automática y requiere todas las
credenciales configuradas por entorno, igual que `pnpm start`.

Para ejecutar el código compilado:

```bash
pnpm build
pnpm start
```

Detener con `Ctrl+C`. El proceso atiende `SIGINT` y `SIGTERM` mediante
`app.close()`. El modo de laboratorio también elimina su cuenta temporal IRIS.
No inicia ni reinicia servicios y conserva los datos de negocio.
Esta etapa se ejecuta desde la notebook. `/health` y Swagger funcionan sin bases;
Cada ruta consulta las dependencias que indica su etiqueta en Swagger.

## Configuración

| Variable                 | Valor predeterminado | Significado                                  |
| ------------------------ | -------------------- | -------------------------------------------- |
| `API_HOST`               | `127.0.0.1`          | IP de escucha o `localhost`.                 |
| `API_PORT`               | `8000`               | Puerto entre 1 y 65535.                      |
| `API_LOG_LEVEL`          | `info`               | `silent`, `error`, `warn`, `info` o `debug`. |
| `API_REQUEST_TIMEOUT_MS` | `10000`              | Límite para recibir la solicitud completa.   |
| `API_BODY_LIMIT_BYTES`   | `16384`              | Tamaño máximo del cuerpo recibido.           |

El límite HTTP de recepción **no es un timeout de consultas ni del handler**.
Los adaptadores usan `DEPENDENCY_TIMEOUT_MS=2000` para conexión y operación.

El inicio directo lee el `.env` de esta carpeta. Los lanzadores de laboratorio
completan conexiones faltantes desde los archivos locales existentes y pasan las
credenciales al proceso por entorno. Las variables de cada motor están en
`.env.example`. Los valores predeterminados apuntan a los puertos publicados en
la notebook; los secretos no se versionan.

## Probar las rutas publicadas

Desde otra terminal:

```bash
curl --include http://127.0.0.1:8000/health
curl --include 'http://127.0.0.1:8000/health?extra=1'
curl --include http://127.0.0.1:8000/no-existe
curl --fail http://127.0.0.1:8000/docs/json
```

Los resultados esperados son `200`, `400`, `404` y `200`, respectivamente.
Estos ejemplos no demuestran acceso a ningún motor NoSQL.

## Errores y logs

Las respuestas controladas de error usan esta estructura:

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "El recurso no existe.",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

El ejemplo de UUID es ilustrativo. Cada solicitud recibe un UUID generado por la
API, que aparece tanto en el cuerpo de error como en `x-request-id`. No aceptamos
el identificador enviado por el consumidor como identificador interno.

La base traduce validación a `400`, ausencia a `404`, cuerpo excesivo a `413`,
tipo de contenido no admitido a `415` y error inesperado a `500`. Los módulos
pueden usar `ApiError` para señalar `401`, `403`, `409` y `503`. Las rutas usan
`403` para rol insuficiente, `409` para reglas de IRIS y `503` para dependencias.

Los logs usan la plantilla de ruta, no la URL con parámetros. No incluyen
headers, cookies, cuerpos, contraseñas, hashes ni mensajes sin filtrar de drivers.
El campo `reqId` identifica la solicitud. Los adaptadores deberán agregar el
nombre de dependencia y el resultado de su operación con ese mismo identificador.

## Pruebas y controles de calidad

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm test:unit
pnpm build
pnpm openapi:check
```

`pnpm validate` ejecuta todos esos controles en ese orden. Para corregir formato,
usar `pnpm format:write` y revisar el diff. Consultar [el alcance de las
pruebas](tests/README.md), incluidas las simulaciones de error.

Con los seis motores saludables y `.env` local preparado, ejecutar
`pnpm test:integration`. El lanzador completa los accesos locales, conserva las
cuentas de seed y prepara una cuenta temporal IRIS si hace falta. `pnpm test:writes`
ejecuta solo las escrituras Cassandra e IRIS. Las pruebas usan datos nuevos
`F2030-TEST-*` y los conservan para inspección. Solo se cierran las sesiones propias
y la cuenta temporal. No se ejecutan en CI unitaria. Ver
[configuración y garantías](docs/integracion.md) y [el alcance de las pruebas](tests/README.md).

Después de cambiar una ruta o esquema, regenerar y versionar el contrato:

```bash
pnpm openapi:export
pnpm openapi:check
```

El YAML generado queda en `openapi/openapi.yaml`. Prettier lo excluye porque lo
formatea el generador; CI comprueba su contenido exacto contra el servidor.

Los ejemplos de parámetros, cuerpos y respuestas se declaran mediante metadatos
Zod y aparecen en Swagger UI. Son ilustrativos: el password y token de ejemplo
no sirven para autenticarse. Para ejecutar una escritura IRIS se necesita además
un objeto en un estado compatible con la operación.

## Rendimiento básico

Con la API iniciada mediante `pnpm dev:lab`, ejecutar en otra terminal:

```bash
pnpm --silent measure:latency
```

El script hace lecturas HTTP secuenciales y registra media, p95, muestras, volumen
y entorno sin imprimir credenciales. La [corrida de referencia](docs/evidencia/rendimiento-basico.md)
incluye las [muestras y resultados JSON](docs/evidencia/latencia-local.json).
Es una medición local pequeña con calentamiento; no demuestra capacidad bajo carga.
Los códigos de los datos y parámetros configurables están documentados en esa evidencia.

El workflow `Hito 10 - Calidad de la API` corre en PRs que cambien esta carpeta,
el propio workflow o `.gitignore`; también corre en `main` y permite ejecución
manual. Cada control tiene un job separado. Usa Node.js 24, el lockfile de pnpm y
permisos de lectura. No requiere secretos ni bases de datos.

## Organización

```text
src/
  index.ts                 # entorno, escucha y señales de cierre
  config/                  # configuración HTTP y de dependencias
  app/
    server.ts              # composición del servidor
    errors/                # errores públicos y traducción HTTP
    plugins/openapi.ts     # OpenAPI y Swagger UI
    schemas.ts             # esquema de error
  modules/data/            # rutas, servicio, puertos y cinco adaptadores
scripts/export-openapi.ts
openapi/
tests/unit/
docs/casos_de_uso.md
```

Las rutas validan entradas. El servicio compone casos de uso. Los drivers y las
consultas quedan dentro de los adaptadores.
