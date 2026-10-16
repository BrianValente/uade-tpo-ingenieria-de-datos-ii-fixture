# Pruebas de la base HTTP

Desde `hito-10-api/`, ejecutar `pnpm test:unit`.

Vitest usa `Fastify.inject()`. No abre un puerto ni necesita Docker o credenciales.
Las rutas `/prueba`, `/vacio` y `/dependencia` se registran solo dentro de las pruebas.
No forman parte del servidor ni del contrato exportado.

Las pruebas comprueban validación antes del caso de uso, errores de parseo,
tamaño de cuerpo, tipo de contenido, correlación, filtrado de campos de salida,
errores seguros y publicación de Swagger UI. La dependencia caída se representa
mediante una excepción controlada: es una simulación, no evidencia de conectividad.
Las pruebas de 401, 403 y 409 en `unit/server.test.ts` comprueban la traducción común de errores.

`tests/unit/data.test.ts` usa adaptadores simulados para los cinco módulos de
negocio. Cubre éxito, ausencia, validación, dependencia inaccesible, límites,
composición sin respuesta parcial, cursor, repetición y permisos. También comprueba
que una sesión vencida no se recree. Son pruebas automatizadas, no evidencia real.

`pnpm openapi:check` comprueba por separado que el YAML versionado coincida con
las rutas reales. La integración consulta las seis bases y registra sus resultados
sin presentar las pruebas simuladas como ejecuciones reales.

## Autenticación

Las pruebas unitarias de login usan repositorios simulados y verifican que una
falla de MongoDB o Redis no entregue un token. Las de seed comprueban repetición
sin restablecer cuentas. Argon2 se ejecuta realmente para verificar salt aleatorio,
parámetros y aceptación/rechazo de contraseñas. Los adaptadores tienen pruebas
con clientes simulados; no prueban un servidor real ni la ejecución de Lua.

`pnpm test:integration` prepara el entorno local y ejecuta `tests/integration/`.
Requiere los seis motores saludables y ambas contraseñas de seed. Completa conexiones
faltantes desde el `.env` raíz y el token local de InfluxDB. Si no hay credenciales
IRIS, crea una cuenta temporal con rol `%All` para laboratorio y la elimina al
terminar. No modifica `_SYSTEM` ni guarda la contraseña temporal. Si las cuentas de seed ya existen,
usar sus contraseñas originales: la seed no las cambia. La prueba conserva esas
cuentas y usa un prefijo de sesiones nuevo. No borra colecciones ni limpia Redis.
Las escrituras de negocio usan IDs y agregados nuevos `F2030-TEST-*`; esos datos se
conservan para inspección. La limpieza automática se limita a sesiones propias y
a la cuenta temporal creada por el lanzador.
No se ejecuta en la CI unitaria. Registrar por separado cuándo y dónde se ejecutó.
La ejecución de autenticación contra MongoDB y Redis está registrada en
[su evidencia](../docs/evidencia/integracion-autenticacion.md). La integración de
lectura de todos los motores se registra en
[la evidencia integrada](../docs/evidencia/integracion-motores.md).

`pnpm test:redis` ejecuta solo `tests/integration/redis-session.test.ts`, contra
Redis real. No requiere MongoDB ni contraseñas de seed. Comprueba Lua, TTL, consulta
HTTP y logout; la cuenta es un dato sintético y no se ejecuta login. La expiración
se acelera a 50 ms sobre una sesión propia de la prueba.

`pnpm test:timeouts` no requiere Docker ni credenciales. Inicia un servidor TCP
local que acepta conexiones sin completar el protocolo y usa los drivers reales
para comprobar sus límites de espera. Es una simulación de red sin respuesta;
no demuestra disponibilidad ni ejecución de consultas en MongoDB o Redis.

## Regresiones de integración

`pnpm test:writes` prueba Cassandra e IRIS reales. Cassandra debe conservar el autor
ante colisiones, aceptar el reintento original, mantener contadores, reparar una
vista faltante sin copiar una fila histórica a otro grupo, y paginar empates de
timestamp en varios grupos. Una carrera de dos usuarios debe producir un `201`
y un `409`, sin una fila por usuario para el perdedor.

IRIS usa un agregado nuevo. Se verifican `403` de usuario, transiciones válidas e
inválidas, evento persistido, repetición rechazada y estado final al volver a abrir
el objeto. `data.test.ts` crea su propio agregado para no depender de un código
de una demostración anterior.

`neo4j-timeout.test.ts` usa APOC, ya instalado por Compose, para demorar una lectura.
El servidor debe terminar la transacción por timeout. No se modifican nodos ni
relaciones. Esta prueba, las escrituras y las lecturas forman parte de la suite
completa de integración, separada de las pruebas unitarias de CI.
