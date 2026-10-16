# Autenticación y seed de laboratorio

Adaptamos la búsqueda de cuenta y verificación de Argon2 del TPO de baloncesto.
MongoDB conserva las cuentas; Redis conserva las sesiones. El servidor registra
las rutas reales y las describe en OpenAPI. Las pruebas unitarias usan repositorios
y clientes simulados, salvo las comprobaciones del hash Argon2, que son reales.
La integración se ejecutó contra MongoDB y Redis reales. La
[evidencia de la ejecución](evidencia/integracion-autenticacion.md) registra el
entorno, los comandos, los resultados y sus límites.

## Configurar desde la notebook

El `.env` de `hito-10-api/` no carga el `.env` raíz. Copiar las credenciales locales
de MongoDB sin publicarlas. `MONGO_ROOT_PASSWORD` debe coincidir con la configuración
de Compose. Las contraseñas de seed solo se requieren al cargar usuarios o ejecutar
la prueba de integración.

Para crear la configuración automáticamente desde `hito-10-api/`:

```bash
pnpm env:local
```

El comando copia la conexión desde el `.env` raíz, con precedencia de variables
exportadas igual que Compose, y genera dos contraseñas aleatorias de 32 bytes.
Guarda el `.env` ignorado por Git con permisos `0600`. No imprime las credenciales
ni sobrescribe un archivo existente. Revisar el archivo local con el editor para
usar las cuentas en Swagger. Si ya se copió `.env.example`, completar ese archivo
manualmente: el comando lo conserva.

| Variable                                     | Valor predeterminado | Uso                                                                               |
| -------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `MONGO_HOST`, `MONGO_PORT`                   | `127.0.0.1`, `27017` | Dirección de MongoDB.                                                             |
| `MONGO_DATABASE`                             | `fixture2030`        | Base que recibe `usuarios_api`.                                                   |
| `MONGO_AUTH_SOURCE`                          | `admin`              | Base de autenticación.                                                            |
| `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD` | Vacíos               | Configurar ambos; ambos vacíos permiten un laboratorio MongoDB sin autenticación. |
| `REDIS_HOST`, `REDIS_PORT`                   | `127.0.0.1`, `6379`  | Dirección de Redis.                                                               |
| `REDIS_DATABASE`                             | `0`                  | Base lógica, entre 0 y 15.                                                        |
| `REDIS_USERNAME`, `REDIS_PASSWORD`           | Vacíos               | Credenciales si Redis las requiere.                                               |
| `API_REDIS_SCOPE`                            | `api`                | Alcance fijo de sesiones.                                                         |
| `DEPENDENCY_TIMEOUT_MS`                      | `2000`               | Límite por operación, entre 100 y 10000 ms.                                       |
| `API_SEED_ADMIN_PASSWORD`                    | Sin valor            | Contraseña del administrador, entre 16 y 128 caracteres.                          |
| `API_SEED_USER_PASSWORD`                     | Sin valor            | Otra contraseña, entre 16 y 128 caracteres.                                       |

Las dos contraseñas de seed deben ser distintas. Usar contraseñas aleatorias de un
gestor de contraseñas. No publicarlas en código, capturas, logs ni colecciones.

Para una futura ejecución dentro de la red de Compose, los hosts serían `mongodb`
y `redis`, con sus puertos internos. Esta etapa no agrega un contenedor de API ni
modifica Compose.

## Cargar las cuentas

Con Docker disponible, comprobar el contexto y el proyecto `fixture2030`. Iniciar
MongoDB y Redis según el README raíz. Desde `hito-10-api/`:

```bash
pnpm seed:users
```

La seed crea la colección `usuarios_api` y un índice único por `username`. Crea
`fixture-admin` con rol `admin` y `fixture-user` con rol `user`. Guarda UUID, nombre
de usuario, rol y hash. Argon2id usa 65536 KiB de memoria, tres iteraciones,
paralelismo cuatro y un salt aleatorio generado por la biblioteca.

La carga usa `$setOnInsert`. Repetirla conserva IDs, hashes y roles de cuentas
existentes. Cambiar contraseñas de entorno y repetirla **no cambia** esas cuentas.
Conservar las credenciales de la primera carga para probar login.

Si la carga se interrumpe entre los dos usuarios, repetirla completa los faltantes.
No se promete una transacción que cree ambas cuentas de forma indivisible.
No hay borrado ni restablecimiento automático de cuentas.

## Contrato HTTP

Abrir `/docs/`, ejecutar `POST /auth/login` y colocar el `accessToken` recibido en
**Authorize**. Swagger usa `Authorization: Bearer ...`.

| Operación              | Éxito                                          | Otros resultados                                                                           |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST /auth/login`     | `200`: token, 1800 s y usuario público.        | `400` entrada inválida; `401` credenciales incorrectas; `503` MongoDB o Redis inaccesible. |
| `GET /auth/session`    | `200`: usuario, timestamps UTC y TTL restante. | `401` sesión ausente/expirada; `400` Bearer mal formado; `503` Redis inaccesible.          |
| `DELETE /auth/session` | `204`, también si ya estaba ausente.           | `401` falta Bearer; `400` Bearer mal formado; `503` Redis inaccesible.                     |

Las rutas también pueden producir `500` seguro ante errores inesperados. El login
rechaza cuerpos excesivos con `413` y tipos no admitidos con `415`. Las respuestas
de autenticación llevan `Cache-Control: no-store`. Los `401` incluyen el desafío
`WWW-Authenticate: Bearer`. Nunca se devuelve el hash de una contraseña.

El token tiene 32 bytes aleatorios codificados en base64url. No es un JWT. Se
entrega solo en el login; Redis guarda su digest SHA-256 como identificador. Ese
digest no se usa para contraseñas: las contraseñas usan Argon2id.

Cada clave tiene la forma `fixture2030:h10:<alcance>:sesion:<digest>` y es un hash
con identidad, rol, estado y timestamps. Lua crea atributos y TTL de forma atómica,
como en el Hito 7. La lectura obtiene hash y TTL juntos y conserva microsegundos
UTC. No consulta ni modifica sesiones sintéticas bajo `fixture2030:h7:*`.

## Repetición, expiración y fallas

- Cada login crea otra sesión para otro acceso o dispositivo.
- La consulta no renueva el TTL. En esta etapa, el vencimiento se cuenta desde
  el login. La renovación por actividad autenticada queda pendiente junto con
  los casos de uso protegidos.
- Los roles se guardan en la sesión, pero todavía no hay rutas de escritura de
  negocio sobre las que aplicar permisos.
- Logout es idempotente y solo borra la sesión actual. No invalida otros dispositivos.
- Un `503` durante logout no confirma el cierre. El consumidor puede repetirlo.
- Ante timeout de creación, no se entrega token ni se reintenta automáticamente.
  Una sesión que pudo haberse creado en Redis vence por TTL.
- MongoDB limita la operación completa con `timeoutMS`, además de conexión y
  selección de servidor. No reintenta lecturas o escrituras automáticamente.
- Redis desactiva reconexión y cola offline. El adaptador limita conexión y
  respuesta y destruye la conexión fallida. El timeout de la biblioteca solo
  cubre comandos sin enviar; no sustituye ese límite de respuesta.

## Prueba de integración

Con MongoDB y Redis disponibles, y las contraseñas originales de seed configuradas:

```bash
pnpm test:integration
```

La prueba ejecuta la seed dos veces y verifica login, consulta, logout repetido y
rechazo de la sesión cerrada. Usa un alcance Redis nuevo y cierra solo las sesiones
que creó. Conserva las cuentas de laboratorio; no borra colecciones ni limpia Redis.
Comprueba ambos roles, entradas inválidas, credenciales incorrectas y dependencias
inaccesibles configurando puertos sin servicio, sin detener las bases en uso.

`pnpm test:redis` ejecuta por separado una prueba contra Redis real. Verifica los
scripts Lua, lectura HTTP sin renovar TTL, logout y expiración real. Para la
expiración reduce a 50 ms el TTL de una sesión que creó la propia prueba. No ejecuta
login ni usa MongoDB. Esta prueba también se incluye en `pnpm test:integration`.

No forma parte de CI unitaria. Registrar entorno, fecha y resultados al ejecutarla.
La prueba no espera 30 minutos ni demuestra capacidad para millones de sesiones.
