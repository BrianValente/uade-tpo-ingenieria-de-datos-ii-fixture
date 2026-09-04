# Evidencia de ejecucion

Ejecucion local realizada el 28 de agosto de 2026 con Docker Desktop y MongoDB 7.0. La evidencia corresponde al volumen academico del Hito 4.

## Ambiente y carga

`docker compose ps` mostro el servicio `fixture2030-mongodb-1` en estado `healthy` y el puerto `127.0.0.1:27017` publicado.

La ejecucion de `./scripts/load-data.sh` produjo:

```text
Colecciones y validaciones configuradas en fixture2030.
{
  carga: 'completa',
  equiposParticipantes: 64,
  jugadoresDeParticipantes: 1536
}
{
  equiposParticipantes: 64,
  jugadoresDeParticipantes: 1536,
  jugadoresSinEquipo: 0,
  referenciasInconsistentes: 0,
  plantelesConCantidadDistintaDe24: 0,
  equiposInvalidosSegunSchema: 0,
  jugadoresInvalidosSegunSchema: 0
}
```

Ejecutamos la misma carga una segunda vez. Los recuentos permanecieron en 64 y 1.536. No se generaron duplicados ni referencias invalidas. `queries/00-validate.js` intento insertar un documento con identificadores, posicion y dorsal invalidos. MongoDB rechazo la escritura con el codigo 121 y no guardo el documento.

Reiniciamos el contenedor con `docker compose restart mongodb`, esperamos hasta recuperar el estado `healthy` y ejecutamos `queries/05-verify.js` antes de volver a cargar. Los 64 equipos, los 1.536 jugadores y todas las referencias permanecieron validos. Esto comprobo la persistencia del volumen nombrado.

## Operaciones

`queries/01-read.js` permite recuperar el equipo `ARG` por codigo y un jugador de Argentina por su UUID v5. Tambien incluye equipos filtrados por CONMEBOL y la segunda pagina de cinco jugadores de Argentina con proyeccion, orden y limite.

`queries/02-insert-update.js` inserto el equipo no participante `TST` y un jugador de demostracion asociado. Despues agrego la sede de entrenamiento al equipo y cambio `disponible` a `false` en el jugador. La relacion `equipoId` se mantuvo sin cambios. El script comprueba que ambas actualizaciones encontraron exactamente un documento.

`queries/03-aggregate.js` consolido los 64 equipos y 1.536 jugadores por confederacion. Por ejemplo, UEFA devolvio 28 equipos y 672 jugadores.

## Rendimiento

La consulta analizada busca delanteros de Argentina y los ordena por dorsal. `queries/04-performance.js` produjo:

```text
{
  medicion: 'Plan forzado sin usar el indice (hint $natural)',
  etapa: 'SORT',
  documentosDevueltos: 5,
  documentosExaminados: 1536,
  clavesExaminadas: 0
}
{
  medicion: 'Con indice compuesto',
  etapa: 'FETCH',
  documentosDevueltos: 5,
  documentosExaminados: 5,
  clavesExaminadas: 5
}
```

La primera medicion se registro antes de insertar el documento de demostracion. El plan que no usa el indice examino 1.536 documentos. El plan con el indice compuesto examino 5. El script actual usa `hint({ $natural: 1 })` para poder repetir la comparacion sin borrar el indice del estado final. Esta medicion muestra el efecto sobre el dataset local. No permite estimar por si sola la latencia con trafico distribuido o millones de usuarios.
