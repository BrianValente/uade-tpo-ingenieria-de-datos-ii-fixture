# Hito 10 — Base de la API del Fixture 2030

Esta etapa prepara el servidor HTTP y adapta el login del equipo al Hito 10. Es una base de trabajo
para desarrollar y revisar con el equipo. **No constituye la entrega completa del
hito.** La guía de la materia permite usar IA para aprender y revisar trabajo,
pero prohíbe generar una solución completa para entregar.

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

## Implementado en esta etapa

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

Los adaptadores de autenticación están implementados y tienen pruebas unitarias.
La integración de autenticación se ejecutó contra MongoDB y Redis reales;
consultar [la evidencia](docs/evidencia/integracion-autenticacion.md).
Los módulos de equipos, partidos, comentarios, estadísticas e IRIS y sus permisos
de escritura siguen pendientes. Consultar [autenticación y seed](docs/autenticacion.md).

## Requisitos e instalación

- Node.js 24 LTS, indicado en `.nvmrc`. También admitimos Node.js 26 para trabajo local.
- pnpm 10.34.7, indicado en `packageManager`.

Ejecutar desde la raíz del repositorio:

```bash
cd hito-10-api
nvm install
nvm use
npm install --global pnpm@10.34.7
pnpm install --frozen-lockfile
cp .env.example .env
```

Si pnpm ya está instalado en la versión indicada, omitir su instalación global.
Revisar `.env` antes de iniciar. Este archivo está excluido de Git.
Configurar las credenciales de MongoDB que usa Compose y las contraseñas de seed
según [la guía de autenticación](docs/autenticacion.md).
Como alternativa al copiado manual, ejecutar `pnpm env:local` antes de crear el
`.env`: copia la conexión del entorno raíz y genera contraseñas de seed aleatorias.
Conserva cualquier `.env` existente sin modificarlo.

## Iniciar y detener

Desde `hito-10-api/`:

```bash
pnpm dev
```

Por defecto, la API escucha en `http://127.0.0.1:8000`. Abrir
`http://127.0.0.1:8000/docs/` para explorar el contrato.

Para ejecutar el código compilado:

```bash
pnpm build
pnpm start
```

Detener con `Ctrl+C`. El proceso atiende `SIGINT` y `SIGTERM` mediante
`app.close()`. No inicia, reinicia ni elimina servicios o datos de Docker.
Esta etapa se ejecuta desde la notebook. `/health` y Swagger funcionan sin bases;
login necesita MongoDB y Redis, y sesión/logout necesitan Redis.

## Configuración

| Variable                 | Valor predeterminado | Significado                                  |
| ------------------------ | -------------------- | -------------------------------------------- |
| `API_HOST`               | `127.0.0.1`          | IP de escucha o `localhost`.                 |
| `API_PORT`               | `8000`               | Puerto entre 1 y 65535.                      |
| `API_LOG_LEVEL`          | `info`               | `silent`, `error`, `warn`, `info` o `debug`. |
| `API_REQUEST_TIMEOUT_MS` | `10000`              | Límite para recibir la solicitud completa.   |
| `API_BODY_LIMIT_BYTES`   | `16384`              | Tamaño máximo del cuerpo recibido.           |

El límite HTTP de recepción **no es un timeout de consultas ni del handler**.
Los adaptadores de autenticación usan `DEPENDENCY_TIMEOUT_MS=2000` para conexión
y operación. Los futuros adaptadores también deberán definir sus límites.

La API lee el `.env` de esta carpeta. No carga automáticamente el `.env` raíz que
usa Compose. Los futuros adaptadores deben documentar sus variables, las bases
existentes y la diferencia entre acceder desde la notebook y desde Docker.

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
pueden usar `ApiError` para señalar `401`, `403`, `409` y `503`. Login y sesiones
usan `401` y `503`; `403` y `409` se preparan para los casos de uso posteriores.

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

Con MongoDB, Redis y las contraseñas de seed configuradas, ejecutar
`pnpm test:integration`. Esa prueba conserva las cuentas de seed y utiliza un
alcance Redis nuevo. No se ejecuta en CI unitaria. Ver sus requisitos y límites
en [la guía de autenticación](docs/autenticacion.md).

Después de cambiar una ruta o esquema, regenerar y versionar el contrato:

```bash
pnpm openapi:export
pnpm openapi:check
```

El YAML generado queda en `openapi/openapi.yaml`. Prettier lo excluye porque lo
formatea el generador; CI comprueba su contenido exacto contra el servidor.

El workflow `Hito 10 - Calidad de la API` corre en PRs que cambien esta carpeta,
el propio workflow o `.gitignore`; también corre en `main` y permite ejecución
manual. Cada control tiene un job separado. Usa Node.js 24, el lockfile de pnpm y
permisos de lectura. No requiere secretos ni bases de datos.

## Organización

```text
src/
  index.ts                 # entorno, escucha y señales de cierre
  config/environment.ts    # validación de configuración
  app/
    server.ts              # composición del servidor
    errors/                # errores públicos y traducción HTTP
    plugins/openapi.ts     # OpenAPI y Swagger UI
    schemas.ts             # esquema de error
scripts/export-openapi.ts
openapi/
tests/unit/
docs/casos_de_uso.md
```

Al incorporar cada módulo, separar rutas, servicio y adaptador. Los drivers y las
consultas deben quedar dentro del adaptador. Revisar con el equipo sus entradas,
respuestas, límites, reintentos y pruebas antes de ampliar el contrato publicado.
