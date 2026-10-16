# Integración de autenticación — ejecución local

## Entorno observado

- Fecha de la ejecución ampliada: 16 de octubre de 2026, aproximadamente 03:23 UTC.
- Notebook: macOS 27.0.1. API y Vitest ejecutados fuera de Docker.
- Node.js 24.22.0, pnpm 10.34.7 y Vitest 5.0.5.
- Contexto Docker: `desktop-linux`; proyecto Compose: `fixture2030`.
- MongoDB 7.0.45, imagen `mongo:7.0`, puerto local 27017.
- Redis 8.10.2, imagen `redis:latest`, puerto local 6379.
- Ambos servicios estaban saludables antes de ejecutar la integración.
- Base MongoDB: `fixture2030`; colección nueva de cuentas: `usuarios_api`.
- Datos: dos cuentas sintéticas y sesiones con alcance aleatorio por prueba.

Se verificó el contexto y la ruta de Compose antes de iniciar MongoDB. El primer
intento de descargar su imagen falló por falta de espacio. Brian confirmó que
había liberado o ampliado espacio y el segundo intento terminó correctamente.

## Preparación y comandos

Desde la raíz del repositorio:

```bash
docker context show
docker compose ls --format json
docker compose up -d --no-deps --wait --wait-timeout 120 mongodb
docker compose ps mongodb redis
```

Desde `hito-10-api/`, con Node.js 24 y pnpm 10.34.7:

```bash
pnpm env:local
pnpm test:redis
pnpm seed:users
pnpm test:integration
```

La creación del `.env` generó dos contraseñas aleatorias. El archivo quedó
ignorado por Git y se verificaron permisos `-rw-------`. Una segunda ejecución
de `pnpm env:local` informó que conservaba el archivo sin cambios. Ningún comando
de esta evidencia imprime contraseñas, hashes, tokens o URI con credenciales.

## Resultados observados

La primera seed produjo esta salida:

```text
Usuarios creados: 2; usuarios existentes conservados: 0.
```

La integración ampliada produjo:

```text
Test Files  3 passed (3)
     Tests  4 passed (4)
```

| Prueba                    | Resultado observado                                                                           | Fuente                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Seed repetida             | Segunda carga: cero inserciones y dos cuentas conservadas.                                    | MongoDB real.                                          |
| Login de administrador    | `200`, rol `admin` y token válido para consultar la sesión.                                   | MongoDB y Redis reales.                                |
| Login de usuario          | `200`, rol `user`.                                                                            | MongoDB y Redis reales.                                |
| Consulta de sesión        | `200`, TTL positivo de hasta 1800 segundos.                                                   | Redis real.                                            |
| Entrada inválida          | Username enviado como objeto: `400`.                                                          | Validación HTTP de la API.                             |
| Credenciales incorrectas  | Contraseña incorrecta y cuenta ausente: `401`, mismo mensaje.                                 | MongoDB real y Argon2 real.                            |
| Logout repetido           | Dos respuestas `204`; la sesión cerrada luego produce `401`.                                  | Redis real.                                            |
| Dependencias inaccesibles | `503`, sin token, al configurar por separado MongoDB y Redis en un puerto local sin servicio. | Drivers reales; configuración de conexión inaccesible. |
| Persistencia de sesión    | Hash Redis con UUID de usuario y digest de sesión; sin token original.                        | Redis real.                                            |
| Lectura sin renovación    | El TTL posterior no supera el TTL previo.                                                     | Redis real y lectura HTTP.                             |
| Timestamps                | Respuesta UTC con seis dígitos de fracción de segundo.                                        | `TIME` de Redis y transformación del adaptador.        |
| Expiración controlada     | TTL de una sesión propia reducido a 50 ms; tras 100 ms, API `401` y Redis `PTTL = -2`.        | Expiración real en Redis.                              |
| Límites de espera         | Dos pruebas aprobadas con servidores TCP sin respuesta.                                       | Drivers reales; protocolo de base simulado.            |

## Alcance y límites

Las solicitudes HTTP de integración pasan por `Fastify.inject()`: ejecutan las
rutas y sus esquemas, servicios y adaptadores, sin abrir un puerto HTTP. Las
conexiones de los adaptadores sí llegan a las bases reales de Docker.

`tests/integration/auth.test.ts` comprueba el flujo con las dos bases.
`tests/integration/redis-session.test.ts` comprueba Redis por separado; su cuenta
es un dato sintético y no ejecuta login. `tests/integration/timeouts.test.ts`
simula conexiones TCP sin respuesta y no se presenta como una consulta real.

Las cuentas de laboratorio se conservan. Las pruebas solo cierran las sesiones
que crean. No se borraron colecciones o volúmenes ni se limpiaron otras claves.

La expiración de 50 ms es una prueba acelerada; no se esperaron 30 minutos. Las
fallas de disponibilidad usan puertos sin servicio; no se detuvieron las bases.
No se midió capacidad, percentiles de latencia ni rendimiento bajo carga. Los
resultados no demuestran cobertura de Neo4j, Cassandra, InfluxDB o IRIS, ni que el
Hito 10 esté completo.
