# Línea base reproducible — Hito 12

## Flujo de referencia

El control `baseline` se ejecuta en `scripts/servidor_optimizado.ts`, con instrumentación de la lógica de lectura del Hito 10. Es un servidor de benchmark; no debe confundirse con el proceso de la API del Hito 10 ni con el servidor de monitoreo del Hito 13.

```bash
pnpm --dir hito-10-api h12:linea-base
```

Antes de cada carga, el runner verifica el dataset y prepara el lote identificado de prueba: 64 equipos, 1.536 jugadores, 32 partidos, 8 sedes, 64 eventos canónicos más 320 eventos `HITO_12` y 20 sesiones virtuales. No elimina colecciones, bases ni volúmenes.

## Configuración del control

| Aspecto | `baseline` |
| :--- | :--- |
| Pools MongoDB / Neo4j | 5 / 5 por defecto |
| Lectura de equipos de un partido | Dos búsquedas documentales separadas |
| Plantel | Resolución del equipo, consulta de jugadores y conteo |
| Proyección / batching O1 | Desactivados |
| Caché de respuestas O2 | Desactivada; TTL de datos en cero |
| Renovación de sesión O3 | Desactivada; renovación en cada petición válida |

La configuración **efectiva**, incluidos los overrides de entorno, se registra en `scenario` del JSON. La distribución de selección usa pesos 40/30/20/10 y sesgo de claves 80/20, no cuotas exactas por endpoint. Con un límite temporal, dos modos pueden completar distintas cantidades de operaciones; comparten generador, semilla y políticas de selección, no necesariamente la misma longitud de secuencia.

## Resultados y procedencia

- [Reporte legible de línea base](evidencia/resultados_linea_base.md).
- [JSON original de la ejecución](evidencia/resultados_linea_base.json): fecha, commit, estado del árbol, runtime, versiones, condiciones, calentamiento, ventana medida, perfiles, telemetría y recursos.
- [Comparación antes/después](evidencia/tablas_o_graficos.md).
- [Comparación de una política: solo caché O2](evidencia/comparacion_isolated_o2.md).

El calentamiento se excluye de las estadísticas de la ventana medida. La duración incluye el drenaje de las solicitudes en vuelo. Los percentiles son distribuciones E2E; no se suman percentiles de motores para reconstruir el percentil HTTP.

## Diagnóstico e hipótesis

1. **Amplificación documental:** las rutas compuestas necesitan varias operaciones para producir una respuesta. Contrastar `dependencies.mongodb.operationsCount` con las solicitudes y su mezcla de perfiles, no solo con el throughput global.
2. **Contención potencial de pools:** 24 usuarios virtuales pueden competir por cinco conexiones. La latencia total del driver incluye trabajo del motor y esperas; por sí sola no prueba cuánto tiempo se perdió adquiriendo una conexión.
3. **Lecturas repetidas:** sin caché, tanto claves calientes como frías vuelven a consultar las fuentes. Esta hipótesis se contrasta activando únicamente O2, conservando O1 y O3 desactivadas.
4. **Escrituras de sesión:** la renovación por petición añade escrituras Redis. La telemetría distingue renovaciones ejecutadas y omitidas; la reducción de escrituras no demuestra por sí sola una mejora E2E.

## Límites

Los resultados corresponden al entorno que declara cada reporte. En la ejecución Linux de esta entrega, MongoDB utiliza emulación de CPU; no es comparable directamente con una notebook Windows ni con producción. Una ventana breve sirve para comparar este escenario y encontrar errores, no para establecer capacidad mundial, escalado lineal o un SLA.
