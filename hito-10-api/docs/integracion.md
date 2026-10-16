# Contratos de integración

## Configuración local

`.env.example` declara host y puerto de cada motor. `NEO4J_PASSWORD`,
`INFLUXDB_TOKEN`, `IRIS_USERNAME` e `IRIS_PASSWORD` no tienen valor por defecto.
La API no lee el `.env` raíz ni el archivo local del token InfluxDB. Cada secreto
debe configurarse en `hito-10-api/.env`, que Git ignora.

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

La escritura toma `usuario_id` y `usuario_nombre` de la sesión. El consumidor
envía `commentId`, `createdAt` y `content`. Repetir esos valores usa las mismas
claves primarias en `comentarios_por_partido` y `comentarios_por_usuario`.
Cassandra aplica un upsert, por lo que la repetición no agrega otra fila.

Las dos vistas están en particiones diferentes. No usamos un batch entre
particiones ni prometemos atomicidad. La API escribe primero la vista por partido
y después la vista por usuario. Si la segunda falla, devuelve `503`. El consumidor
debe repetir exactamente la solicitud para reparar la vista faltante.

## Estadísticas

La ventana es UTC y semiabierta: `[start, end)`. Debe ser positiva y no superar
24 horas. El adaptador ejecuta una consulta SQL fija y parametrizada sobre
`estadisticas_equipo`. Devuelve hasta 64 equipos con muestras, posesión promedio,
tiros máximos observados y suma de pases por intervalo.

## IRIS

La lectura abre el objeto `Fixture.Partido` y navega árbitro, técnicos y eventos.
Las escrituras ejecutan `CambiarEstado()` o `RegistrarEvento()` y luego `%Save()`.
La API comprueba cada `%Status`. Una regla de dominio rechazada produce `409`.

Los eventos de IRIS y Neo4j siguen separados. Registrar un evento en IRIS no
actualiza el grafo. Esta API no agrega sincronización entre motores.
