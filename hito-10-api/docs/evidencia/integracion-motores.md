# Integración de los motores

## Ejecución observada

La prueba se ejecutó el 16 de octubre de 2026 en Docker Desktop para macOS, con
el contexto `desktop-linux` y el proyecto Compose `fixture2030`. Los seis servicios
quedaron sanos. Cassandra informó versión 5.0.9. IRIS informó Community 2026.2,
build 221U, para ARM64.

MongoDB se cargó con el script repetible versionado. La verificación observó 64
equipos, 1536 jugadores, cero referencias inconsistentes y 24 jugadores por equipo.
Neo4j se creó y cargó desde esa fuente. Su verificación observó 32 partidos, 64
eventos y todas las restricciones e índices en estado `ONLINE`.

Cassandra se cargó con sus claves fijas. La verificación observó una fila en cada
grupo 1, 2 y 3, y dos usuarios. No usamos un `COUNT(*)` global como prueba de la
API porque agotó el tiempo del coordinador y no corresponde al patrón por partición.

La prueba `tests/integration/data.test.ts` inició sesión en Redis y consultó:

- equipo y plantel en MongoDB;
- ficha combinada y eventos en Neo4j;
- comentarios y dos páginas consecutivas en Cassandra;
- resumen SQL en InfluxDB;
- detalle y relaciones de un partido en IRIS.

La ejecución completa de `pnpm test:integration` finalizó con cuatro archivos y
cinco pruebas aprobadas. Para IRIS se creó una cuenta temporal
con contraseña aleatoria en memoria y se eliminó al terminar. No se modificó la
contraseña inicial de `_SYSTEM`. La prueba no escribió comentarios, estados ni
eventos de negocio.

## Límites

La ejecución comprueba conectividad, contratos de lectura, composición y cursor.
No mide latencia bajo carga, concurrencia, alta disponibilidad ni los objetivos
distribuidos del escenario. Las escrituras, permisos, repetición y fallas parciales
se comprobaron con adaptadores simulados en las pruebas unitarias. Esa simulación
no demuestra atomicidad ni recuperación real entre dos particiones Cassandra.
