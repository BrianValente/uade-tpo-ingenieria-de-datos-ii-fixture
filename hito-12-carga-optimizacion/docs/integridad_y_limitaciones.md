# Integridad, limitaciones y conclusiones — Hito 12

## Validación durante la carga

`verifyPayloadIntegrity()` valida el contenido de cada HTTP 200, no solo el código de estado:

- Partido: identidad solicitada y objetos completos de local, visitante y sede.
- Plantel: 24 jugadores del equipo solicitado, identificadores y dorsales únicos y paginación consistente.
- Eventos: arreglo no vacío, identificadores únicos, vínculo al partido y campos de tipo/minuto válidos.
- Equipo: código solicitado, identificador y condición de participante.

Un payload inválido se contabiliza en `payloadIntegrityErrors`; no se convierte en éxito por recibir HTTP 200. El reporte conserva calentamiento y período medido por separado, perfiles y distribuciones globales/hot/cold.

## Auditoría posterior contra las fuentes

```bash
pnpm --dir hito-10-api h12:validar
```

Las salidas [JSON](evidencia/validacion_integridad.json) y [Markdown](evidencia/validacion_integridad.md) son generadas por el validador y contienen el resultado observado de cada control:

| Control | Criterio |
| :--- | :--- |
| INT-01 | 64 equipos participantes con identidades y códigos únicos |
| INT-02 | 1.536 jugadores, 24 por equipo y rangos válidos |
| INT-03 | Correspondencia de identificadores de equipo MongoDB ↔ Neo4j |
| INT-04 | 32 partidos, 64 eventos canónicos más 320 del lote H12 y ausencia de huérfanos |
| INT-05 | 20 sesiones esperadas autorizadas con TTL vigente |
| INT-06 | Claves de caché activas con TTL y contenido coherente con sus fuentes; el número depende del tráfico y la expiración |
| INT-07 / INT-08 | Contabilidad e integridad de las respuestas de las corridas base y optimizada |

La comprobación post-limpieza es distinta de la post-carga: acepta la retirada del lote H12 y exige conservar los datos canónicos. La limpieza se limita a eventos identificados como `HITO_12` y a claves del alcance de prueba; no borra volúmenes ni ejecuta `FLUSHDB`.

## Interpretación experimental

La [comparación O2](evidencia/comparacion_isolated_o2.md) es el contraste de una sola política pedido por el docente. La [comparación O1](evidencia/comparacion_isolated_o1.md) evalúa pools, proyección y batching juntos. Las [tablas base/optimizado](evidencia/tablas_o_graficos.md) describen el efecto conjunto de O1+O2+O3; no identifican tres porcentajes causales independientes.

Los contadores deben leerse junto con las solicitudes completadas: una corrida más rápida puede efectuar más operaciones totales pero menos operaciones por petición. Las claves calientes del generador no equivalen a cache hits. Los recursos registrados antes/después son instantáneas y no máximos temporales.

## Límites y compromisos

1. Generador, API y servicios comparten recursos de un laboratorio Linux. `environment` y `executionNotes` de los JSON identifican las versiones y la emulación de CPU aplicada; no se mezclan estos resultados con mediciones de Windows.
2. La ventana de carga es breve, el dataset cabe en memoria y no se han medido WAN intercontinental, quórum, discos fríos a escala de terabytes ni failover de clústeres. No se deduce escalado lineal ni capacidad mundial.
3. El benchmark recorre Redis, MongoDB y Neo4j. El diagnóstico de los **seis** motores y la recuperación real son verificaciones separadas en [Hito 11](../../hito-11-conectividad/docs/evidencia/reporte_conectividad_inicial.md), no resultados de esta carga. La RAM visible de la VM varió entre instantáneas; una sola política de código cambia en O2, pero no se asegura aislamiento físico absoluto. Solo hay una repetición por perfil.
4. O1 añade conexiones; O2 compite por RAM Redis y admite desactualización hasta el TTL; O3 reduce la resolución de última actividad. La integridad funcional y los costos importan junto con la latencia.
5. El [Data Mart](integracion_data_mart.md) sigue siendo un diseño analítico, no un ETL físico ejecutado en IRIS. La caché operacional y el modelo analítico resuelven necesidades distintas.

Las mejoras futuras se limitan a lo fundamentado por este flujo: invalidar claves concretas al escribir y evaluar separación de sesiones/caché si la presión de memoria lo exige. La instancia de sesiones conserva `noeviction`; no se propone cambiarla a una política que pueda expulsar sesiones válidas.
