# Contratos de integración

## Configuración local

`.env.example` declara host y puerto de cada motor. `NEO4J_PASSWORD`,
`INFLUXDB_TOKEN`, `IRIS_USERNAME` e `IRIS_PASSWORD` no tienen valor por defecto.
El inicio directo con `pnpm dev` o `pnpm start` usa las variables de entorno de la
API. Para el laboratorio, `pnpm dev:lab` y `pnpm test:integration` completan solo
las conexiones faltantes desde el `.env` raíz y el token local de InfluxDB.
No imprimen esos valores ni modifican el `.env` existente.

Si no se proporcionan credenciales IRIS, el lanzador verifica el contenedor del
proyecto y crea una cuenta temporal con rol `%All`, solo para el laboratorio.
La contraseña aleatoria vive en memoria. El proceso hijo la recibe por entorno.
Al cerrar la ejecución, se elimina únicamente esa cuenta, previa comprobación
de su marca de propiedad. La cuenta expira al día siguiente como resguardo si
el proceso se interrumpe sin poder limpiar. No se modifica `_SYSTEM`.
El lanzador requiere acceso al terminal administrativo del contenedor local;
no es un procedimiento de despliegue de producción.

## Límites de lectura

`GET /equipos/:codigo/jugadores` usa páginas de 1 a 50 filas. Los eventos de
Neo4j y los comentarios de Cassandra admiten de 1 a 100 filas. Ninguna ruta
acepta nombres de colección, CQL, Cypher o SQL enviados por el consumidor.

La ficha `GET /partidos/:id` consulta primero las relaciones de Neo4j. Después
busca las dos fichas de equipo en MongoDB. Si falta una ficha documental, devuelve
`503` y no entrega un resultado parcial. Un partido ausente en Neo4j produce `404`.

## Comentarios

La lectura recibe un minuto UTC exacto. Consulta las 16 particiones definidas en
el Hito 6 y une las filas por `creado_en` descendente y `comentario_id` ascendente.
El cursor codifica esa última clave. No permite elegir grupos ni tablas.
Se valida su codificación, fecha y UUID antes de consultar Redis o Cassandra.
Al continuar una página se consultan primero los IDs mayores con la misma fecha
y luego las fechas menores. No se usa una comparación de tupla incompatible
con el orden mixto. La unión respeta el comparador UUID de Cassandra, incluso
para datos anteriores con versiones UUID distintas.

La escritura toma `usuario_id` y `usuario_nombre` de la sesión. El consumidor
envía `commentId`, `createdAt` y `content`. Repetir esos valores usa las mismas
claves primarias en `comentarios_por_partido` y `comentarios_por_usuario`.
La reserva de la clave usa `INSERT ... IF NOT EXISTS`. Solo el mismo autor, nombre
y contenido pueden repetir la creación. Una colisión de identidad o contenido
devuelve `409` y no sobrescribe el comentario existente. Los contadores y el
estado ya guardados se conservan.

Las escrituras nuevas conservan el grupo del Hito 6: UUID entero módulo 16.
El primer prototipo de API usó un hash diferente. Para no migrar ni duplicar esas
filas, antes de reservar se hacen hasta 16 lecturas de clave primaria completa,
una por grupo, para la misma identidad de comentario. No son escaneos de tabla.
Una fila histórica se conserva en su grupo; si hay identidades duplicadas entre
grupos, la creación devuelve `409` para revisión manual. Este control agrega
operaciones de lectura a cada escritura y no se presenta como una solución ya
validada para la carga masiva del escenario.

Las dos vistas están en particiones diferentes. No usamos un batch entre
particiones ni prometemos atomicidad. La API reserva primero la vista por partido
y después la vista por usuario, ambas sin sobrescribir filas existentes. Si la
segunda queda inaccesible, devuelve `503`; repetir la solicitud original repara
la vista faltante. Si la clave de la vista por usuario corresponde a otro partido
o contenido, devuelve `409` y no la modifica. En ese conflicto puede quedar la
reserva de la primera vista: requiere revisión, no una transacción distribuida.

## Límites de Neo4j

`DEPENDENCY_TIMEOUT_MS` configura conexión, adquisición de conexión del pool y
timeout de cada transacción de lectura. Los reintentos automáticos están
desactivados. El timeout de transacción lo aplica el servidor; no se promete que
la respuesta HTTP termine exactamente al cumplirse ese número de milisegundos.
La prueba real usa una lectura demorada con APOC y comprueba su terminación.

## Estadísticas

La ventana es UTC y semiabierta: `[start, end)`. Debe ser positiva y no superar
24 horas. El adaptador ejecuta una consulta SQL fija y parametrizada sobre
`estadisticas_equipo`. Devuelve hasta 64 equipos con muestras, posesión promedio,
tiros máximos observados y suma de pases por intervalo.

## IRIS

La lectura abre el objeto `Fixture.Partido` y navega árbitro, técnicos y eventos.
Las escrituras ejecutan `CambiarEstado()` o `RegistrarEvento()` y luego `%Save()`.
La API comprueba cada `%Status`. Una regla de dominio rechazada produce `409`.
Repetir una transición ya aplicada produce `409` con el modelo actual. Repetir
el código de un evento produce `409` y no agrega otro evento persistido. Las
pruebas reales vuelven a abrir el objeto después de cada operación para comprobar
el estado guardado. Usan agregados nuevos `F2030-TEST-*`, que se conservan para
inspección; no cambian partidos existentes.

Los eventos de IRIS y Neo4j siguen separados. Registrar un evento en IRIS no
actualiza el grafo. Esta API no agrega sincronización entre motores.
