# Pruebas de la base HTTP

Desde `hito-10-api/`, ejecutar `pnpm test:unit`.

Vitest usa `Fastify.inject()`. No abre un puerto ni necesita Docker o credenciales.
Las rutas `/prueba`, `/vacio` y `/dependencia` se registran solo dentro de las pruebas.
No forman parte del servidor ni del contrato exportado.

Las pruebas comprueban validación antes del caso de uso, errores de parseo,
tamaño de cuerpo, tipo de contenido, correlación, filtrado de campos de salida,
errores seguros y publicación de Swagger UI. La dependencia caída se representa
mediante una excepción controlada: es una simulación, no evidencia de conectividad.
Las pruebas de 401, 403 y 409 comprueban la traducción común de errores; no
demuestran autenticación, permisos ni reglas de negocio implementadas.

`pnpm openapi:check` comprueba por separado que el YAML versionado coincida con
las rutas reales. Las futuras pruebas de integración deberán consultar las seis
bases y registrar sus resultados de forma independiente.
