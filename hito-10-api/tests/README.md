# Pruebas de la base HTTP

Desde `hito-10-api/`, ejecutar `pnpm test:unit`.

Vitest usa `Fastify.inject()`. No abre un puerto ni necesita Docker o credenciales.
Las rutas `/prueba`, `/vacio` y `/dependencia` se registran solo dentro de las pruebas.
No forman parte del servidor ni del contrato exportado.

Las pruebas comprueban validación antes del caso de uso, errores de parseo,
tamaño de cuerpo, tipo de contenido, correlación, filtrado de campos de salida,
errores seguros y publicación de Swagger UI. La dependencia caída se representa
mediante una excepción controlada: es una simulación, no evidencia de conectividad.
Las pruebas de 401, 403 y 409 en `unit/server.test.ts` comprueban la traducción común de errores; no
demuestran autenticación, permisos ni reglas de negocio implementadas.

`pnpm openapi:check` comprueba por separado que el YAML versionado coincida con
las rutas reales. Las futuras pruebas de integración deberán consultar las seis
bases y registrar sus resultados de forma independiente.

## Autenticación

Las pruebas unitarias de login usan repositorios simulados y verifican que una
falla de MongoDB o Redis no entregue un token. Las de seed comprueban repetición
sin restablecer cuentas. Argon2 se ejecuta realmente para verificar salt aleatorio,
parámetros y aceptación/rechazo de contraseñas. Los adaptadores tienen pruebas
con clientes simulados; no prueban un servidor real ni la ejecución de Lua.

`pnpm test:integration` lee el `.env` local y ejecuta los tres archivos de `tests/integration/`.
Requiere MongoDB, Redis y ambas contraseñas de seed. Si las cuentas ya existen,
usar sus contraseñas originales: la seed no las cambia. La prueba conserva esas
cuentas y usa un prefijo de sesiones nuevo. No borra colecciones ni limpia Redis.
No se ejecuta en la CI unitaria. Registrar por separado cuándo y dónde se ejecutó.
La ejecución contra MongoDB y Redis está registrada en
[la evidencia](../docs/evidencia/integracion-autenticacion.md).

`pnpm test:redis` ejecuta solo `tests/integration/redis-session.test.ts`, contra
Redis real. No requiere MongoDB ni contraseñas de seed. Comprueba Lua, TTL, consulta
HTTP y logout; la cuenta es un dato sintético y no se ejecuta login. La expiración
se acelera a 50 ms sobre una sesión propia de la prueba.

`pnpm test:timeouts` no requiere Docker ni credenciales. Inicia un servidor TCP
local que acepta conexiones sin completar el protocolo y usa los drivers reales
para comprobar sus límites de espera. Es una simulación de red sin respuesta;
no demuestra disponibilidad ni ejecución de consultas en MongoDB o Redis.
